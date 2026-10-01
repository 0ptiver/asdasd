/** WebSocket transport for the multiplayer hub. Run with `npm run server` (PORT, DATA_FILE env vars). */
import { WebSocketServer } from 'ws';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Hub, type Account, type Conn, type Store } from './hub';
import { MAX_MSG_BYTES } from '../protocol';

export function fileStore(path: string): Store {
  return {
    load() {
      try {
        return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Record<string, Account>) : {};
      } catch {
        return {};
      }
    },
    save(accts) {
      mkdirSync(dirname(path), { recursive: true });
      const tmp = path + '.tmp';
      writeFileSync(tmp, JSON.stringify(accts));
      renameSync(tmp, path); // atomic replace
    },
  };
}

export function startServer(
  port: number,
  dataFile: string | null,
): { hub: Hub; close: () => void; port: number } {
  const hub = new Hub(dataFile ? fileStore(dataFile) : null);
  const wss = new WebSocketServer({ port, maxPayload: MAX_MSG_BYTES });
  wss.on('connection', (ws) => {
    const conn: Conn = {
      send: (m) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
      },
      close: () => ws.close(),
      bucket: { tokens: 40, at: Date.now() },
      badMsgs: 0,
    };
    ws.on('message', (data) => {
      try {
        hub.onMessage(conn, data.toString());
      } catch (e) {
        console.error('handler error', e);
        conn.send({ t: 'error', code: 'server_error' });
      }
    });
    ws.on('close', () => hub.onClose(conn));
    ws.on('error', () => hub.onClose(conn));
  });
  const presence = setInterval(() => hub.tickPresence(), 100);
  const saver = setInterval(() => hub.flush(), 5000);
  return {
    hub,
    port: (wss.address() as { port: number }).port,
    close: () => {
      clearInterval(presence);
      clearInterval(saver);
      hub.flush();
      wss.close();
    },
  };
}

// run directly: node/tsx src/net/server/index.ts
const isMain = process.argv[1] && /server[\\/]index\.(ts|js)$/.test(process.argv[1]);
if (isMain) {
  const port = Number(process.env.PORT ?? 8787);
  const s = startServer(port, process.env.DATA_FILE ?? 'data/accounts.json');
  console.log(`Timber Empire server listening on :${s.port}`);
  process.on('SIGINT', () => {
    s.close();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    s.close();
    process.exit(0);
  });
}

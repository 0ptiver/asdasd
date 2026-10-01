import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { Hub, type Conn } from '../src/net/server/hub';
import { startServer } from '../src/net/server/index';
import { parseClientMsg } from '../src/net/protocol';

function mkConn() {
  const inbox: any[] = [];
  const c: Conn = {
    send: (m) => inbox.push(m),
    close: () => {},
    bucket: { tokens: 40, at: Date.now() },
    badMsgs: 0,
  };
  return { c, inbox };
}
const send = (hub: Hub, c: Conn, m: unknown) => hub.onMessage(c, JSON.stringify(m));
const last = (inbox: any[], t: string) => [...inbox].reverse().find((m) => m.t === t);

function login(hub: Hub, id: string, name: string) {
  const { c, inbox } = mkConn();
  send(hub, c, { t: 'hello', id, token: '', name, world: 'main' });
  return { c, inbox, token: last(inbox, 'welcome').token as string };
}

describe('protocol validation', () => {
  it('rejects malformed / oversized / unknown messages', () => {
    expect(parseClientMsg('not json')).toBeNull();
    expect(parseClientMsg('{"t":"nope"}')).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'deposit', money: -5, items: {} }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'deposit', money: 1.5, items: {} }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'deposit', money: 5, items: { not_an_item: 3 } }))).toBeNull();
    expect(
      parseClientMsg(JSON.stringify({ t: 'pos', x: 1e9, y: 0, z: 0, yaw: 0, biome: 'meadow' })),
    ).toBeNull();
    expect(parseClientMsg('x'.repeat(70000))).toBeNull();
    expect(
      parseClientMsg(JSON.stringify({ t: 'deposit', money: 5, items: { plank_oak: 3, 'chair@oak': 1 } })),
    ).not.toBeNull();
  });
  it('sanitizes names and chat', () => {
    const m = parseClientMsg(
      JSON.stringify({ t: 'hello', id: 'a', token: '', name: '<b>Bob</b>', world: 'main' }),
    )!;
    expect((m as any).name).toBe('bBobb');
    const c = parseClientMsg(JSON.stringify({ t: 'chat', text: '  hi <script>alert(1)</script>\n there ' }))!;
    expect((c as any).text).not.toContain('<');
  });
});

describe('authoritative hub', () => {
  it('authenticates with a token and rejects a wrong token', () => {
    const hub = new Hub();
    const a = login(hub, 'u1', 'Alice');
    expect(a.token.length).toBeGreaterThan(20);
    const bad = mkConn();
    send(hub, bad.c, { t: 'hello', id: 'u1', token: 'wrong', name: 'Mallory', world: 'main' });
    expect(last(bad.inbox, 'error').code).toBe('bad_token');
    const again = mkConn();
    send(hub, again.c, { t: 'hello', id: 'u1', token: a.token, name: 'Alice', world: 'main' });
    expect(last(again.inbox, 'welcome')).toBeTruthy();
    expect(last(a.inbox, 'error')?.code).toBe('logged_in_elsewhere');
  });

  it('rate-limits floods', () => {
    const hub = new Hub();
    const a = login(hub, 'u1', 'Alice');
    for (let i = 0; i < 120; i++) send(hub, a.c, { t: 'ping', n: i });
    expect(a.inbox.some((m) => m.code === 'rate_limited')).toBe(true);
  });

  it('deposits are capped by reported earnings; withdrawals need funds', () => {
    const hub = new Hub();
    const a = login(hub, 'u1', 'Alice');
    send(hub, a.c, { t: 'deposit', money: 5_000_000, items: {} });
    expect(last(a.inbox, 'error').code).toBe('deposit_exceeds_reported_earnings');
    send(hub, a.c, { t: 'stats', earned: 100_000, trees: 5, prestige: 0, playedSec: 100, worth: 50_000 });
    send(hub, a.c, { t: 'deposit', money: 50_000, items: { plank_oak: 20 } });
    expect(last(a.inbox, 'wallet').money).toBe(50_000);
    send(hub, a.c, { t: 'withdraw', money: 60_000, items: {} });
    expect(last(a.inbox, 'error').code).toBe('insufficient_funds');
    send(hub, a.c, { t: 'withdraw', money: 10_000, items: { plank_oak: 5 } });
    expect(last(a.inbox, 'withdrawn').money).toBe(10_000);
    expect(hub.accounts.u1!.stash.plank_oak).toBe(15);
  });

  it('implausible stat growth is rejected', () => {
    const hub = new Hub();
    const a = login(hub, 'u1', 'Alice');
    send(hub, a.c, { t: 'stats', earned: 9e13, trees: 1, prestige: 0, playedSec: 1, worth: 1 });
    expect(last(a.inbox, 'error').code).toBe('implausible_stats');
  });

  function fund(
    hub: Hub,
    who: ReturnType<typeof login>,
    id: string,
    money: number,
    items: Record<string, number>,
  ) {
    send(hub, who.c, { t: 'stats', earned: money * 2, trees: 0, prestige: 0, playedSec: 1, worth: money });
    send(hub, who.c, { t: 'deposit', money, items });
    void id;
  }

  it('trades are atomic, taxed, and cannot duplicate or overdraw', () => {
    const hub = new Hub();
    const a = login(hub, 'u1', 'Alice');
    const b = login(hub, 'u2', 'Bob');
    fund(hub, a, 'u1', 10_000, { plank_oak: 50 });
    fund(hub, b, 'u2', 5_000, { plank_birch: 10 });
    send(hub, a.c, { t: 'trade', op: 'request', who: 'u2' });
    const tid = last(b.inbox, 'tradeRequest').tid;
    send(hub, b.c, { t: 'trade', op: 'accept', tid });
    send(hub, a.c, { t: 'trade', op: 'offer', tid, money: 0, items: { plank_oak: 40 } });
    send(hub, b.c, { t: 'trade', op: 'offer', tid, money: 2000, items: {} });
    // cannot offer what you don't have
    send(hub, b.c, { t: 'trade', op: 'offer', tid, money: 99_999, items: {} });
    expect(last(b.inbox, 'error').code).toBe('insufficient_funds');
    send(hub, a.c, { t: 'trade', op: 'confirm', tid });
    send(hub, b.c, { t: 'trade', op: 'confirm', tid });
    expect(last(a.inbox, 'tradeDone')).toBeTruthy();
    const A = hub.accounts.u1!,
      B = hub.accounts.u2!;
    expect(A.stash.plank_oak).toBe(10);
    expect(B.stash.plank_oak).toBe(40);
    expect(A.money).toBe(10_000 + 2000 - Math.floor(2000 * 0.05)); // seller of money pays 5% tax
    expect(B.money).toBe(5_000 - 2000);
    // replaying the confirm does nothing
    send(hub, a.c, { t: 'trade', op: 'confirm', tid });
    expect(last(a.inbox, 'error').code).toBe('no_such_trade');
    expect(A.money + B.money).toBe(15_000 - 100);
  });

  it('changing an offer resets confirmations (no bait and switch)', () => {
    const hub = new Hub();
    const a = login(hub, 'u1', 'Alice');
    const b = login(hub, 'u2', 'Bob');
    fund(hub, a, 'u1', 1000, { plank_oak: 10 });
    fund(hub, b, 'u2', 1000, {});
    send(hub, a.c, { t: 'trade', op: 'request', who: 'u2' });
    const tid = last(b.inbox, 'tradeRequest').tid;
    send(hub, b.c, { t: 'trade', op: 'accept', tid });
    send(hub, a.c, { t: 'trade', op: 'offer', tid, money: 0, items: { plank_oak: 1 } });
    send(hub, b.c, { t: 'trade', op: 'confirm', tid });
    send(hub, a.c, { t: 'trade', op: 'offer', tid, money: 0, items: { plank_oak: 10 } }); // A changes after B confirmed
    send(hub, a.c, { t: 'trade', op: 'confirm', tid });
    expect(last(a.inbox, 'tradeDone')).toBeUndefined();
    expect(hub.accounts.u1!.stash.plank_oak).toBe(10);
  });

  it('blocked players cannot trade, whisper or visit; private plots need friendship', () => {
    const hub = new Hub();
    const a = login(hub, 'u1', 'Alice');
    const b = login(hub, 'u2', 'Bob');
    send(hub, a.c, { t: 'social', op: 'block', who: 'u2' });
    send(hub, b.c, { t: 'trade', op: 'request', who: 'u1' });
    expect(last(b.inbox, 'error').code).toBe('player_unavailable');
    send(hub, b.c, { t: 'chat', text: 'hello', to: 'u1' });
    expect(last(b.inbox, 'error').code).toBe('player_unavailable');
    send(hub, a.c, { t: 'plot', plot: 'hub1', parts: [['wall', 0, 0, 0, 0, 1, 1, 1, 0, 0]] });
    send(hub, b.c, { t: 'visit', owner: 'u1' });
    expect(last(b.inbox, 'error').code).toBe('visit_denied');
    send(hub, a.c, { t: 'social', op: 'unblock', who: 'u2' });
    send(hub, a.c, { t: 'social', op: 'public', value: false });
    send(hub, b.c, { t: 'visit', owner: 'u1' });
    expect(last(b.inbox, 'error').code).toBe('visit_denied');
    send(hub, a.c, { t: 'social', op: 'friend', who: 'u2' });
    send(hub, b.c, { t: 'visit', owner: 'u1' });
    expect(last(b.inbox, 'plotData').plots.hub1.length).toBe(1);
  });

  it('rubber-bands impossible movement', () => {
    const hub = new Hub();
    const a = login(hub, 'u1', 'Alice');
    send(hub, a.c, { t: 'pos', x: 0, y: 5, z: 0, yaw: 0, biome: 'meadow', moving: 0, vehicle: '' });
    send(hub, a.c, { t: 'pos', x: 1400, y: 5, z: 1400, yaw: 0, biome: 'tropics', moving: 0, vehicle: '' });
    expect(last(a.inbox, 'rubberband')).toBeTruthy();
    send(hub, a.c, {
      t: 'pos',
      x: 1400,
      y: 5,
      z: 1400,
      yaw: 0,
      biome: 'tropics',
      moving: 0,
      vehicle: '',
      tp: true,
    });
    expect(hub.conns.size).toBe(1);
  });

  it('leaderboards sort by value', () => {
    const hub = new Hub();
    const a = login(hub, 'u1', 'Alice');
    const b = login(hub, 'u2', 'Bob');
    send(hub, a.c, { t: 'stats', earned: 1000, trees: 9, prestige: 0, playedSec: 1, worth: 10 });
    send(hub, b.c, { t: 'stats', earned: 5000, trees: 3, prestige: 0, playedSec: 1, worth: 10 });
    send(hub, a.c, { t: 'lb', board: 'earned' });
    expect(last(a.inbox, 'leaderboard').rows[0].name).toBe('Bob');
    send(hub, a.c, { t: 'lb', board: 'trees' });
    expect(last(a.inbox, 'leaderboard').rows[0].name).toBe('Alice');
  });
});

describe('websocket transport', () => {
  it('serves real clients end to end', async () => {
    const srv = startServer(0, null);
    const open = (): Promise<{ ws: WebSocket; msgs: any[] }> =>
      new Promise((res) => {
        const ws = new WebSocket(`ws://127.0.0.1:${srv.port}`);
        const msgs: any[] = [];
        ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
        ws.on('open', () => res({ ws, msgs }));
      });
    const a = await open();
    a.ws.send(JSON.stringify({ t: 'hello', id: 'w1', token: '', name: 'Wendy', world: 'main' }));
    const b = await open();
    b.ws.send(JSON.stringify({ t: 'hello', id: 'w2', token: '', name: 'Will', world: 'main' }));
    await new Promise((r) => setTimeout(r, 150));
    a.ws.send(JSON.stringify({ t: 'chat', text: 'hello world' }));
    await new Promise((r) => setTimeout(r, 150));
    expect(b.msgs.some((m) => m.t === 'chat' && m.text === 'hello world' && m.from === 'Wendy')).toBe(true);
    a.ws.close();
    b.ws.close();
    srv.close();
  });
});

/** Browser multiplayer client. The single-player game never needs this; it is entirely opt-in. */
import type { Game } from '../core/game';
import type { ItemMap } from './protocol';
import { itemName } from '../systems/itemValue';

export interface RemotePlayer {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  biome: string;
  moving: number;
  vehicle: string;
  /** smoothed render position */
  rx?: number;
  ry?: number;
  rz?: number;
}
export interface ChatLine {
  from: string;
  fromId?: string;
  text: string;
  whisper?: boolean;
  toName?: string;
  at: number;
}
export interface TradeView {
  tid: string;
  with: string;
  yours: { money: number; items: ItemMap };
  theirs: { money: number; items: ItemMap };
  youConfirmed: boolean;
  theyConfirmed: boolean;
  tax: number;
}

type Pending = { kind: 'deposit'; money: number; items: ItemMap };

export class NetClient {
  ws: WebSocket | null = null;
  status: 'offline' | 'connecting' | 'online' = 'offline';
  url = '';
  me: { id: string; name: string } | null = null;
  money = 0;
  stash: ItemMap = {};
  players = new Map<string, RemotePlayer>();
  chat: ChatLine[] = [];
  trade: TradeView | null = null;
  incomingTrade: { tid: string; from: string; fromId: string } | null = null;
  leaderboard: { board: string; rows: { id: string; name: string; value: number }[] } | null = null;
  friends: { id: string; name: string }[] = [];
  blocked: { id: string; name: string }[] = [];
  publicPlots = true;
  lastError = '';
  private pending: Pending[] = [];
  private posT = 0;
  private statsT = 0;
  private plotT = 0;
  private lastPlotSig = '';
  tradeTax = 0.05;
  onVisit: ((owner: string, plots: Record<string, unknown[]>) => void) | null = null;

  constructor(private game: Game) {}

  get online(): boolean {
    return this.status === 'online';
  }

  connect(url: string): void {
    if (this.ws) this.disconnect();
    this.url = url;
    this.status = 'connecting';
    this.game.bump(true);
    let id = '',
      token = '';
    try {
      id = localStorage.getItem('te-net-id') ?? '';
      token = localStorage.getItem('te-net-token') ?? '';
    } catch {
      /* storage unavailable */
    }
    if (!id) {
      id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(
        /[^\w-]/g,
        '',
      );
      try {
        localStorage.setItem('te-net-id', id);
      } catch {
        /* ignore */
      }
    }
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.status = 'offline';
      this.lastError = 'invalid server address';
      this.game.bump(true);
      return;
    }
    this.ws = ws;
    ws.onopen = () =>
      this.send({
        t: 'hello',
        id,
        token,
        name: (this.game.state?.name ?? 'Lumberjack').replace(/[^\w \-.]/g, '').slice(0, 16) || 'Lumberjack',
        world: 'main',
      });
    ws.onmessage = (e) => {
      try {
        this.handle(JSON.parse(String(e.data)));
      } catch {
        /* ignore bad frames */
      }
    };
    ws.onclose = () => {
      this.status = 'offline';
      this.players.clear();
      this.trade = null;
      this.ws = null;
      this.game.bump(true);
    };
    ws.onerror = () => {
      this.lastError = 'could not reach the server';
    };
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.status = 'offline';
    this.players.clear();
  }

  send(m: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  private handle(m: any): void {
    const g = this.game;
    switch (m.t) {
      case 'welcome':
        this.status = 'online';
        this.me = { id: m.id, name: m.name };
        this.money = m.money;
        this.stash = m.stash;
        this.friends = (m.friends as string[]).map((id) => ({ id, name: id }));
        this.blocked = (m.blocked as string[]).map((id) => ({ id, name: id }));
        this.publicPlots = m.publicPlots;
        this.tradeTax = m.tradeTax ?? 0.05;
        try {
          localStorage.setItem('te-net-token', m.token);
        } catch {
          /* ignore */
        }
        g.bus.emit('notify', { text: `Connected to multiplayer as ${m.name}`, kind: 'good' });
        this.send({ t: 'social', op: 'public', value: this.publicPlots });
        this.shareAllPlots(true);
        break;
      case 'players': {
        const seen = new Set<string>();
        for (const p of m.players as RemotePlayer[]) {
          seen.add(p.id);
          const old = this.players.get(p.id);
          this.players.set(p.id, { ...p, rx: old?.rx ?? p.x, ry: old?.ry ?? p.y, rz: old?.rz ?? p.z });
        }
        for (const id of [...this.players.keys()]) if (!seen.has(id)) this.players.delete(id);
        break;
      }
      case 'join':
        g.bus.emit('notify', { text: `${m.name} joined`, kind: 'info' });
        break;
      case 'leave':
        this.players.delete(m.id);
        break;
      case 'chat':
        this.chat.push({
          from: m.from,
          fromId: m.fromId,
          text: m.text,
          whisper: m.whisper,
          toName: m.toName,
          at: Date.now(),
        });
        if (this.chat.length > 80) this.chat.shift();
        break;
      case 'wallet':
        this.money = m.money;
        this.stash = m.stash;
        this.pending.shift();
        break;
      case 'withdrawn': {
        const sim = g.sim;
        if (sim) {
          sim.econ.earn(m.money, 'withdraw');
          for (const [k, n] of Object.entries(m.items as ItemMap)) sim.inventory.add(k, n);
          g.bus.emit('notify', { text: 'Withdrew from the trading post', kind: 'good' });
        }
        break;
      }
      case 'tradeRequest':
        this.incomingTrade = { tid: m.tid, from: m.from, fromId: m.fromId };
        g.bus.emit('notify', {
          text: `${m.from} wants to trade — open the Multiplayer panel`,
          kind: 'money',
        });
        break;
      case 'tradePending':
        g.bus.emit('notify', { text: `Trade request sent to ${m.to}`, kind: 'info' });
        break;
      case 'trade':
        this.trade = m as TradeView;
        this.incomingTrade = null;
        break;
      case 'tradeDone':
        g.bus.emit('notify', {
          text: `Trade complete${m.taxPaid ? ` (tax $${m.taxPaid})` : ''}`,
          kind: 'money',
        });
        this.trade = null;
        break;
      case 'tradeEnded':
        g.bus.emit('notify', { text: `Trade ended: ${m.reason}`, kind: 'info' });
        this.trade = null;
        this.incomingTrade = null;
        break;
      case 'leaderboard':
        this.leaderboard = { board: m.board, rows: m.rows };
        break;
      case 'social':
        this.friends = m.friends;
        this.blocked = m.blocked;
        this.publicPlots = m.publicPlots;
        break;
      case 'plotData':
        this.onVisit?.(m.owner, m.plots);
        break;
      case 'rubberband':
        g.sim?.player.teleport(m.x, m.z, m.y);
        g.bus.emit('notify', { text: 'Movement rejected by the server', kind: 'bad' });
        break;
      case 'error':
        this.lastError = m.code;
        if (String(m.code).startsWith('deposit') && this.pending.length) {
          const p = this.pending.shift()!;
          // refund the optimistic local removal
          if (g.sim) {
            g.sim.econ.earn(p.money, 'refund');
            for (const [k, n] of Object.entries(p.items)) g.sim.inventory.add(k, n);
          }
        }
        if (m.code !== 'rate_limited')
          g.bus.emit('notify', { text: `Server: ${String(m.code).replace(/_/g, ' ')}`, kind: 'bad' });
        break;
    }
    g.bump(true);
  }

  // ------------------------------------------------------------ gameplay hooks
  /** Called every sim tick from Game while playing. */
  tick(dt: number): void {
    if (!this.online || !this.game.sim) return;
    const sim = this.game.sim;
    const p = sim.player;
    this.posT += dt;
    if (this.posT >= 0.2) {
      this.posT = 0;
      const v = sim.vehicles.current;
      this.send({
        t: 'pos',
        x: p.x,
        y: p.y,
        z: p.z,
        yaw: p.yaw,
        biome: sim.biome.current.id,
        moving: p.moveSpeed,
        vehicle: v?.def.id ?? '',
        tp: this.teleported,
      });
      this.teleported = false;
    }
    this.statsT += dt;
    if (this.statsT >= 30) {
      this.statsT = 0;
      this.reportStats();
    }
    this.plotT += dt;
    if (this.plotT >= 6) {
      this.plotT = 0;
      this.shareAllPlots(false);
    }
  }
  teleported = false;

  reportStats(): void {
    const st = this.game.state;
    if (!st) return;
    const worth = st.money + Object.values(st.plots).reduce((a, p) => a + p.parts.length * 40, 0);
    this.send({
      t: 'stats',
      earned: Math.floor(st.totalEarned + (st.prestige.level > 0 ? 0 : 0)),
      trees: st.stats.trees ?? 0,
      prestige: st.prestige.level,
      playedSec: Math.floor(st.playedSec),
      worth: Math.floor(worth),
    });
  }

  shareAllPlots(force: boolean): void {
    const st = this.game.state;
    if (!st) return;
    const sig = Object.entries(st.plots)
      .map(([k, v]) => k + v.parts.length)
      .join(',');
    if (!force && sig === this.lastPlotSig) return;
    this.lastPlotSig = sig;
    for (const [id, p] of Object.entries(st.plots))
      this.send({ t: 'plot', plot: id, parts: p.parts.slice(0, 800) });
  }

  /** Move money/items from the local save into the server stash (optimistic; refunded on rejection). */
  deposit(money: number, items: ItemMap): boolean {
    const sim = this.game.sim;
    if (!sim || !this.online) return false;
    if (money > sim.state.money) return false;
    for (const [k, n] of Object.entries(items)) if (!sim.inventory.has(k, n)) return false;
    this.reportStats();
    if (money) sim.econ.spend(money, 'deposit');
    for (const [k, n] of Object.entries(items)) sim.inventory.remove(k, n);
    this.pending.push({ kind: 'deposit', money, items });
    this.send({ t: 'deposit', money, items });
    return true;
  }
  withdraw(money: number, items: ItemMap): void {
    this.send({ t: 'withdraw', money, items });
  }
  say(text: string, to?: string): void {
    this.send({ t: 'chat', text, to });
  }
  requestLeaderboard(board: string): void {
    this.send({ t: 'lb', board });
  }
  describeItems(m: ItemMap): string {
    return (
      Object.entries(m)
        .map(([k, n]) => `${n}× ${itemName(k)}`)
        .join(', ') || 'nothing'
    );
  }
}

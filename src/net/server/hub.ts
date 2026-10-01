/**
 * Transport-independent multiplayer hub. All state mutations that matter (money, stash, trades, ownership, social
 * lists) happen here, synchronously — so every operation is atomic — and are validated before being applied.
 */
import { createHash, randomBytes } from 'node:crypto';
import { CONFIG } from '../../config';
import { parseClientMsg, type ClientMsg, type ItemMap } from '../protocol';
import { ITEM_BY_ID } from '../../data/items';
import { baseItemValue } from '../../systems/itemValue';

export interface Account {
  id: string;
  name: string;
  tokenHash: string;
  money: number;
  stash: ItemMap;
  friends: string[];
  blocked: string[];
  publicPlots: boolean;
  stats: { earned: number; trees: number; prestige: number; playedSec: number; worth: number };
  reported: { at: number; earned: number };
  depositedMoney: number;
  plots: Record<string, unknown[]>;
  createdAt: number;
  lastSeen: number;
}

export interface Conn {
  send(msg: unknown): void;
  close(): void;
  /** populated after hello */
  acct?: Account;
  world?: string;
  pos?: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    biome: string;
    moving: number;
    vehicle: string;
    at: number;
  };
  bucket: { tokens: number; at: number };
  badMsgs: number;
}

interface Trade {
  id: string;
  a: string;
  b: string;
  offer: Record<string, { money: number; items: ItemMap }>;
  confirmed: Set<string>;
  accepted: boolean;
  expires: number;
}

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
const RATE = { capacity: 40, perSec: 20 };
export const TRADE_TAX = CONFIG.market.tradeTax;
const MAX_SPEED = 80; // m/s (aircraft); teleports require the tp flag and are rate-limited
const itemsValue = (m: ItemMap) => Object.entries(m).reduce((s, [k, n]) => s + baseItemValue(k) * n, 0);

export interface Store {
  load(): Record<string, Account>;
  save(accts: Record<string, Account>): void;
}

export class Hub {
  accounts: Record<string, Account>;
  conns = new Set<Conn>();
  trades = new Map<string, Trade>();
  private now: () => number;

  constructor(
    private store: Store | null = null,
    now: () => number = () => Date.now(),
  ) {
    this.accounts = store?.load() ?? {};
    this.now = now;
  }

  // ------------------------------------------------------------ entry point
  onMessage(c: Conn, raw: string): void {
    // token bucket rate limit
    const t = this.now();
    c.bucket.tokens = Math.min(RATE.capacity, c.bucket.tokens + ((t - c.bucket.at) / 1000) * RATE.perSec);
    c.bucket.at = t;
    if (c.bucket.tokens < 1) {
      if (++c.badMsgs > 200) c.close();
      return this.err(c, 'rate_limited');
    }
    c.bucket.tokens -= 1;
    const m = parseClientMsg(raw);
    if (!m) {
      if (++c.badMsgs > 25) c.close();
      return this.err(c, 'bad_message');
    }
    if (m.t === 'hello') return this.hello(c, m);
    if (!c.acct) return this.err(c, 'not_authenticated');
    c.acct.lastSeen = t;
    switch (m.t) {
      case 'pos':
        return this.pos(c, m);
      case 'chat':
        return this.chat(c, m);
      case 'deposit':
        return this.deposit(c, m);
      case 'withdraw':
        return this.withdraw(c, m);
      case 'trade':
        return this.trade(c, m);
      case 'stats':
        return this.stats(c, m);
      case 'plot':
        return this.plot(c, m);
      case 'visit':
        return this.visit(c, m);
      case 'social':
        return this.social(c, m);
      case 'lb':
        return this.leaderboard(c, m.board);
      case 'ping':
        return c.send({ t: 'pong', n: m.n });
    }
  }

  onClose(c: Conn): void {
    this.conns.delete(c);
    if (c.acct) {
      // cancel trades involving this player
      for (const tr of [...this.trades.values()])
        if (tr.a === c.acct.id || tr.b === c.acct.id) this.endTrade(tr, 'partner_left');
      this.broadcast(c.world!, { t: 'leave', id: c.acct.id }, c);
      this.persist();
    }
  }

  private err(c: Conn, code: string): void {
    c.send({ t: 'error', code });
  }

  // ------------------------------------------------------------ session
  private hello(c: Conn, m: Extract<ClientMsg, { t: 'hello' }>): void {
    let a = this.accounts[m.id];
    let token = m.token;
    if (!a) {
      token = randomBytes(24).toString('hex');
      a = this.accounts[m.id] = {
        id: m.id,
        name: m.name,
        tokenHash: hashToken(token),
        money: 0,
        stash: {},
        friends: [],
        blocked: [],
        publicPlots: true,
        stats: { earned: 0, trees: 0, prestige: 0, playedSec: 0, worth: 0 },
        reported: { at: this.now(), earned: 0 },
        depositedMoney: 0,
        plots: {},
        createdAt: this.now(),
        lastSeen: this.now(),
      };
    } else if (hashToken(token) !== a.tokenHash) {
      return (this.err(c, 'bad_token'), c.close());
    }
    // one live connection per account
    for (const o of this.conns)
      if (o.acct?.id === a.id && o !== c) {
        o.send({ t: 'error', code: 'logged_in_elsewhere' });
        o.close();
        this.conns.delete(o);
      }
    a.name = m.name;
    c.acct = a;
    c.world = m.world;
    this.conns.add(c);
    c.send({
      t: 'welcome',
      id: a.id,
      token,
      name: a.name,
      money: a.money,
      stash: a.stash,
      friends: a.friends,
      blocked: a.blocked,
      publicPlots: a.publicPlots,
      tradeTax: TRADE_TAX,
    });
    this.sendPlayers(c);
    this.broadcast(c.world!, { t: 'join', id: a.id, name: a.name }, c);
  }

  private visible(c: Conn): Conn[] {
    return [...this.conns].filter((o) => o.acct && o.world === c.world);
  }
  private broadcast(world: string, msg: unknown, except?: Conn): void {
    for (const o of this.conns) if (o !== except && o.world === world && o.acct) o.send(msg);
  }

  /** Presence snapshot (call ~10 Hz from the transport). */
  tickPresence(): void {
    const byWorld = new Map<string, Conn[]>();
    for (const c of this.conns)
      if (c.acct && c.pos) (byWorld.get(c.world!) ?? byWorld.set(c.world!, []).get(c.world!)!).push(c);
    for (const [, list] of byWorld) {
      const players = list.map((c) => ({ id: c.acct!.id, name: c.acct!.name, ...c.pos!, at: undefined }));
      for (const c of list)
        c.send({
          t: 'players',
          players: players.filter((p) => p.id !== c.acct!.id && !this.blockedBetween(c.acct!, p.id)),
        });
    }
  }
  private sendPlayers(c: Conn): void {
    c.send({
      t: 'players',
      players: this.visible(c)
        .filter((o) => o !== c && o.pos && !this.blockedBetween(c.acct!, o.acct!.id))
        .map((o) => ({ id: o.acct!.id, name: o.acct!.name, ...o.pos! })),
    });
  }
  private blockedBetween(a: Account, bId: string): boolean {
    const b = this.accounts[bId];
    return a.blocked.includes(bId) || !!b?.blocked.includes(a.id);
  }

  // ------------------------------------------------------------ movement sanity
  private pos(c: Conn, m: Extract<ClientMsg, { t: 'pos' }>): void {
    const t = this.now();
    const prev = c.pos;
    if (prev && !m.tp) {
      const dt = Math.max(0.05, (t - prev.at) / 1000);
      const d = Math.hypot(m.x - prev.x, m.z - prev.z, (m.y - prev.y) * 0.3);
      if (d / dt > MAX_SPEED * 1.5 + 30 && d > 60) {
        // impossible movement: snap them back
        c.send({ t: 'rubberband', x: prev.x, y: prev.y, z: prev.z });
        return;
      }
    }
    c.pos = {
      x: m.x,
      y: m.y,
      z: m.z,
      yaw: m.yaw,
      biome: m.biome,
      moving: m.moving,
      vehicle: m.vehicle,
      at: t,
    };
  }

  // ------------------------------------------------------------ chat
  private chatLast = new Map<string, number>();
  private chat(c: Conn, m: Extract<ClientMsg, { t: 'chat' }>): void {
    const a = c.acct!;
    const t = this.now();
    if (t - (this.chatLast.get(a.id) ?? 0) < 700) return this.err(c, 'chat_too_fast');
    this.chatLast.set(a.id, t);
    const msg = { t: 'chat', from: a.name, fromId: a.id, text: m.text, to: m.to };
    if (m.to) {
      const target = [...this.conns].find((o) => o.acct?.id === m.to || o.acct?.name === m.to);
      if (!target?.acct || this.blockedBetween(a, target.acct.id)) return this.err(c, 'player_unavailable');
      target.send({ ...msg, whisper: true });
      c.send({ ...msg, whisper: true, toName: target.acct.name });
      return;
    }
    for (const o of this.visible(c)) if (!this.blockedBetween(a, o.acct!.id)) o.send(msg);
  }

  // ------------------------------------------------------------ wallet / stash
  /** Sanity: you can't deposit more money than you've reported earning (minus what you've already moved in). */
  private deposit(c: Conn, m: Extract<ClientMsg, { t: 'deposit' }>): void {
    const a = c.acct!;
    const budget = a.stats.earned * 1 + 5000 - a.depositedMoney;
    if (m.money > budget) return this.err(c, 'deposit_exceeds_reported_earnings');
    const itemVal = itemsValue(m.items);
    // items are limited by wealth too (can't conjure a fortune out of thin air)
    if (itemVal > Math.max(50_000, a.stats.worth * 2)) return this.err(c, 'deposit_value_too_high');
    a.money += m.money;
    a.depositedMoney += m.money + itemVal * 0.5;
    for (const [k, n] of Object.entries(m.items)) a.stash[k] = (a.stash[k] ?? 0) + n;
    this.pushWallet(c);
    this.persist();
  }
  private withdraw(c: Conn, m: Extract<ClientMsg, { t: 'withdraw' }>): void {
    const a = c.acct!;
    if (m.money > a.money) return this.err(c, 'insufficient_funds');
    for (const [k, n] of Object.entries(m.items))
      if ((a.stash[k] ?? 0) < n) return this.err(c, 'insufficient_items');
    a.money -= m.money;
    a.depositedMoney = Math.max(0, a.depositedMoney - m.money);
    for (const [k, n] of Object.entries(m.items)) {
      a.stash[k]! -= n;
      if (a.stash[k]! <= 0) delete a.stash[k];
    }
    c.send({ t: 'withdrawn', money: m.money, items: m.items });
    this.pushWallet(c);
    this.persist();
  }
  private pushWallet(c: Conn): void {
    c.send({ t: 'wallet', money: c.acct!.money, stash: c.acct!.stash });
  }

  // ------------------------------------------------------------ trading (escrow-free, atomic swap at confirmation)
  private connOf(id: string): Conn | undefined {
    return [...this.conns].find((o) => o.acct?.id === id);
  }
  private trade(c: Conn, m: Extract<ClientMsg, { t: 'trade' }>): void {
    const a = c.acct!;
    const t = this.now();
    for (const [id, tr] of this.trades)
      if (tr.expires < t) {
        this.endTrade(tr, 'timeout');
        this.trades.delete(id);
      }
    switch (m.op) {
      case 'request': {
        const other = m.who ? this.connOf(m.who) : undefined;
        if (!other?.acct || other === c || other.world !== c.world) return this.err(c, 'player_unavailable');
        if (this.blockedBetween(a, other.acct.id)) return this.err(c, 'player_unavailable');
        for (const tr of this.trades.values())
          if ([tr.a, tr.b].some((x) => x === a.id || x === other.acct!.id))
            return this.err(c, 'already_trading');
        const id = randomBytes(6).toString('hex');
        this.trades.set(id, {
          id,
          a: a.id,
          b: other.acct.id,
          offer: { [a.id]: { money: 0, items: {} }, [other.acct.id]: { money: 0, items: {} } },
          confirmed: new Set(),
          accepted: false,
          expires: t + 5 * 60_000,
        });
        other.send({ t: 'tradeRequest', tid: id, from: a.name, fromId: a.id });
        c.send({ t: 'tradePending', tid: id, to: other.acct.name });
        return;
      }
      case 'accept': {
        const tr = m.tid ? this.trades.get(m.tid) : undefined;
        if (!tr || tr.b !== a.id || tr.accepted) return this.err(c, 'no_such_trade');
        tr.accepted = true;
        this.pushTrade(tr);
        return;
      }
      case 'decline':
      case 'cancel': {
        const tr = m.tid ? this.trades.get(m.tid) : undefined;
        if (!tr || (tr.a !== a.id && tr.b !== a.id)) return this.err(c, 'no_such_trade');
        return this.endTrade(tr, m.op === 'decline' ? 'declined' : 'cancelled');
      }
      case 'offer': {
        const tr = m.tid ? this.trades.get(m.tid) : undefined;
        if (!tr || !tr.accepted || (tr.a !== a.id && tr.b !== a.id)) return this.err(c, 'no_such_trade');
        const money = m.money ?? 0,
          items = m.items ?? {};
        if (money > a.money) return this.err(c, 'insufficient_funds');
        for (const [k, n] of Object.entries(items))
          if ((a.stash[k] ?? 0) < n) return this.err(c, 'insufficient_items');
        tr.offer[a.id] = { money, items };
        tr.confirmed.clear(); // any change resets confirmations
        this.pushTrade(tr);
        return;
      }
      case 'confirm': {
        const tr = m.tid ? this.trades.get(m.tid) : undefined;
        if (!tr || !tr.accepted || (tr.a !== a.id && tr.b !== a.id)) return this.err(c, 'no_such_trade');
        tr.confirmed.add(a.id);
        if (tr.confirmed.size === 2) return this.commitTrade(tr);
        this.pushTrade(tr);
        return;
      }
    }
  }

  private pushTrade(tr: Trade): void {
    for (const id of [tr.a, tr.b]) {
      const c = this.connOf(id);
      const other = id === tr.a ? tr.b : tr.a;
      c?.send({
        t: 'trade',
        tid: tr.id,
        with: this.accounts[other]?.name,
        yours: tr.offer[id],
        theirs: tr.offer[other],
        youConfirmed: tr.confirmed.has(id),
        theyConfirmed: tr.confirmed.has(other),
        tax: TRADE_TAX,
      });
    }
  }

  /** Atomic: re-validate both sides, apply tax, swap. Either everything happens or nothing does. */
  private commitTrade(tr: Trade): void {
    const A = this.accounts[tr.a],
      B = this.accounts[tr.b];
    if (!A || !B) return this.endTrade(tr, 'invalid');
    const oa = tr.offer[A.id]!,
      ob = tr.offer[B.id]!;
    const taxA = Math.floor(oa.money * TRADE_TAX),
      taxB = Math.floor(ob.money * TRADE_TAX);
    const valid = (acct: Account, o: { money: number; items: ItemMap }) =>
      acct.money >= o.money && Object.entries(o.items).every(([k, n]) => (acct.stash[k] ?? 0) >= n);
    if (!valid(A, oa) || !valid(B, ob)) return this.endTrade(tr, 'insufficient_assets');
    A.money -= oa.money;
    B.money -= ob.money;
    A.money += ob.money - taxB;
    B.money += oa.money - taxA;
    const move = (from: Account, to: Account, items: ItemMap) => {
      for (const [k, n] of Object.entries(items)) {
        from.stash[k]! -= n;
        if (from.stash[k]! <= 0) delete from.stash[k];
        to.stash[k] = (to.stash[k] ?? 0) + n;
      }
    };
    move(A, B, oa.items);
    move(B, A, ob.items);
    this.trades.delete(tr.id);
    for (const id of [tr.a, tr.b]) {
      const c = this.connOf(id);
      c?.send({ t: 'tradeDone', tid: tr.id, taxPaid: id === tr.a ? taxA : taxB });
      if (c) this.pushWallet(c);
    }
    this.persist();
  }

  private endTrade(tr: Trade, reason: string): void {
    this.trades.delete(tr.id);
    for (const id of [tr.a, tr.b]) this.connOf(id)?.send({ t: 'tradeEnded', tid: tr.id, reason });
  }

  // ------------------------------------------------------------ stats, leaderboards
  private stats(c: Conn, m: Extract<ClientMsg, { t: 'stats' }>): void {
    const a = c.acct!;
    const t = this.now();
    const hours = Math.max(1 / 60, (t - a.reported.at) / 3.6e6);
    // earned can't grow faster than a generous rate (prestige scales it) — prevents trivially forged leaderboard entries
    const maxGrowth = 50_000_000 * (1 + m.prestige) * hours + 1_000_000;
    if (m.earned - a.stats.earned > maxGrowth) return this.err(c, 'implausible_stats');
    if (m.earned < a.stats.earned && m.prestige <= a.stats.prestige) m.earned = a.stats.earned;
    a.stats = {
      earned: m.earned,
      trees: m.trees,
      prestige: m.prestige,
      playedSec: m.playedSec,
      worth: m.worth,
    };
    a.reported = { at: t, earned: m.earned };
  }
  leaderboard(c: Conn, board: string): void {
    const key =
      board === 'trees'
        ? 'trees'
        : board === 'prestige'
          ? 'prestige'
          : board === 'worth'
            ? 'worth'
            : 'earned';
    const rows = Object.values(this.accounts)
      .map((a) => ({ id: a.id, name: a.name, value: a.stats[key as keyof Account['stats']] }))
      .sort((x, y) => y.value - x.value)
      .slice(0, 20);
    c.send({ t: 'leaderboard', board: key, rows });
  }

  // ------------------------------------------------------------ plots & visiting
  private plot(c: Conn, m: Extract<ClientMsg, { t: 'plot' }>): void {
    c.acct!.plots[m.plot] = m.parts;
    this.persist();
  }
  private visit(c: Conn, m: Extract<ClientMsg, { t: 'visit' }>): void {
    const owner = this.accounts[m.owner] ?? Object.values(this.accounts).find((x) => x.name === m.owner);
    const me = c.acct!;
    if (!owner) return this.err(c, 'player_unknown');
    if (owner.blocked.includes(me.id)) return this.err(c, 'visit_denied');
    // private plots: only the owner's friends (whitelist) may visit
    if (!owner.publicPlots && !owner.friends.includes(me.id) && owner.id !== me.id)
      return this.err(c, 'visit_denied');
    c.send({ t: 'plotData', owner: owner.name, ownerId: owner.id, plots: owner.plots });
  }

  private social(c: Conn, m: Extract<ClientMsg, { t: 'social' }>): void {
    const a = c.acct!;
    const target = m.who
      ? (this.accounts[m.who] ?? Object.values(this.accounts).find((x) => x.name === m.who))
      : undefined;
    const add = (arr: string[], id: string) => arr.includes(id) || arr.length >= 100 || arr.push(id);
    const rem = (arr: string[], id: string) => {
      const i = arr.indexOf(id);
      if (i >= 0) arr.splice(i, 1);
    };
    switch (m.op) {
      case 'public':
        a.publicPlots = !!m.value;
        break;
      case 'friend':
        if (target && target.id !== a.id) {
          add(a.friends, target.id);
          rem(a.blocked, target.id);
        }
        break;
      case 'unfriend':
        if (target) rem(a.friends, target.id);
        break;
      case 'block':
        if (target && target.id !== a.id) {
          add(a.blocked, target.id);
          rem(a.friends, target.id);
        }
        break;
      case 'unblock':
        if (target) rem(a.blocked, target.id);
        break;
    }
    c.send({
      t: 'social',
      friends: a.friends.map((id) => ({ id, name: this.accounts[id]?.name ?? id })),
      blocked: a.blocked.map((id) => ({ id, name: this.accounts[id]?.name ?? id })),
      publicPlots: a.publicPlots,
    });
    this.persist();
  }

  // ------------------------------------------------------------ persistence
  private dirty = false;
  persist(): void {
    this.dirty = true;
  }
  flush(): void {
    if (this.dirty && this.store) {
      this.store.save(this.accounts);
      this.dirty = false;
    }
  }
}
void ITEM_BY_ID;

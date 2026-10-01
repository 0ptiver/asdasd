import type { Sim, System } from '../core/sim';
import { ITEM_BY_ID } from '../data/items';
import { AXE_BY_ID } from '../data/axes';
import { CONFIG } from '../config';
import type { AxeInst, ItemStack } from '../save/schema';
import { ITEM_VALUE_HOOK } from './itemValue';

/** Slot inventory, hotbar and axe instances. */
export class InventorySystem implements System {
  readonly name = 'inventory';
  constructor(private sim: Sim) {}
  update(): void {}

  get inv() {
    return this.sim.state.inv;
  }

  capacity(): number {
    const st = this.sim.state;
    let n = 24;
    const bp = st.gear.backpack;
    if (bp) n += ITEM_BY_ID[bp]?.buff?.carry ?? 0;
    return n;
  }

  /** Make sure slot array matches capacity (gear changes). */
  syncSize(): void {
    const cap = this.capacity();
    const inv = this.inv;
    while (inv.slots.length < cap) inv.slots.push(null);
    inv.size = cap;
  }

  count(id: string): number {
    let n = 0;
    for (const s of this.inv.slots) if (s && s.id === id) n += s.n;
    return n;
  }

  /** Adds items; returns how many did NOT fit. */
  add(id: string, n = 1): number {
    const def = ITEM_BY_ID[id] ?? (id.includes('@') ? ITEM_BY_ID[id.split('@')[0]!] : undefined);
    if (!def) return n;
    this.syncSize();
    const stack = def.stack;
    let left = n;
    for (const s of this.inv.slots) {
      if (left <= 0) break;
      if (s && s.id === id && s.n < stack) {
        const put = Math.min(stack - s.n, left);
        s.n += put;
        left -= put;
      }
    }
    for (let i = 0; i < this.inv.slots.length && left > 0; i++) {
      if (!this.inv.slots[i] && i < this.inv.size) {
        const put = Math.min(stack, left);
        this.inv.slots[i] = { id, n: put };
        left -= put;
      }
    }
    if (left < n) this.sim.bus.emit('item:add', { item: id, count: n - left });
    return left;
  }

  /** Removes up to n; returns number actually removed. */
  remove(id: string, n = 1): number {
    let left = n;
    for (let i = this.inv.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.inv.slots[i];
      if (s && s.id === id) {
        const take = Math.min(s.n, left);
        s.n -= take;
        left -= take;
        if (s.n <= 0) this.inv.slots[i] = null;
      }
    }
    return n - left;
  }

  has(id: string, n = 1): boolean {
    return this.count(id) >= n;
  }

  /** Total value of an item (planks, furniture etc.). */
  itemValue(id: string): number {
    return ITEM_VALUE_HOOK.value(id);
  }

  // ---- axes ----
  newUid(prefix: string): string {
    return `${prefix}${this.sim.state.world.nextUid++}`;
  }
  giveAxe(defId: string): AxeInst | null {
    const def = AXE_BY_ID[defId];
    if (!def) return null;
    const a: AxeInst = {
      uid: this.newUid('a'),
      def: defId,
      up: 0,
      ench: {},
      dur: def.durability,
      skin: 'default',
      xp: 0,
    };
    this.sim.state.axes.push(a);
    // put in first free hotbar slot
    const hb = this.inv.hotbar;
    const free = hb.findIndex((h) => !h);
    if (free >= 0) hb[free] = 'axe:' + a.uid;
    if (!this.sim.state.equipped) this.equipAxe(a.uid);
    this.sim.bus.emit('notify', { text: `Got ${def.name}!`, kind: 'good' });
    return a;
  }
  axeByUid(uid: string | null): AxeInst | undefined {
    return uid ? this.sim.state.axes.find((a) => a.uid === uid) : undefined;
  }
  equipped(): AxeInst | undefined {
    return this.axeByUid(this.sim.state.equipped);
  }
  equipAxe(uid: string | null): void {
    this.sim.state.equipped = uid;
    const a = this.axeByUid(uid);
    if (a) this.sim.bus.emit('axe:equip', { axeId: a.def });
  }
  /** Select hotbar slot i (0..7). Axes equip; items are "used". */
  selectHotbar(i: number): void {
    const ref = this.inv.hotbar[i];
    this.hotbarSel = i;
    if (!ref) return;
    if (ref.startsWith('axe:')) this.equipAxe(ref.slice(4));
  }
  hotbarSel = 0;

  assignHotbar(slot: number, ref: string | null): void {
    this.inv.hotbar[slot] = ref;
  }

  /** Items kept in the stack list only (not axes). */
  stacks(): (ItemStack | null)[] {
    return this.inv.slots;
  }

  limit(): number {
    return CONFIG.player.baseStrength;
  }
}

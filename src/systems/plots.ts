import type { Sim, System } from '../core/sim';
import { PLOTS, PLOT_BY_ID } from '../data/plots';
import { emptyPlot, type PlotState } from '../save/schema';
import type { PlotDef } from '../data/types';
import { CONFIG } from '../config';
import { Terrain } from '../world/terrain';
import { FLAT_ZONES } from '../world/layout';
import type { Streamer } from './streaming';

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
export const SECTION_GROW = 12;

/** Plot ownership, expansion and spatial queries. */
export class PlotSystem implements System {
  readonly name = 'plots';
  constructor(
    private sim: Sim,
    streamer: Streamer,
  ) {
    streamer.blocked = (x, z) => this.nearAny(x, z, 6);
  }
  update(): void {}

  state(id: string): PlotState | undefined {
    return this.sim.state.plots[id];
  }
  owned(id: string): boolean {
    return !!this.sim.state.plots[id];
  }

  rect(def: PlotDef, sections = this.sim.state.plots[def.id]?.sections ?? 1): Rect {
    const g = (sections - 1) * SECTION_GROW;
    return {
      x0: def.center[0] - def.size[0] / 2 - g,
      x1: def.center[0] + def.size[0] / 2 + g,
      z0: def.center[1] - def.size[1] / 2 - g,
      z1: def.center[1] + def.size[1] / 2 + g,
    };
  }

  /** Maximum footprint a plot could ever occupy (used for tree exclusion). */
  private nearAny(x: number, z: number, margin: number): boolean {
    for (const zn of FLAT_ZONES)
      if (Math.abs(x - zn.x) < zn.hx + margin + 6 && Math.abs(z - zn.z) < zn.hz + margin + 6) return true;
    for (const p of PLOTS) {
      const hx = p.size[0] / 2 + Terrain.PLOT_GROW * 0.5 + margin + (p.maxSections - 1) * SECTION_GROW * 0.5;
      const hz = p.size[1] / 2 + Terrain.PLOT_GROW * 0.5 + margin + (p.maxSections - 1) * SECTION_GROW * 0.5;
      if (Math.abs(x - p.center[0]) < hx && Math.abs(z - p.center[1]) < hz) return true;
    }
    return false;
  }

  /** Plot (owned or not) whose current rect contains the point. */
  plotAt(x: number, z: number, onlyOwned = false): PlotDef | null {
    for (const p of PLOTS) {
      if (onlyOwned && !this.owned(p.id)) continue;
      const r = this.rect(p, this.owned(p.id) ? undefined : 1);
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return p;
    }
    return null;
  }
  insideOwnedPlot(x: number, z: number): boolean {
    return !!this.plotAt(x, z, true);
  }

  buy(id: string): boolean {
    const def = PLOT_BY_ID[id];
    const s = this.sim;
    if (!def || this.owned(id)) return false;
    if (!s.econ.spend(def.price, 'land')) return false;
    s.state.plots[id] = emptyPlot();
    s.state.stats.plots = (s.state.stats.plots ?? 0) + 1;
    s.bus.emit('plot:buy', { plot: id });
    s.bus.emit('notify', { text: `You bought ${def.name}!`, kind: 'good' });
    s.bus.emit('sfx', { name: 'level' });
    return true;
  }

  expandCost(id: string): number {
    const def = PLOT_BY_ID[id]!;
    const st = this.state(id);
    return Math.round(def.expand * (st?.sections ?? 1));
  }
  expand(id: string): boolean {
    const def = PLOT_BY_ID[id];
    const st = this.state(id);
    if (!def || !st || st.sections >= def.maxSections) return false;
    if (!this.sim.econ.spend(this.expandCost(id), 'land')) return false;
    st.sections++;
    this.sim.bus.emit('notify', { text: `${def.name} expanded (section ${st.sections})`, kind: 'good' });
    return true;
  }

  partCap(id: string): number {
    const st = this.state(id);
    return CONFIG.buildCap.perPlot + ((st?.sections ?? 1) - 1) * CONFIG.buildCap.perSectionBonus;
  }

  ownedList(): PlotDef[] {
    return PLOTS.filter((p) => this.owned(p.id));
  }
}

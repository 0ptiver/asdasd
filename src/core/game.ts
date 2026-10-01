import { CONFIG } from '../config';
import { EventBus } from './events';
import { FixedLoop } from './loop';
import { Input } from './input';
import { loadSettings, saveSettings, saveSlot, listSlots, loadSlot } from '../save/slots';
import { newGameState, type GameState, type Settings } from '../save/schema';
import type { Sim } from './sim';
import type { View } from '../render/view';
import { Sfx } from '../audio/sfx';

export type Screen = 'loading' | 'menu' | 'game';

/** Top-level orchestrator. Owns the loop, input, settings and (when playing) the Sim + View. */
export class Game {
  readonly bus = new EventBus();
  settings!: Settings;
  input!: Input;
  loop!: FixedLoop;
  sim: Sim | null = null;
  view: View | null = null;
  state: GameState | null = null;
  readonly sfx = new Sfx();
  slot = -1;
  screen: Screen = 'loading';
  canvas!: HTMLCanvasElement;
  /** Incremented whenever UI-relevant state changes. */
  rev = 0;
  private listeners = new Set<() => void>();
  private lastBump = 0;
  private saving = false;

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  /** Notify UI. Throttled for hot paths unless `force`. */
  bump(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastBump < 90) return;
    this.lastBump = now;
    this.rev++;
    for (const l of this.listeners) l();
  }
  setScreen(s: Screen): void {
    this.screen = s;
    this.bump(true);
  }

  async init(canvas: HTMLCanvasElement, progress: (p: number, text: string) => void): Promise<void> {
    this.canvas = canvas;
    progress(0.05, 'Loading settings…');
    this.settings = await loadSettings();
    this.applySettings();
    this.input = new Input(canvas, () => this.settings);
    const unlock = () => this.sfx.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.bus.on('sfx', (e) => this.sfx.play(e.name, e.x, e.y, e.z, e.vol));
    this.bus.on('notify', (n) => {
      if (n.kind === 'bad') this.sfx.play('error');
      else if (n.kind === 'good') this.sfx.play('good');
    });
    this.bus.on('level', () => this.sfx.play('level'));
    this.loop = new FixedLoop(
      (dt) => this.tick(dt),
      (a, fdt) => this.frame(a, fdt),
    );
    progress(0.2, 'Starting physics engine…');
    const { initPhysics } = await import('../physics/world');
    await initPhysics();
    progress(0.55, 'Preparing renderer…');
    const { View } = await import('../render/view');
    this.view = new View(this, canvas);
    progress(0.8, 'Building assets…');
    await this.view.preload((p) => progress(0.8 + p * 0.18, 'Building assets…'));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.sim) {
        this.loop.paused = true;
        void this.save(true);
      } else this.loop.paused = false;
    });
    window.addEventListener('beforeunload', () => {
      // best-effort synchronous-ish save kick-off
      if (this.sim) void this.save(true);
    });
    progress(1, 'Ready');
    this.loop.start();
    this.setScreen('menu');
  }

  applySettings(): void {
    const r = document.documentElement;
    r.style.setProperty('--ts', String(this.settings.textScale));
    r.dataset.cb = this.settings.colorblind;
    r.dataset.reduced = this.settings.reducedMotion ? '1' : '0';
    this.input?.rebind();
    this.view?.applyQuality();
  }
  async updateSettings(patch: Partial<Settings>): Promise<void> {
    this.settings = { ...this.settings, ...patch };
    this.applySettings();
    await saveSettings(this.settings);
    this.bump(true);
  }

  async listSlots() {
    return listSlots();
  }

  async newGame(slot: number, name: string): Promise<void> {
    const seed = (Math.random() * 2 ** 31) >>> 0;
    const s = newGameState(name || 'Lumberjack', seed);
    await this.start(slot, s);
  }
  async continueGame(slot: number): Promise<void> {
    const s = await loadSlot(slot);
    if (s) await this.start(slot, s);
  }

  async start(slot: number, state: GameState): Promise<void> {
    this.quit(false);
    const { buildSim } = await import('./boot');
    this.slot = slot;
    this.state = state;
    this.sim = buildSim(this, state);
    await this.sim.init();
    this.view!.attach(this.sim);
    this.setScreen('game');
    this.input.requestPointer();
    await this.save(true);
  }

  quit(save = true): void {
    if (this.sim && save) void this.save(true);
    this.sim?.dispose();
    this.view?.detach();
    this.sim = null;
    this.state = null;
    this.input?.releasePointer();
    this.setScreen('menu');
  }

  async save(auto: boolean): Promise<void> {
    if (!this.sim || !this.state || this.saving) return;
    this.saving = true;
    try {
      this.sim.beforeSave();
      await saveSlot(this.slot, this.state);
      this.bus.emit('save:done', { slot: this.slot, auto });
      if (!auto) this.bus.emit('notify', { text: 'Game saved', kind: 'good' });
    } catch (e) {
      console.error('save failed', e);
      this.bus.emit('notify', { text: 'Save failed!', kind: 'bad' });
    } finally {
      this.saving = false;
    }
  }

  private tick(dt: number): void {
    if (!this.sim) return;
    this.sfx.volume = this.settings.sfx;
    const p = this.sim.player;
    this.sfx.listener = { x: p.x, y: p.y, z: p.z, yaw: p.camYaw };
    this.input.poll();
    this.sim.step(dt);
    this.input.endTick();
  }
  private frame(alpha: number, fdt: number): void {
    this.view?.render(alpha, fdt);
    this.bump();
  }

  get autosaveSec(): number {
    return CONFIG.autosaveSec;
  }
}

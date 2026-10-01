import { CONFIG } from '../config';
import { EventBus } from './events';
import { FixedLoop } from './loop';
import { Input } from './input';
import { loadSettings, saveSettings, saveSlot, listSlots, loadSlot, hasSavedSettings } from '../save/slots';
import { newGameState, type GameState, type Settings } from '../save/schema';
import type { Sim } from './sim';
import type { View } from '../render/view';
import { Sfx } from '../audio/sfx';
import { MusicManager } from '../audio/music';
import { daylight } from './gameTime';
import type { Interactable } from '../systems/hubSystem';
import { WorldMap } from '../ui/worldMap';
import { NetClient } from '../net/client';
import type { Action } from './input';

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
  readonly net = new NetClient(this);
  readonly music = new MusicManager(this.sfx);
  panel: { name: string; arg?: string } | null = null;
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
    if (!(await hasSavedSettings())) {
      // first run: pick a sensible graphics preset for this device
      const mobile = navigator.maxTouchPoints > 0 && Math.min(window.innerWidth, window.innerHeight) < 800;
      const weak = (navigator.hardwareConcurrency ?? 8) <= 4;
      const q = mobile ? 'low' : weak ? 'low' : 'medium';
      this.settings = { ...this.settings, quality: q, shadows: q !== 'low', viewChunks: q === 'low' ? 2 : 3 };
      void saveSettings(this.settings);
    }
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
    this.input.onAction = (a) => this.onAction(a);
    this.input.onKeyRaw = (e) => {
      if (e.code === 'Escape' && this.panel) {
        this.closePanel();
        return true;
      }
      if (this.panel?.name === 'console') return e.code === 'Backquote' ? false : true;
      return false;
    };
    this.input.onPointerLost = () => {
      if (this.sim && !this.panel) this.openPanel('pause');
    };
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

  // ---------------------------------------------------------------- UI panels
  openPanel(name: string, arg?: string): void {
    if (!this.sim) return;
    this.panel = { name, arg };
    this.input.uiOpen = true;
    this.input.releasePointer();
    this.sfx.play('click');
    this.bus.emit('ui:open', { panel: name });
    this.bump(true);
  }
  closePanel(): void {
    if (!this.panel) return;
    const n = this.panel.name;
    this.panel = null;
    this.input.uiOpen = false;
    this.input.requestPointer();
    this.bus.emit('ui:close', { panel: n });
    this.bump(true);
  }
  togglePanel(name: string, arg?: string): void {
    if (this.panel?.name === name) this.closePanel();
    else if (!this.panel) this.openPanel(name, arg);
  }
  private onAction(a: Action): void {
    if (!this.sim) return;
    const map: Partial<Record<Action, string>> = {
      inventory: 'inventory',
      map: 'map',
      quests: 'quests',
      craft: 'craft',
      garage: 'garage',
    };
    if (a === 'console') {
      this.togglePanel('console');
      return;
    }
    if (a === 'build') {
      if (!this.panel && this.sim.player.mode === 'foot') {
        this.sim.building.setMode(!this.sim.building.active);
        this.bump(true);
      }
      return;
    }
    const p = map[a];
    if (p) this.togglePanel(p);
  }
  /** Player pressed E on an interactable. */
  interact(it: Interactable): void {
    const sim = this.sim;
    if (!sim) return;
    switch (it.kind) {
      case 'npc':
        this.openPanel('npc', it.arg);
        break;
      case 'sell':
        this.openPanel('sell');
        break;
      case 'sawmill':
        sim.sawmill.collect();
        break;
      case 'board':
        this.openPanel('quests');
        break;
      case 'garage':
        this.openPanel('garage');
        break;
      case 'gas':
        this.openPanel('gas');
        break;
      case 'dock':
        this.openPanel('shop', 'harbor');
        break;
      case 'train':
        this.openPanel('train');
        break;
      case 'forge':
        this.openPanel('forge');
        break;
      case 'craft':
        this.openPanel('craft');
        break;
      case 'shop':
        if (it.arg === 'toll') sim.world.payToll();
        else this.openPanel('shop', it.arg);
        break;
      case 'part':
        sim.building.use(Number(it.arg));
        break;
      case 'vehicle': {
        const v = sim.vehicles.live.get(it.arg ?? '');
        if (v) sim.vehicles.enter(v);
        break;
      }
      case 'secret': {
        const sc = sim.world.secrets.find((x) => x.id === it.arg);
        if (sc) sim.world.findSecret(sc);
        break;
      }
      case 'shaft': {
        const [x, z] = (it.arg ?? '0,0').split(',').map(Number);
        sim.player.teleport(x!, z!);
        sim.bus.emit('notify', { text: 'You ride the mine shaft…', kind: 'info' });
        break;
      }
      case 'outpost':
        this.openPanel('outpost', it.arg);
        break;
      case 'ferry':
        sim.world.boardFerry();
        break;
      case 'fast_travel':
        this.openPanel('map');
        break;
      case 'node':
        sim.nodes.gather(it.arg ?? '');
        break;
      case 'fish':
        sim.nodes.toggleFishing();
        break;
      case 'dig':
        sim.nodes.dig();
        break;
      default:
        break;
    }
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
    this.sim.worldMap = new WorldMap(this.sim.streamer.terrain);
    this.sim.worldMap.start();
    this.view!.attach(this.sim);
    this.setScreen('game');
    this.input.requestPointer();
    await this.save(true);
  }

  quit(save = true): void {
    if (this.sim && save) void this.save(true);
    this.sim?.worldMap?.cancel();
    this.sim?.dispose();
    this.view?.detach();
    this.sim = null;
    this.state = null;
    this.panel = null;
    if (this.input) this.input.uiOpen = false;
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
    this.net.tick(dt);
    this.input.endTick();
  }
  private frame(alpha: number, fdt: number): void {
    this.view?.render(alpha, fdt);
    const sim = this.sim;
    if (sim && !this.loop.paused) {
      this.music.update(fdt, {
        biome: sim.biome.current.id, daylight: daylight(sim.state.time), weather: sim.state.weather.kind,
        indoor: this.view?.indoor ?? 0, combat: !!sim.bosses.engaged, speed: Math.hypot(sim.player.vx, sim.player.vz) + Math.abs(sim.vehicles.current?.speed ?? 0),
        musicVol: this.settings.music, ambVol: this.settings.ambience,
      });
    }
    this.bump();
  }

  get autosaveSec(): number {
    return CONFIG.autosaveSec;
  }
}

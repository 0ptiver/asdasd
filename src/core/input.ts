/** Unified input: keyboard/mouse (pointer lock), gamepad and touch. Systems poll `Input` each tick. */
import type { Settings } from '../save/schema';

export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'jump'
  | 'sprint'
  | 'interact'
  | 'inventory'
  | 'map'
  | 'build'
  | 'quests'
  | 'garage'
  | 'craft'
  | 'hotbarNext'
  | 'drop'
  | 'special'
  | 'recall'
  | 'horn'
  | 'lights'
  | 'console';

export class Input {
  moveX = 0;
  moveY = 0; // +1 forward
  lookDX = 0;
  lookDY = 0;
  primary = false; // left mouse / action button
  secondary = false;
  wheel = 0;
  aimX = 0.5; // normalized screen coords of the grab aim point (center by default)
  aimY = 0.5;
  touchAim = false;
  pointerLocked = false;
  touchMode = false;
  /** Set while a UI panel is open: gameplay input is ignored. */
  uiOpen = false;
  private down = new Set<string>();
  private edge = new Set<string>();
  private codeToAction = new Map<string, Action>();
  private pad: { jumpPrev: boolean } = { jumpPrev: false };
  private touchMove = { x: 0, y: 0, id: -1, ox: 0, oy: 0 };
  private touchLook = { id: -1, lx: 0, ly: 0 };
  private touchBtn = new Set<string>();
  onAction: ((a: Action) => void) | null = null;
  onPointerLost: (() => void) | null = null;
  onKeyRaw: ((e: KeyboardEvent) => boolean) | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private getSettings: () => Settings,
  ) {
    this.rebind();
    window.addEventListener('keydown', this.kd);
    window.addEventListener('keyup', this.ku);
    window.addEventListener('blur', this.blur);
    canvas.addEventListener('mousedown', this.md);
    window.addEventListener('mouseup', this.mu);
    window.addEventListener('mousemove', this.mm);
    window.addEventListener('wheel', this.wh, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const was = this.pointerLocked;
      this.pointerLocked = document.pointerLockElement === this.canvas;
      if (was && !this.pointerLocked) this.onPointerLost?.();
    });
    canvas.addEventListener('touchstart', this.ts, { passive: false });
    canvas.addEventListener('touchmove', this.tm, { passive: false });
    canvas.addEventListener('touchend', this.te);
    canvas.addEventListener('touchcancel', this.te);
    window.addEventListener('touchstart', () => (this.touchMode = true), { once: true, passive: true });
  }

  rebind(): void {
    this.codeToAction.clear();
    for (const [a, c] of Object.entries(this.getSettings().keys)) this.codeToAction.set(c, a as Action);
  }

  private kd = (e: KeyboardEvent) => {
    if (this.onKeyRaw && this.onKeyRaw(e)) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.repeat) return;
    this.down.add(e.code);
    this.edge.add(e.code);
    const a = this.codeToAction.get(e.code);
    if (a && this.onAction) this.onAction(a);
    if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
  };
  private ku = (e: KeyboardEvent) => this.down.delete(e.code);
  private blur = () => {
    this.down.clear();
    this.primary = this.secondary = false;
  };
  private md = (e: MouseEvent) => {
    if (this.uiOpen) return;
    if (!this.pointerLocked && !this.touchMode) {
      this.canvas.requestPointerLock?.();
      return;
    }
    if (e.button === 0) this.primary = true;
    if (e.button === 2) this.secondary = true;
  };
  private mu = (e: MouseEvent) => {
    if (e.button === 0) this.primary = false;
    if (e.button === 2) this.secondary = false;
  };
  private mm = (e: MouseEvent) => {
    if (!this.pointerLocked) return;
    this.lookDX += e.movementX;
    this.lookDY += e.movementY;
  };
  private wh = (e: WheelEvent) => {
    this.wheel += Math.sign(e.deltaY);
  };

  // --- touch ---
  private ts = (e: TouchEvent) => {
    this.touchMode = true;
    if (this.uiOpen) return;
    for (const t of Array.from(e.changedTouches)) {
      const left = t.clientX < window.innerWidth * 0.4;
      if (left && this.touchMove.id < 0) {
        this.touchMove = { x: 0, y: 0, id: t.identifier, ox: t.clientX, oy: t.clientY };
      } else if (!left && this.touchLook.id < 0) {
        this.touchLook = { id: t.identifier, lx: t.clientX, ly: t.clientY };
      }
    }
    e.preventDefault();
  };
  private tm = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.touchMove.id) {
        const dx = (t.clientX - this.touchMove.ox) / 60;
        const dy = (t.clientY - this.touchMove.oy) / 60;
        const m = Math.hypot(dx, dy);
        const k = m > 1 ? 1 / m : 1;
        this.touchMove.x = dx * k;
        this.touchMove.y = dy * k;
      } else if (t.identifier === this.touchLook.id) {
        this.lookDX += (t.clientX - this.touchLook.lx) * 1.4;
        this.lookDY += (t.clientY - this.touchLook.ly) * 1.4;
        this.touchLook.lx = t.clientX;
        this.touchLook.ly = t.clientY;
      }
    }
    e.preventDefault();
  };
  private te = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.touchMove.id) this.touchMove = { x: 0, y: 0, id: -1, ox: 0, oy: 0 };
      if (t.identifier === this.touchLook.id) this.touchLook.id = -1;
    }
  };
  /** Called by on-screen touch buttons. */
  setTouchButton(name: string, down: boolean): void {
    if (down) {
      this.touchBtn.add(name);
      this.edge.add('touch:' + name);
    } else this.touchBtn.delete(name);
    if (name === 'act') this.primary = down;
    if (name === 'alt') this.secondary = down;
  }

  held(a: Action): boolean {
    const code = this.getSettings().keys[a];
    return (code !== undefined && this.down.has(code)) || this.touchBtn.has(a);
  }
  /** Raw key edge by KeyboardEvent.code (hotbar digits etc). */
  rawPressed(code: string): boolean {
    return this.edge.has(code);
  }
  pressed(a: Action): boolean {
    const code = this.getSettings().keys[a];
    return (code !== undefined && this.edge.has(code)) || this.edge.has('touch:' + a);
  }

  /** Per-tick poll: computes movement axes (keys + gamepad + touch) and gamepad look. */
  poll(): void {
    let x = 0;
    let y = 0;
    if (this.held('forward')) y += 1;
    if (this.held('back')) y -= 1;
    if (this.held('right')) x += 1;
    if (this.held('left')) x -= 1;
    x += this.touchMove.x;
    y -= this.touchMove.y;
    const gp = navigator.getGamepads?.()[0];
    if (gp) {
      const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
      x += dz(gp.axes[0] ?? 0);
      y -= dz(gp.axes[1] ?? 0);
      this.lookDX += dz(gp.axes[2] ?? 0) * 18;
      this.lookDY += dz(gp.axes[3] ?? 0) * 18;
      const a = !!gp.buttons[0]?.pressed;
      if (a && !this.pad.jumpPrev) this.edge.add('touch:jump');
      this.pad.jumpPrev = a;
      if (gp.buttons[0]?.pressed) this.touchBtn.add('jump');
      else if (!this.touchBtn.has('_t')) this.touchBtn.delete('jump');
      this.primary ||= !!gp.buttons[7]?.pressed;
    }
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    this.moveX = x;
    this.moveY = y;
  }

  /** Clear per-tick edge flags and accumulated deltas. */
  endTick(): void {
    this.edge.clear();
    this.lookDX = 0;
    this.lookDY = 0;
    this.wheel = 0;
  }

  releasePointer(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }
  requestPointer(): void {
    if (!this.touchMode) this.canvas.requestPointerLock?.();
  }
}

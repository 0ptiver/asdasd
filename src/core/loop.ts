/** Fixed-timestep loop: simulation ticks at CONFIG.simHz, rendering is decoupled and interpolation-free. */
import { CONFIG } from '../config';

export class FixedLoop {
  private acc = 0;
  private last = 0;
  private raf = 0;
  running = false;
  paused = false;
  readonly dt = 1 / CONFIG.simHz;
  frameMs = 16;
  fps = 60;
  private fpsAcc = 0;
  private fpsFrames = 0;

  constructor(
    private sim: (dt: number) => void,
    private render: (alpha: number, frameDt: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(frame);
      const frameDt = Math.min(0.25, (now - this.last) / 1000);
      this.last = now;
      this.frameMs = frameDt * 1000;
      this.fpsAcc += frameDt;
      this.fpsFrames++;
      if (this.fpsAcc >= 0.5) {
        this.fps = this.fpsFrames / this.fpsAcc;
        this.fpsAcc = 0;
        this.fpsFrames = 0;
      }
      if (!this.paused) {
        this.acc += frameDt;
        let steps = 0;
        while (this.acc >= this.dt && steps < CONFIG.maxSimStepsPerFrame) {
          this.sim(this.dt);
          this.acc -= this.dt;
          steps++;
        }
        if (steps === CONFIG.maxSimStepsPerFrame) this.acc = 0;
      }
      this.render(this.acc / this.dt, frameDt);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}

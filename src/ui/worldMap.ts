import { CONFIG } from '../config';
import type { Terrain } from '../world/terrain';
import { ROADS, RAIL, riverX, RIVER_WIDTH } from '../world/terrain';
import { BIOMES } from '../data/biomes';

const SIZE = 256;

/** Pre-rendered overview of the whole world (time-sliced so it never blocks a frame). */
export class WorldMap {
  readonly canvas = document.createElement('canvas');
  progress = 0;
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  private row = 0;
  private cancelled = false;
  constructor(private terrain: Terrain) {
    this.canvas.width = this.canvas.height = SIZE;
    this.ctx = this.canvas.getContext('2d')!;
    this.img = this.ctx.createImageData(SIZE, SIZE);
    this.ctx.fillStyle = '#10202a';
    this.ctx.fillRect(0, 0, SIZE, SIZE);
  }

  start(): void {
    const step = () => {
      if (this.cancelled) return;
      const t0 = performance.now();
      while (this.row < SIZE && performance.now() - t0 < 6) this.renderRow(this.row++);
      this.progress = this.row / SIZE;
      if (this.row < SIZE) requestAnimationFrame(step);
      else this.finish();
    };
    requestAnimationFrame(step);
  }
  cancel(): void {
    this.cancelled = true;
  }

  private renderRow(r: number): void {
    const W = CONFIG.worldSize;
    const z = (r / SIZE) * W - W / 2;
    for (let c = 0; c < SIZE; c++) {
      const x = (c / SIZE) * W - W / 2;
      const h = this.terrain.heightAt(x, z);
      const b = this.terrain.biomeAt(x, z);
      let R: number, G: number, B: number;
      if (h < 0) {
        const d = Math.min(1, -h / 8);
        R = 40 - d * 20;
        G = 110 - d * 40;
        B = 170 - d * 30;
      } else {
        const hex = h > 60 && b.id !== 'volcano' ? 0xe8eef4 : b.ground;
        R = (hex >> 16) & 255;
        G = (hex >> 8) & 255;
        B = hex & 255;
        const shade = 0.75 + Math.min(0.5, h / 120);
        R *= shade;
        G *= shade;
        B *= shade;
        if (b.indoor) {
          R *= 0.4;
          G *= 0.4;
          B *= 0.5;
        }
      }
      const i = (r * SIZE + c) * 4;
      this.img.data[i] = R;
      this.img.data[i + 1] = G;
      this.img.data[i + 2] = B;
      this.img.data[i + 3] = 255;
    }
  }

  private finish(): void {
    this.ctx.putImageData(this.img, 0, 0);
    const W = CONFIG.worldSize;
    const px = (v: number) => ((v + W / 2) / W) * SIZE;
    this.ctx.lineWidth = 1;
    this.ctx.strokeStyle = 'rgba(220,190,140,0.9)';
    for (const road of ROADS) {
      this.ctx.beginPath();
      road.forEach(([x, z], i) => (i ? this.ctx.lineTo(px(x), px(z)) : this.ctx.moveTo(px(x), px(z))));
      this.ctx.stroke();
    }
    this.ctx.strokeStyle = 'rgba(30,30,30,0.9)';
    this.ctx.setLineDash([2, 2]);
    this.ctx.beginPath();
    RAIL.forEach(([x, z], i) => (i ? this.ctx.lineTo(px(x), px(z)) : this.ctx.moveTo(px(x), px(z))));
    this.ctx.stroke();
    this.ctx.setLineDash([]);
    this.ctx.strokeStyle = 'rgba(60,140,210,0.9)';
    this.ctx.lineWidth = Math.max(1, (RIVER_WIDTH / W) * SIZE * 1.5);
    this.ctx.beginPath();
    for (let z = -W / 2; z <= W / 2; z += 30)
      if (z === -W / 2) this.ctx.moveTo(px(riverX(z)), px(z));
      else this.ctx.lineTo(px(riverX(z)), px(z));
    this.ctx.stroke();
    this.progress = 1;
  }

  static biomeLabels(): { name: string; x: number; z: number }[] {
    return BIOMES.map((b) => ({ name: b.name, x: b.center[0], z: b.center[1] }));
  }
}

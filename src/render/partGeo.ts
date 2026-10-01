import * as THREE from 'three';
import { PART_BY_ID } from '../data/parts';
import { Prims } from './prims';

const W = 0xffffff;
export interface PartGeo {
  body: THREE.BufferGeometry;
  accent: THREE.BufferGeometry | null;
}

function boards(p: Prims, w: number, h: number, d: number, y0: number, n: number, x = 0, z = 0): void {
  for (let i = 0; i < n; i++) {
    const bh = h / n;
    p.box(w, bh * 0.96, d, x, y0 + bh * (i + 0.5), z, W, undefined, i % 2 ? 0.93 : 1);
  }
}

function build(id: string): { b: Prims; a: Prims } {
  const b = new Prims();
  const a = new Prims();
  const def = PART_BY_ID[id]!;
  const [w, h, d] = def.size;
  switch (id) {
    case 'wall':
      boards(b, w, h, d, 0, 6);
      b.box(w, 0.12, d + 0.06, 0, 0.06, 0, W, undefined, 0.8).box(w, 0.12, d + 0.06, 0, h - 0.06, 0, W, undefined, 0.8);
      break;
    case 'wall_half':
      boards(b, w, h, d, 0, 3);
      b.box(w, 0.1, d + 0.08, 0, h - 0.05, 0, W, undefined, 0.8);
      break;
    case 'wall_window':
      b.box(w, 1.0, d, 0, 0.5, 0, W).box(w, 0.8, d, 0, h - 0.4, 0, W);
      b.box(1.2, 1.2, d, -w / 2 + 0.6, 1.6, 0, W, undefined, 0.95).box(1.2, 1.2, d, w / 2 - 0.6, 1.6, 0, W, undefined, 0.95);
      b.box(1.7, 0.1, d + 0.1, 0, 1.05, 0, W, undefined, 0.75).box(1.7, 0.1, d + 0.1, 0, 2.15, 0, W, undefined, 0.75);
      b.box(0.08, 1.1, d + 0.1, 0, 1.6, 0, W, undefined, 0.75);
      a.box(1.62, 1.1, 0.04, 0, 1.6, 0, 0x9fd8f5);
      break;
    case 'wall_door':
      b.box(1.1, h, d, -w / 2 + 0.55, h / 2, 0, W).box(1.1, h, d, w / 2 - 0.55, h / 2, 0, W).box(w, h - 2.7, d, 0, 2.7 + (h - 2.7) / 2, 0, W, undefined, 0.9);
      b.box(0.12, 2.7, d + 0.06, -0.85, 1.35, 0, W, undefined, 0.75).box(0.12, 2.7, d + 0.06, 0.85, 1.35, 0, W, undefined, 0.75);
      break;
    case 'floor':
    case 'floor_half':
    case 'roof_flat': {
      const n = Math.max(2, Math.round(d / 0.5));
      for (let i = 0; i < n; i++) b.box(w, h, (d / n) * 0.96, 0, h / 2, -d / 2 + (d / n) * (i + 0.5), W, undefined, i % 2 ? 0.92 : 1);
      break;
    }
    case 'roof_slope': {
      const L = Math.hypot(h, d);
      const ang = Math.atan2(h, d);
      b.box(w + 0.2, 0.28, L + 0.1, 0, h / 2, 0, W, [-ang, 0, 0]);
      for (let i = 0; i < 4; i++) b.box(w + 0.22, 0.05, 0.1, 0, h * ((i + 0.5) / 4) + 0.16, -d / 2 + d * ((i + 0.5) / 4), W, [-ang, 0, 0], 0.8);
      break;
    }
    case 'roof_peak': {
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2, 0);
      shape.lineTo(w / 2, 0);
      shape.lineTo(0, h);
      shape.closePath();
      const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
      g.translate(0, 0, -d / 2);
      b.geometry(g, W);
      break;
    }
    case 'stairs': {
      const n = 8;
      for (let i = 0; i < n; i++) {
        const sh = (h / n) * (i + 1);
        b.box(w, sh, d / n, 0, sh / 2, -d / 2 + (d / n) * (i + 0.5), W, undefined, 0.86 + 0.14 * (i % 2));
      }
      break;
    }
    case 'pillar':
      b.box(w, h, d, 0, h / 2, 0, W).box(w + 0.15, 0.2, d + 0.15, 0, 0.1, 0, W, undefined, 0.8).box(w + 0.15, 0.2, d + 0.15, 0, h - 0.1, 0, W, undefined, 0.8);
      break;
    case 'beam':
      b.box(w, h, d, 0, h / 2, 0, W);
      break;
    case 'fence':
      b.box(0.14, h, 0.14, -w / 2 + 0.07, h / 2, 0, W, undefined, 0.85).box(0.14, h, 0.14, w / 2 - 0.07, h / 2, 0, W, undefined, 0.85);
      b.box(w, 0.1, 0.06, 0, 0.35, 0, W).box(w, 0.1, 0.06, 0, 0.8, 0, W);
      for (let i = 0; i < 5; i++) b.box(0.1, h * 0.85, 0.05, -0.8 + i * 0.4, h * 0.45, 0.07, W, undefined, 0.95);
      break;
    case 'door':
      b.box(w, h, d, 0, h / 2, 0, W);
      b.box(w * 0.7, h * 0.4, d + 0.04, 0, h * 0.72, 0, W, undefined, 0.85).box(w * 0.7, h * 0.35, d + 0.04, 0, h * 0.27, 0, W, undefined, 0.85);
      a.sphere(0.07, w / 2 - 0.2, h * 0.5, 0.1, 0xd8c070, undefined, 0);
      break;
    case 'gate':
      b.box(w, 0.1, d, 0, 0.3, 0, W).box(w, 0.1, d, 0, h - 0.2, 0, W);
      for (let i = 0; i < 8; i++) b.box(0.12, h, d * 0.8, -w / 2 + 0.15 + i * ((w - 0.3) / 7), h / 2, 0, W, undefined, i % 2 ? 0.9 : 1);
      break;
    case 'lamp':
      b.cyl(0.07, 0.1, h, 7, 0, h / 2, 0, W, undefined, 0.5).box(0.4, 0.1, 0.4, 0, h + 0.05, 0, W, undefined, 0.5);
      a.sphere(0.22, 0, h - 0.15, 0, 0xfff1b0, undefined, 1);
      break;
    case 'lantern':
      b.box(0.3, 0.06, 0.3, 0, 0.03, 0, W, undefined, 0.5).box(0.3, 0.06, 0.3, 0, 0.47, 0, W, undefined, 0.5);
      a.box(0.22, 0.4, 0.22, 0, 0.25, 0, 0xfff1b0);
      break;
    case 'sign':
      b.box(0.14, h, 0.14, -w / 2 + 0.2, h / 2, 0, W, undefined, 0.8).box(0.14, h, 0.14, w / 2 - 0.2, h / 2, 0, W, undefined, 0.8).box(w, 0.6, d, 0, h - 0.4, 0, W);
      a.box(w - 0.2, 0.46, 0.03, 0, h - 0.4, 0.08, 0xf2e6c0);
      break;
    case 'chest':
      b.box(w, h * 0.6, d, 0, h * 0.3, 0, W).box(w + 0.04, h * 0.4, d + 0.04, 0, h * 0.8, 0, W, undefined, 0.88);
      a.box(0.12, 0.2, 0.04, 0, h * 0.62, d / 2 + 0.03, 0xd8c070);
      break;
    case 'chair':
      b.box(0.5, 0.08, 0.5, 0, 0.5, 0, W).box(0.5, 0.55, 0.06, 0, 0.8, -0.22, W, undefined, 0.9);
      for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]] as [number, number][]) b.box(0.06, 0.5, 0.06, x, 0.25, z, W, undefined, 0.8);
      break;
    case 'table':
      b.box(w, 0.1, d, 0, h - 0.05, 0, W);
      for (const [x, z] of [[-0.8, -0.4], [0.8, -0.4], [-0.8, 0.4], [0.8, 0.4]] as [number, number][]) b.box(0.1, h - 0.1, 0.1, x, (h - 0.1) / 2, z, W, undefined, 0.8);
      break;
    case 'bookshelf':
      b.box(w, h, 0.05, 0, h / 2, -d / 2 + 0.03, W, undefined, 0.8).box(0.06, h, d, -w / 2 + 0.03, h / 2, 0, W).box(0.06, h, d, w / 2 - 0.03, h / 2, 0, W);
      for (let i = 0; i < 5; i++) b.box(w, 0.05, d, 0, 0.05 + i * (h / 4.6), 0, W, undefined, 0.9);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 7; j++) a.box(0.12, 0.34, 0.3, -w / 2 + 0.2 + j * 0.24, 0.3 + i * (h / 4.6), 0, [0xb03a3a, 0x3a6ab0, 0x3ab06a, 0xb0a03a][(i + j) % 4]!);
      break;
    case 'bed':
      b.box(w, 0.3, d, 0, 0.25, 0, W).box(w, 0.7, 0.1, 0, 0.55, -d / 2 + 0.05, W, undefined, 0.85);
      a.box(w - 0.1, 0.18, d - 0.4, 0, 0.5, 0.1, 0xe8e4f0).box(0.8, 0.14, 0.4, 0, 0.62, -d / 2 + 0.4, 0xffffff);
      break;
    case 'barrel':
      b.cyl(0.4, 0.4, h, 10, 0, h / 2, 0, W);
      a.cyl(0.43, 0.43, 0.06, 10, 0, 0.25, 0, 0x555555).cyl(0.43, 0.43, 0.06, 10, 0, h - 0.25, 0, 0x555555);
      break;
    case 'sawmill':
      b.box(w, 0.25, d, 0, 0.12, 0, W, undefined, 0.8);
      b.box(w * 0.55, h - 0.3, d * 0.6, w * 0.22, 0.25 + (h - 0.3) / 2, -d * 0.2, W);
      b.box(w * 0.6, 0.3, d * 0.7, w * 0.22, h, -d * 0.2, W, undefined, 0.7);
      b.box(w * 0.45, 0.6, 1.4, -w * 0.2, 0.55, d * 0.25, W, undefined, 0.8);
      a.cyl(0.9, 0.9, 0.08, 18, w * 0.18, 1.25, d * 0.25, 0xcfd6dc, [Math.PI / 2, 0, 0]).box(w * 0.45, 0.08, 1.2, -w * 0.2, 0.9, d * 0.25, 0x2a2a30);
      break;
    case 'sellstand':
      b.box(w, 0.9, d * 0.5, 0, 0.45, d * 0.2, W).box(0.15, h, 0.15, -w / 2 + 0.1, h / 2, -d / 2 + 0.1, W, undefined, 0.8).box(0.15, h, 0.15, w / 2 - 0.1, h / 2, -d / 2 + 0.1, W, undefined, 0.8);
      for (let i = 0; i < 6; i++) a.box(w / 6, 0.12, d + 0.2, -w / 2 + (w / 6) * (i + 0.5), h, 0, i % 2 ? 0xe8e8e8 : 0xd04a3a, [0.25, 0, 0]);
      break;
    case 'workbench':
      b.box(w, 0.12, d, 0, h - 0.06, 0, W);
      for (const [x, z] of [[-1, -0.4], [1, -0.4], [-1, 0.4], [1, 0.4]] as [number, number][]) b.box(0.12, h - 0.1, 0.12, x * (w / 2 - 0.15), (h - 0.1) / 2, z, W, undefined, 0.8);
      a.box(0.8, 0.12, 0.35, 0.3, h + 0.06, 0, 0x8a8a92).box(0.3, 0.3, 0.3, -0.7, h + 0.15, 0.1, 0xc0853a);
      break;
    case 'workshop':
    case 'factory':
    case 'firewood_stall': {
      const wall = id === 'factory' ? 0xc8ccd4 : 0xd8c8a8;
      b.box(w, h, d, 0, h / 2, 0, W, undefined, 0.92);
      b.pyramid(w + 0.8, id === 'factory' ? 1.6 : 1.2, d + 0.8, 0, h + (id === 'factory' ? 0.8 : 0.6), 0, W);
      a.box(1.6, 2.4, 0.1, 0, 1.2, d / 2 + 0.03, 0x6a4a30).box(1.2, 1.0, 0.1, -w * 0.3, 1.8, d / 2 + 0.03, 0x9ad0f0);
      if (id === 'factory') a.cyl(0.5, 0.6, 3, 8, w * 0.3, h + 1.8, -d * 0.2, 0x6a625a);
      void wall;
      break;
    }
    case 'switch':
      b.box(w, h, d, 0, h / 2, 0, W, undefined, 0.6);
      a.box(0.1, 0.18, 0.1, 0, h / 2, 0.1, 0xd04a3a);
      break;
    case 'timer':
    case 'sensor':
    case 'gate_and':
    case 'gate_not':
      b.box(w, h, d, 0, h / 2, 0, W, undefined, 0.55);
      a.box(0.12, 0.12, 0.05, 0, h / 2, d / 2 + 0.01, id === 'sensor' ? 0x3adfff : 0x7aff7a);
      break;
    case 'piston':
      b.box(w, h, d * 0.55, 0, h / 2, -d * 0.22, W, undefined, 0.6);
      a.box(w * 0.6, h * 0.6, d * 0.5, 0, h / 2, d * 0.2, 0xb0b8c0);
      break;
    case 'conveyor':
      b.box(w, h, d, 0, h / 2, 0, W, undefined, 0.5);
      a.box(w - 0.2, 0.06, d - 0.2, 0, h + 0.02, 0, 0x2a2a30);
      for (let i = 0; i < 6; i++) a.box(w - 0.3, 0.02, 0.1, 0, h + 0.06, -d / 2 + 0.4 + i * 0.64, 0x5a5a62);
      break;
    case 'screen':
      b.box(w, h, d, 0, h / 2, 0, W, undefined, 0.45);
      a.box(w - 0.15, h - 0.15, 0.04, 0, h / 2, d / 2 + 0.01, 0x14301e);
      break;
    default:
      b.box(w, h, d, 0, h / 2, 0, W);
  }
  return { b, a };
}

const cache = new Map<string, PartGeo>();
export function partGeo(id: string): PartGeo {
  let g = cache.get(id);
  if (!g) {
    const { b, a } = build(id);
    g = { body: b.build(), accent: a.empty ? null : a.build() };
    cache.set(id, g);
  }
  return g;
}

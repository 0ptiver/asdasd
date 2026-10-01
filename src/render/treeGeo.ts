import * as THREE from 'three';
import type { TreeStyle } from '../data/types';
import { Prims } from './prims';

/** Procedural tree geometry per style, in white vertex colors (tinted per-instance). Height matches STYLE[].height. */
export interface TreeGeo {
  trunk: THREE.BufferGeometry;
  foliage: THREE.BufferGeometry | null;
}

const W = 0xffffff;
const rnd = (i: number) => {
  const x = Math.sin(i * 127.1 + 31.7) * 43758.5453;
  return x - Math.floor(x);
};

function build(style: TreeStyle, lo: boolean): { t: Prims; f: Prims } {
  const t = new Prims();
  const f = new Prims();
  const seg = lo ? 5 : 8;
  const det = lo ? 0 : 1;
  switch (style) {
    case 'broadleaf':
      t.cyl(0.3, 0.46, 5, seg, 0, 2.5, 0, W);
      if (!lo) {
        t.cyl(0.1, 0.18, 2, 5, 0.8, 4.6, 0, W, [0, 0, -0.7]);
        t.cyl(0.1, 0.18, 2, 5, -0.7, 4.8, 0.3, W, [0.3, 0, 0.7]);
      }
      f.sphere(2.3, 0, 6.2, 0, W, [1, 0.85, 1], det);
      f.sphere(1.7, 1.5, 5.4, 0.4, W, undefined, det);
      f.sphere(1.6, -1.4, 5.6, -0.5, W, undefined, det);
      if (!lo) f.sphere(1.5, 0.2, 7.4, 0.3, W, undefined, det);
      break;
    case 'conifer':
      t.cyl(0.25, 0.42, 4, seg, 0, 2, 0, W);
      f.cone(2.5, 3.6, seg, 0, 4.4, 0, W);
      f.cone(2.0, 3.2, seg, 0, 6.4, 0, W);
      f.cone(1.5, 2.8, seg, 0, 8.4, 0, W);
      if (!lo) f.cone(0.9, 2.2, seg, 0, 10.0, 0, W);
      break;
    case 'birch':
      t.cyl(0.18, 0.32, 7, seg, 0, 3.5, 0, W);
      if (!lo)
        for (let i = 0; i < 4; i++) t.box(0.34, 0.08, 0.34, 0, 1 + i * 1.5, 0, 0x222222, [0, i, 0], 0.25);
      f.sphere(1.8, 0, 7.4, 0, W, [1, 1.2, 1], det);
      f.sphere(1.2, 0.9, 6.3, 0.3, W, undefined, det);
      break;
    case 'cherry':
      t.cyl(0.28, 0.42, 4, seg, 0, 2, 0, W);
      t.cyl(0.14, 0.22, 2.4, 5, 1.0, 4.4, 0, W, [0, 0, -0.9]);
      t.cyl(0.14, 0.22, 2.4, 5, -1.0, 4.4, 0.2, W, [0, 0, 0.9]);
      f.sphere(2.4, 0, 6, 0, W, [1.25, 0.8, 1.25], det);
      f.sphere(1.7, 2.2, 5.3, 0.5, W, undefined, det);
      f.sphere(1.7, -2.1, 5.2, -0.4, W, undefined, det);
      break;
    case 'redwood':
      t.cyl(0.55, 1.1, 20, seg + 2, 0, 10, 0, W);
      t.cyl(0.9, 1.4, 1.2, seg + 2, 0, 0.5, 0, W, undefined, 0.8);
      f.cone(3.4, 6, seg, 0, 19, 0, W);
      f.cone(2.6, 5, seg, 0, 22.2, 0, W);
      if (!lo) {
        f.cone(4.0, 5, seg, 0, 15.4, 0, W);
      }
      break;
    case 'palm':
      for (let i = 0; i < 5; i++)
        t.cyl(
          0.2 - i * 0.012,
          0.26 - i * 0.012,
          1.9,
          6,
          Math.sin(i * 0.4) * i * 0.12,
          0.95 + i * 1.75,
          0,
          W,
          [0, 0, -0.07 * i],
        );
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        f.box(0.5, 0.1, 3.2, Math.cos(a) * 1.5, 8.7, Math.sin(a) * 1.5, W, [0.5, -a + Math.PI / 2, 0]);
      }
      f.sphere(0.5, 0, 8.7, 0, W, undefined, 0);
      break;
    case 'cactus':
      t.cyl(0.5, 0.55, 5, seg, 0, 2.5, 0, W);
      t.sphere(0.5, 0, 5, 0, W, undefined, 0);
      t.cyl(0.28, 0.28, 1.6, 6, 0.95, 2.6, 0, W, [0, 0, 0]);
      t.cyl(0.28, 0.28, 1.4, 6, 0.4, 2.0, 0, W, [0, 0, Math.PI / 2]);
      t.cyl(0.26, 0.26, 1.3, 6, -0.95, 3.3, 0, W);
      t.cyl(0.26, 0.26, 1.2, 6, -0.5, 2.7, 0, W, [0, 0, Math.PI / 2]);
      break;
    case 'mangrove':
      t.cyl(0.3, 0.5, 4.2, seg, 0, 3.0, 0, W);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        t.cyl(0.06, 0.16, 2.6, 5, Math.cos(a) * 0.7, 1.0, Math.sin(a) * 0.7, W, [
          Math.sin(a) * 0.5,
          0,
          -Math.cos(a) * 0.5,
        ]);
      }
      f.sphere(2.1, 0, 6, 0, W, [1.1, 0.8, 1.1], det);
      f.sphere(1.5, 1.4, 5.2, 0.6, W, undefined, det);
      break;
    case 'crystal':
      t.octa(0.7, 0, 3.0, 0, W, [0.9, 4.2, 0.9], [0, 0.3, 0]);
      t.octa(0.5, 0.8, 2.0, 0.2, W, [0.8, 3, 0.8], [0, 1, 0.3]);
      t.octa(0.5, -0.7, 1.8, -0.3, W, [0.8, 2.6, 0.8], [0.2, 2, -0.3]);
      f.octa(0.5, 0.2, 6.6, 0.2, W, [0.7, 2.2, 0.7], [0.2, 0.5, 0.2]);
      f.octa(0.35, -0.9, 5.0, 0.4, W, [0.7, 2, 0.7], [0, 0, 0.4]);
      f.octa(0.35, 1.1, 4.6, -0.4, W, [0.7, 1.8, 0.7], [0, 1, -0.4]);
      break;
    case 'mushroom':
      t.cyl(0.38, 0.55, 4, seg, 0, 2, 0, W);
      f.sphere(3.0, 0, 4.6, 0, W, [1, 0.45, 1], det);
      f.cyl(2.6, 2.6, 0.2, seg + 4, 0, 4.2, 0, W, undefined, 0.8);
      break;
    case 'cloud':
      t.cyl(0.35, 0.5, 4, seg, 0, 2, 0, W);
      f.sphere(2.0, 0, 5.4, 0, W, undefined, det);
      f.sphere(1.7, 1.8, 5.0, 0.4, W, undefined, det);
      f.sphere(1.7, -1.8, 5.1, -0.3, W, undefined, det);
      f.sphere(1.5, 0.4, 6.8, 0.5, W, undefined, det);
      break;
    case 'dead':
      t.cyl(0.18, 0.4, 7, seg, 0, 3.5, 0, W, [0, 0, 0.05]);
      t.cyl(0.07, 0.17, 3, 5, 1.1, 5.6, 0, W, [0, 0, -0.9]);
      t.cyl(0.07, 0.17, 2.6, 5, -0.9, 5.0, 0.3, W, [0.3, 0, 0.9]);
      t.cyl(0.05, 0.12, 2, 5, 0.2, 7, -0.6, W, [-0.8, 0, 0.1]);
      f.octa(0.25, 2.1, 6.7, 0, W);
      f.octa(0.25, -1.7, 6.0, 0.4, W);
      break;
    case 'lava':
      t.cyl(0.35, 0.55, 5, seg, 0, 2.5, 0, W);
      t.cyl(0.1, 0.2, 2.4, 5, 1, 4.8, 0, W, [0, 0, -0.9]);
      f.cone(1.2, 3.2, 5, 0, 6.4, 0, W);
      f.cone(0.9, 2.4, 5, 1.7, 5.6, 0.2, W);
      f.cone(0.9, 2.4, 5, -1.6, 5.4, -0.2, W);
      break;
    case 'gold':
      t.cyl(0.32, 0.5, 5, seg, 0, 2.5, 0, W);
      f.octa(1.4, 0, 6.6, 0, W, [1, 1.3, 1], [0, 0.4, 0]);
      f.octa(1.0, 1.7, 5.5, 0, W, undefined, [0, 1, 0]);
      f.octa(1.0, -1.6, 5.7, 0.3, W, undefined, [0.3, 0, 0]);
      break;
    case 'willow':
      t.cyl(0.3, 0.5, 4.4, seg, 0, 2.2, 0, W);
      f.sphere(2.0, 0, 5.6, 0, W, [1.3, 0.7, 1.3], det);
      for (let i = 0; i < (lo ? 4 : 8); i++) {
        const a = (i / (lo ? 4 : 8)) * Math.PI * 2;
        f.cone(0.45, 4.2, 4, Math.cos(a) * 2.2, 4.0, Math.sin(a) * 2.2, W, [Math.PI, 0, 0]);
      }
      break;
  }
  return { t, f };
}

const cache = new Map<string, TreeGeo>();
export function treeGeo(style: TreeStyle, lo: boolean): TreeGeo {
  const k = `${style}:${lo ? 1 : 0}`;
  let g = cache.get(k);
  if (!g) {
    const { t, f } = build(style, lo);
    // slight per-vertex brightness variation for depth
    g = { trunk: t.build(), foliage: f.empty ? null : f.build() };
    for (const geo of [g.trunk, g.foliage]) {
      if (!geo) continue;
      const c = geo.getAttribute('color') as THREE.BufferAttribute;
      const p = geo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < c.count; i++) {
        const v = 0.78 + 0.22 * Math.min(1, Math.max(0, p.getY(i) / 18 + rnd(i) * 0.15));
        c.setXYZ(i, c.getX(i) * v, c.getY(i) * v, c.getZ(i) * v);
      }
    }
    cache.set(k, g);
  }
  return g;
}

export const stumpGeo = (() => {
  let g: THREE.BufferGeometry | null = null;
  return () => {
    if (!g)
      g = new Prims()
        .cyl(0.42, 0.55, 0.7, 7, 0, 0.35, 0, W)
        .cyl(0.4, 0.4, 0.05, 7, 0, 0.72, 0, W, undefined, 1.2)
        .build();
    return g;
  };
})();

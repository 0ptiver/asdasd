import * as THREE from 'three';
import type { VehicleDef } from '../data/types';
import { Prims, propMaterial } from './prims';

export interface VehicleModel {
  root: THREE.Group;
  wheels: THREE.Object3D[];
  rotors: THREE.Object3D[];
  props: THREE.Object3D[];
  lights: THREE.Object3D[];
  seat: THREE.Object3D;
}

const DARK = 0x2a2a30,
  GLASS = 0x9ad0f0,
  TIRE = 0x1c1c20,
  CHROME = 0xcfd4da,
  WOOD = 0x8a6a42,
  RUST = 0x7a4a2a;

function decals(p: Prims, def: VehicleDef, decal: string): void {
  const [w, h, l] = def.size;
  if (decal === 'stripes')
    p.box(w * 0.18, 0.04, l * 0.9, 0, h / 2 + 0.03, 0, 0xffffff).box(
      w * 0.06,
      0.04,
      l * 0.9,
      w * 0.14,
      h / 2 + 0.035,
      0,
      0xffffff,
    );
  else if (decal === 'flames')
    for (let i = 0; i < 5; i++)
      p.cone(0.18, 0.7, 4, w / 2 + 0.02, 0.1, l * 0.3 - i * l * 0.14, 0xff7a1a, [0, 0, -Math.PI / 2]);
  else if (decal === 'checker')
    for (let i = 0; i < 8; i++)
      p.box(
        0.18,
        0.18,
        0.18,
        w / 2 + 0.01,
        0.05 + (i % 2) * 0.18,
        l * 0.4 - i * 0.18,
        i % 2 ? 0xffffff : 0x111111,
      );
  else if (decal === 'stars')
    for (let i = 0; i < 4; i++)
      p.octa(0.14, w / 2 + 0.02, 0.1 + (i % 2) * 0.2, l * 0.3 - i * 0.3, 0xffe040, [1, 1, 0.2]);
  else if (decal === 'logo') p.box(0.04, 0.4, 0.8, w / 2 + 0.02, 0.05, 0, 0x2e8b3a);
}

function wheel(r: number, wd: number, tire = TIRE, rim = CHROME): THREE.Mesh {
  const p = new Prims();
  p.cyl(r, r, wd, 12, 0, 0, 0, tire, [0, 0, Math.PI / 2]);
  p.cyl(r * 0.55, r * 0.55, wd + 0.04, 8, 0, 0, 0, rim, [0, 0, Math.PI / 2]);
  p.box(wd + 0.05, r * 0.2, r * 1.0, 0, 0, 0, 0x888890);
  const m = new THREE.Mesh(p.build(), propMaterial());
  m.castShadow = true;
  return m;
}

/** Procedural vehicle models. Origin = chassis center, +z forward, +y up. */
export function buildVehicleModel(def: VehicleDef, paint: number, decal = 'none'): VehicleModel {
  const [w, h, l] = def.size;
  const b = new Prims();
  const wheels: THREE.Object3D[] = [];
  const rotors: THREE.Object3D[] = [];
  const props: THREE.Object3D[] = [];
  const lights: THREE.Object3D[] = [];
  const root = new THREE.Group();
  const hl = h / 2;
  const headlights = (zf: number, y: number, sx = w * 0.32) => {
    for (const s of [-1, 1]) b.box(0.22, 0.16, 0.06, s * sx, y, zf, 0xfff4c0);
  };
  const cab = (cw: number, ch: number, cl: number, cz: number, cy = hl) => {
    b.box(cw, ch, cl, 0, cy + ch / 2, cz, paint);
    b.box(cw * 0.96, ch * 0.5, cl * 0.9, 0, cy + ch * 0.62, cz, GLASS);
  };
  switch (def.id) {
    case 'hand_cart':
      b.box(w, 0.2, l, 0, 0, 0, WOOD)
        .box(0.1, 0.5, l, w / 2, 0.3, 0, WOOD)
        .box(0.1, 0.5, l, -w / 2, 0.3, 0, WOOD)
        .box(w, 0.5, 0.1, 0, 0.3, -l / 2, WOOD);
      b.cyl(0.04, 0.04, w + 0.4, 6, 0, 0.5, l / 2 + 0.2, WOOD, [0, 0, Math.PI / 2])
        .cyl(0.04, 0.04, 1.2, 6, w / 2, 0.2, l / 2 + 0.55, WOOD, [Math.PI / 2, 0, 0])
        .cyl(0.04, 0.04, 1.2, 6, -w / 2, 0.2, l / 2 + 0.55, WOOD, [Math.PI / 2, 0, 0]);
      break;
    case 'pickup':
    case 'jeep':
    case 'dune_buggy': {
      const jeep = def.id === 'jeep',
        buggy = def.id === 'dune_buggy';
      b.box(w, h * 0.7, l, 0, -hl * 0.2, 0, paint);
      b.box(w * 0.96, 0.3, l * 0.3, 0, hl * 0.2 + 0.1, l * 0.32, paint);
      if (!buggy) cab(w * 0.92, h * 0.85, l * (jeep ? 0.5 : 0.34), jeep ? -l * 0.05 : l * 0.02);
      if (def.id === 'pickup')
        b.box(w, 0.5, l * 0.38, 0, hl * 0.3, -l * 0.3, RUST, undefined, 0.8).box(
          w * 0.9,
          0.06,
          l * 0.34,
          0,
          hl * 0.1,
          -l * 0.3,
          DARK,
        );
      if (buggy) {
        for (const s of [-1, 1]) {
          b.cyl(0.05, 0.05, h * 2.2, 6, s * w * 0.4, hl + 0.4, 0.2, CHROME, [0, 0, 0]);
          b.cyl(0.05, 0.05, l * 0.6, 6, s * w * 0.4, hl + 1.2, -0.1, CHROME, [Math.PI / 2, 0, 0]);
        }
        b.box(w * 0.5, 0.2, 0.7, 0, hl + 0.1, 0, DARK);
      }
      if (jeep) b.box(w * 0.9, 0.1, l * 0.5, 0, hl + h * 0.85 + 0.05, -l * 0.05, 0x3a4a2a);
      headlights(l / 2 + 0.02, 0.1);
      b.box(w * 0.9, 0.2, 0.15, 0, -hl * 0.7, l / 2 + 0.05, CHROME);
      break;
    }
    case 'logging_truck':
    case 'dump_truck':
    case 'big_rig': {
      const rig = def.id === 'big_rig';
      cab(w * 0.95, h * 0.9, l * (rig ? 0.28 : 0.3), l * 0.34);
      b.box(w * 0.9, h * 0.5, l * 0.18, 0, 0, l * 0.43, paint);
      b.box(w * 0.98, 0.25, l * 0.95, 0, -hl * 0.7, 0, DARK);
      if (def.id === 'logging_truck') {
        b.box(w, 0.2, l * 0.52, 0, hl, -l * 0.22, WOOD);
        for (const z of [-0.45, -0.1])
          for (const s of [-1, 1]) b.box(0.1, 1.6, 0.1, s * (w / 2 - 0.05), hl + 0.9, l * z, WOOD);
      } else if (def.id === 'dump_truck') {
        b.box(w, 0.2, l * 0.55, 0, hl, -l * 0.2, 0x6a6a72);
        for (const s of [-1, 1]) b.box(0.2, 1.4, l * 0.55, s * (w / 2 - 0.1), hl + 0.7, -l * 0.2, paint);
        b.box(w, 1.4, 0.2, 0, hl + 0.7, -l * 0.48, paint).box(w, 1.0, 0.2, 0, hl + 0.5, l * 0.05, paint);
      } else {
        b.cyl(0.9, 0.9, 0.3, 14, 0, hl + 0.3, -l * 0.28, CHROME)
          .box(0.15, 1.2, 0.15, w * 0.46, hl + 1.2, l * 0.4, CHROME)
          .box(0.15, 1.2, 0.15, -w * 0.46, hl + 1.2, l * 0.4, CHROME);
      }
      headlights(l / 2 + 0.02, -0.1);
      break;
    }
    case 'log_trailer':
    case 'rail_car':
      b.box(w, 0.25, l, 0, -hl * 0.3, 0, def.id === 'rail_car' ? paint : 0x5a5a62);
      if (def.id === 'rail_car')
        for (const s of [-1, 1])
          b.box(0.1, 1.2, l, (s * w) / 2, 0.5, 0, paint)
            .box(w, 1.2, 0.1, 0, 0.5, -l / 2, paint)
            .box(w, 1.2, 0.1, 0, 0.5, l / 2, paint);
      else
        for (const z of [-0.4, -0.15, 0.15, 0.4])
          for (const s of [-1, 1]) b.box(0.1, 1.4, 0.1, s * (w / 2 - 0.05), 0.55, l * z, WOOD);
      b.cyl(0.05, 0.05, 1.4, 6, 0, -hl * 0.5, l / 2 + 0.7, DARK, [Math.PI / 2, 0, 0]);
      break;
    case 'tractor': {
      b.box(w * 0.8, h * 0.5, l * 0.45, 0, -hl * 0.2, l * 0.22, paint);
      b.box(w * 0.9, h * 0.4, l * 0.5, 0, -hl * 0.4, -l * 0.15, DARK);
      b.box(w * 0.85, h * 1.0, l * 0.3, 0, hl * 0.6, -l * 0.15, GLASS).box(
        w * 0.95,
        0.12,
        l * 0.36,
        0,
        hl * 0.6 + h * 0.52,
        -l * 0.15,
        paint,
      );
      b.cyl(0.08, 0.08, 1, 6, w * 0.3, hl + 0.3, l * 0.4, CHROME);
      // grapple arm
      b.box(0.25, 0.25, 2.8, 0, hl + 0.3, l / 2 + 0.8, 0x6a6a72).box(
        1.4,
        0.15,
        0.15,
        0,
        hl + 0.3,
        l / 2 + 2.2,
        0xffc040,
      );
      headlights(l / 2 + 0.02, 0.1);
      break;
    }
    case 'skidder':
      b.box(w * 0.9, h * 0.6, l * 0.6, 0, -hl * 0.1, 0, paint);
      cab(w * 0.7, h * 0.7, l * 0.28, l * 0.1, hl * 0.4);
      b.box(w * 0.5, 0.3, 0.5, 0, hl, -l * 0.42, 0x6a6a72).box(
        0.15,
        1.8,
        0.15,
        0,
        hl + 0.8,
        -l * 0.5,
        0x6a6a72,
        [0.5, 0, 0],
      );
      b.box(w * 1.0, 0.6, 0.15, 0, 0, l / 2 + 0.2, CHROME);
      break;
    case 'monster_truck':
      cab(w * 0.9, h * 0.6, l * 0.4, l * 0.06, hl * 0.4);
      b.box(w * 0.95, h * 0.45, l, 0, -hl * 0.1, 0, paint).box(
        w * 0.5,
        0.2,
        0.5,
        0,
        hl * 0.4,
        l * 0.35,
        DARK,
      );
      for (const s of [-1, 1]) b.box(0.18, 0.6, l * 0.9, s * (w / 2 + 0.1), -hl * 0.2, 0, 0xffc040);
      headlights(l / 2 + 0.02, 0, w * 0.3);
      break;
    case 'crane_truck':
      cab(w * 0.95, h * 0.5, l * 0.25, l * 0.36, hl * 0.4);
      b.box(w * 0.98, 0.3, l * 0.95, 0, -hl * 0.2, 0, DARK).box(
        w * 0.7,
        0.8,
        l * 0.4,
        0,
        hl * 0.2,
        -l * 0.18,
        paint,
      );
      b.box(0.4, 0.4, l * 0.8, 0, hl * 0.9, 0, 0xffc040, [-0.45, 0, 0]);
      b.cyl(0.4, 0.4, 0.15, 10, 0, hl * 0.2 + 2.6, l * 0.24, 0x3a3a42);
      break;
    case 'snowmobile': {
      b.box(w * 0.8, h * 0.8, l * 0.6, 0, 0, l * 0.12, paint);
      b.box(w * 0.5, 0.2, l * 0.4, 0, h * 0.5, -l * 0.15, DARK);
      b.box(w * 0.9, 0.4, 0.15, 0, h * 0.5, l * 0.3, DARK).box(0.2, 0.5, 0.1, 0, h * 0.7, l * 0.25, GLASS);
      for (const s of [-1, 1])
        b.box(0.12, 0.08, l * 0.9, s * w * 0.35, -hl - 0.3, 0.15, 0xe8e8e8).box(
          0.1,
          0.3,
          0.1,
          s * w * 0.35,
          -hl - 0.1,
          l * 0.2,
          DARK,
        );
      b.box(w * 0.6, 0.15, 0.7, 0, -hl - 0.35, -l * 0.35, 0x2a2a30);
      headlights(l / 2 - 0.05, h * 0.2, 0.15);
      break;
    }
    case 'tracked_crawler':
      b.box(w * 0.7, h * 0.7, l * 0.9, 0, 0.1, 0, paint);
      cab(w * 0.6, h * 0.8, l * 0.35, l * 0.12, hl * 0.4);
      for (const s of [-1, 1]) {
        b.box(0.7, 0.9, l * 1.02, s * (w / 2 - 0.2), -hl * 0.6, 0, 0x2a2a30);
        for (let i = 0; i < 6; i++)
          b.cyl(0.35, 0.35, 0.78, 8, s * (w / 2 - 0.2), -hl * 0.7, -l * 0.4 + i * (l * 0.16), 0x6a6a72, [
            0,
            0,
            Math.PI / 2,
          ]);
      }
      break;
    case 'mining_cart':
      b.box(w, h * 0.6, l, 0, 0, 0, 0x6a6a72).box(w * 0.9, 0.1, l * 0.9, 0, h * 0.3, 0, 0x2a2a30);
      b.box(w * 0.2, 0.2, l * 0.1, 0, h * 0.4, l / 2, RUST);
      break;
    case 'locomotive': {
      b.cyl(1.0, 1.0, l * 0.6, 14, 0, h * 0.1, l * 0.12, 0x1a1a1a, [Math.PI / 2, 0, 0]);
      b.cyl(0.9, 1.0, 0.4, 12, 0, h * 0.1, l * 0.45, 0x8a8a92, [Math.PI / 2, 0, 0]);
      b.box(w * 0.95, h * 0.7, l * 0.3, 0, h * 0.15, -l * 0.3, paint).box(
        w,
        0.2,
        l * 0.34,
        0,
        h * 0.5,
        -l * 0.3,
        0x2a2a30,
      );
      const chim = new THREE.Group();
      chim.position.set(0, h * 0.5, l * 0.35);
      b.cyl(0.25, 0.4, 1.1, 8, 0, h * 0.5 + 0.6, l * 0.35, 0x1a1a1a);
      b.box(w * 0.9, 0.3, l, 0, -hl, 0, 0x2a2a30);
      b.cone(0.7, 0.9, 4, 0, -hl * 0.4, l / 2 + 0.3, 0xc03030, [Math.PI / 2, 0, 0]);
      break;
    }
    case 'rowboat':
    case 'motorboat':
    case 'timber_barge':
    case 'ferry':
    case 'cargo_ship': {
      const hull = def.id === 'rowboat' ? 0x9a6a3a : paint;
      b.box(w, h * 0.6, l * 0.8, 0, -hl * 0.3, -l * 0.05, hull).box(
        w * 0.6,
        h * 0.6,
        l * 0.22,
        0,
        -hl * 0.3,
        l * 0.44,
        hull,
        [0, 0, 0],
      );
      b.cone(w * 0.5, l * 0.18, 4, 0, -hl * 0.3, l * 0.54, hull, [Math.PI / 2, Math.PI / 4, 0]);
      b.box(w * 0.8, 0.12, l * 0.7, 0, hl * 0.1, -l * 0.05, WOOD, undefined, 0.9);
      if (def.id === 'motorboat') {
        b.box(w * 0.7, 0.8, 1.2, 0, hl + 0.2, -l * 0.05, 0xffffff)
          .box(w * 0.6, 0.4, 0.1, 0, hl + 0.4, l * 0.04, GLASS)
          .box(0.3, 0.5, 0.6, 0, hl * 0.1, -l * 0.5 - 0.2, DARK);
      } else if (def.id === 'timber_barge') {
        for (const s of [-1, 1]) b.box(0.2, 0.8, l * 0.8, s * w * 0.46, hl * 0.5, -l * 0.05, hull);
        b.box(w * 0.5, 1.6, 2, 0, hl + 0.6, -l * 0.35, 0xe8e0d0);
      } else if (def.id === 'ferry') {
        b.box(w * 0.8, 2.4, l * 0.6, 0, hl * 0.6 + 1.2, -l * 0.05, 0xf4f4f8)
          .box(w * 0.82, 1.0, l * 0.58, 0, hl * 0.6 + 1.6, -l * 0.05, GLASS)
          .box(w * 0.5, 1.2, l * 0.2, 0, hl * 0.6 + 3.2, -l * 0.05, 0xf4f4f8);
        b.cyl(0.4, 0.5, 1.4, 8, 0, hl * 0.6 + 4.4, -l * 0.15, 0xc03030);
      } else if (def.id === 'cargo_ship') {
        for (let i = 0; i < 4; i++)
          for (let j = 0; j < 3; j++)
            b.box(
              w * 0.24,
              1.7,
              3.0,
              -w * 0.28 + j * w * 0.28,
              hl * 0.2 + 1,
              l * 0.12 - i * 3.6,
              [0xc0392b, 0x2e86de, 0xe0a010, 0x27ae60][(i + j) % 4]!,
            );
        b.box(w * 0.7, 4.5, 4, 0, hl + 1.8, -l * 0.4, 0xf0f0f0).box(
          w * 0.72,
          1.2,
          4.05,
          0,
          hl + 3,
          -l * 0.4,
          GLASS,
        );
      } else {
        b.box(w * 0.8, 0.1, 0.1, 0, hl * 0.2 + 0.2, 0, WOOD)
          .cyl(0.04, 0.04, 1.8, 6, w * 0.55, hl * 0.2 + 0.2, 0.1, WOOD, [0, 0, Math.PI / 2 + 0.5])
          .cyl(0.04, 0.04, 1.8, 6, -w * 0.55, hl * 0.2 + 0.2, 0.1, WOOD, [0, 0, -Math.PI / 2 - 0.5]);
      }
      break;
    }
    case 'balloon': {
      b.box(w * 0.8, 0.8, w * 0.8, 0, -hl, 0, WOOD).box(w * 0.85, 0.12, w * 0.85, 0, -hl + 0.45, 0, 0x5a3a20);
      for (const [x, z] of [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ] as [number, number][])
        b.cyl(0.03, 0.03, 4, 5, x * w * 0.35, hl + 1.5, z * w * 0.35, 0x3a2a1a, [x * 0.15, 0, -z * 0.15]);
      b.sphere(3.6, 0, hl + 6.5, 0, paint, [1, 1.15, 1], 2);
      b.cone(1.0, 1.8, 8, 0, hl + 3, 0, 0xd8d0b0, [Math.PI, 0, 0]);
      b.cyl(0.25, 0.4, 0.4, 6, 0, hl + 3.2, 0, 0xff8030);
      break;
    }
    case 'airship': {
      b.sphere(1, 0, 3.2, 0, paint, [w * 0.55, w * 0.5, l * 0.48], 2);
      b.box(w * 0.5, 1.2, 4.5, 0, -hl * 0.6, 0, 0xe8e0d0).box(w * 0.55, 0.5, 4.6, 0, -hl * 0.3, 0, GLASS);
      b.box(0.15, 2.4, 2.2, 0, 3.2, -l * 0.45, paint).box(2.6, 0.15, 2.2, 0, 3.2, -l * 0.45, paint);
      for (const s of [-1, 1]) b.box(0.5, 0.5, 1, s * w * 0.4, 0.4, -1, 0x3a3a42);
      break;
    }
    case 'seaplane': {
      b.cyl(0.7, 0.45, l * 0.55, 8, 0, 0, 0, paint, [Math.PI / 2, 0, 0]).cone(
        0.7,
        1.2,
        8,
        0,
        0,
        l * 0.33,
        0x3a3a42,
        [Math.PI / 2, 0, 0],
      );
      b.box(w, 0.15, 1.8, 0, 0.5, 0.3, paint)
        .box(0.15, 1.3, 1.4, 0, 0.9, -l * 0.42, paint)
        .box(2.6, 0.12, 1.0, 0, 0.4, -l * 0.42, paint);
      b.box(1.0, 0.6, 1.4, 0, 0.5, 0.9, GLASS);
      for (const s of [-1, 1]) b.box(0.4, 0.35, l * 0.5, s * 1.4, -hl - 0.1, 0, 0xe8e8e8);
      const prop = new THREE.Group();
      prop.position.set(0, 0, l * 0.39);
      const pm = new Prims().box(0.1, 2.6, 0.12, 0, 0, 0, 0x3a3a42).box(2.6, 0.1, 0.12, 0, 0, 0, 0x3a3a42);
      prop.add(new THREE.Mesh(pm.build(), propMaterial()));
      rotors.push(prop);
      break;
    }
    case 'helicopter': {
      b.sphere(1, 0, 0.3, 0.6, paint, [w * 0.5, 1.2, 2.4], 1);
      b.box(0.3, 0.3, 3.4, 0, 0.8, -3.2, paint).box(0.12, 1.2, 0.8, 0, 1.4, -4.6, paint);
      b.box(w * 0.6, 0.6, 1.6, 0, 0.6, 1.7, GLASS);
      for (const s of [-1, 1])
        b.box(0.1, 0.1, 3.4, s * 1.2, -hl - 0.2, 0.2, 0x3a3a42)
          .box(0.1, 0.9, 0.1, s * 1.2, -hl * 0.4, 0.8, 0x3a3a42)
          .box(0.1, 0.9, 0.1, s * 1.2, -hl * 0.4, -0.6, 0x3a3a42);
      b.cyl(0.12, 0.12, 0.5, 6, 0, 1.4, 0.2, 0x3a3a42);
      const rotor = new THREE.Group();
      rotor.position.set(0, 1.7, 0.2);
      rotor.add(
        new THREE.Mesh(
          new Prims().box(7, 0.06, 0.35, 0, 0, 0, 0x2a2a30).box(0.35, 0.06, 7, 0, 0, 0, 0x2a2a30).build(),
          propMaterial(),
        ),
      );
      rotors.push(rotor);
      const tail = new THREE.Group();
      tail.position.set(0.15, 1.4, -4.6);
      tail.add(new THREE.Mesh(new Prims().box(0.05, 1.4, 0.15, 0, 0, 0, 0x2a2a30).build(), propMaterial()));
      rotors.push(tail);
      break;
    }
    case 'hover_sled':
      b.box(w, h, l, 0, 0, 0, paint, undefined, 1)
        .box(w * 0.7, 0.3, l * 0.3, 0, h * 0.5, 0.3, GLASS)
        .box(w * 1.0, 0.1, l * 0.9, 0, -hl, 0, 0x40e0ff);
      for (const [x, z] of [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ] as [number, number][])
        b.cyl(0.4, 0.5, 0.12, 10, x * w * 0.4, -hl - 0.05, z * l * 0.35, 0x40e0ff);
      b.box(w * 0.4, 0.4, 0.6, 0, h * 0.4, -l * 0.35, DARK);
      break;
    case 'mech': {
      b.box(w * 0.8, h * 0.4, l * 0.6, 0, 0, 0, paint);
      b.box(w * 0.45, h * 0.2, l * 0.4, 0, h * 0.28, 0.2, GLASS);
      for (const s of [-1, 1]) {
        b.box(0.7, h * 0.5, 0.9, s * w * 0.28, -h * 0.35, 0, 0x3a3a42);
        b.box(0.5, 0.5, 2.2, s * w * 0.55, h * 0.1, 0.8, 0x6a6a72);
        b.box(0.12, 1.0, 0.9, s * w * 0.55, h * 0.1, 2.0, 0xdfe6ee);
        b.box(0.5, 0.9, 1.0, s * w * 0.3, -h * 0.5, 0.2, 0x3a3a42);
      }
      b.cyl(0.18, 0.18, 1.2, 6, w * 0.3, h * 0.5, -0.8, CHROME);
      break;
    }
    default:
      b.box(w, h, l, 0, 0, 0, paint);
  }
  decals(b, def, decal);
  const body = new THREE.Mesh(b.build(), propMaterial());
  body.castShadow = true;
  body.receiveShadow = true;
  root.add(body);
  // wheels
  const nW = def.wheels;
  if (nW > 0) {
    const track = nW === 2 ? w * 0.28 : w / 2 - def.wheelRadius * 0.35;
    const axles = nW <= 4 ? 2 : 3;
    for (let a = 0; a < axles; a++) {
      for (const sx of [-1, 1]) {
        const wm = wheel(
          def.wheelRadius,
          def.id === 'tracked_crawler' ? 0.1 : def.wheelRadius * 0.6,
          def.id === 'snowmobile' ? 0x888890 : TIRE,
        );
        wm.userData = { sx, axle: a };
        if (def.id === 'tracked_crawler') wm.visible = false;
        if (def.id === 'locomotive' || def.id === 'rail_car') wm.scale.set(1, 1, 1);
        root.add(wm);
        wheels.push(wm);
        void track;
      }
    }
  }
  for (const r of rotors) root.add(r);
  // headlight cones (toggled)
  const spot = new THREE.Group();
  spot.position.set(0, -0.1, l / 2);
  lights.push(spot);
  root.add(spot);
  const seat = new THREE.Object3D();
  seat.position.set(0, hl * 0.3, l * (def.kind === 'air' ? 0.25 : 0.05));
  root.add(seat);
  return { root, wheels, rotors, props, lights, seat };
}

const cache = new Map<string, THREE.BufferGeometry>();
void cache;

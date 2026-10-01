import { fbm } from '../core/rng';
import type { BiomeDef } from '../data/types';
import { BIOMES } from '../data/biomes';
import type { Terrain } from './terrain';

export interface DomeMesh {
  positions: Float32Array;
  indices: Uint32Array;
  colors: Float32Array;
  center: [number, number, number];
}

const AZ = 56;
const EL = 12;

/** Cave shell: a bumpy hemisphere with an arch-shaped entrance facing +x (toward the hub). */
export function buildDome(terrain: Terrain, b: BiomeDef): DomeMesh {
  const cx = b.center[0],
    cz = b.center[1];
  const base = terrain.heightAt(cx, cz) - 6;
  const R = b.radius * 0.98;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let e = 0; e <= EL; e++) {
    const el = (e / EL) * (Math.PI / 2);
    for (let a = 0; a <= AZ; a++) {
      const az = (a / AZ) * Math.PI * 2;
      const bump =
        1 + (fbm(Math.cos(az) * 3 + e * 0.4, Math.sin(az) * 3 + e * 0.4, b.center[0], 3) - 0.5) * 0.14;
      const r = R * bump;
      const x = cx + Math.cos(az) * Math.cos(el) * r;
      const z = cz + Math.sin(az) * Math.cos(el) * r;
      const y = base + Math.sin(el) * r * 0.62 + (e === 0 ? 8 : 0);
      pos.push(x, y, z);
      const shade = 0.55 + 0.45 * fbm(x * 0.05, z * 0.05 + y * 0.05, 9, 2);
      col.push(0.32 * shade, 0.28 * shade, 0.36 * shade);
    }
  }
  const stride = AZ + 1;
  for (let e = 0; e < EL; e++) {
    for (let a = 0; a < AZ; a++) {
      const az = ((a + 0.5) / AZ) * Math.PI * 2;
      const wrapped = Math.atan2(Math.sin(az), Math.cos(az));
      const elMid = ((e + 0.5) / EL) * (Math.PI / 2);
      // entrance arch: azimuth near 0 (east) and low elevation
      if (Math.abs(wrapped) < 0.23 && elMid < 0.6) continue;
      const i0 = e * stride + a,
        i1 = i0 + 1,
        i2 = (e + 1) * stride + a,
        i3 = i2 + 1;
      idx.push(i0, i2, i1, i1, i2, i3);
    }
  }
  return {
    positions: new Float32Array(pos),
    indices: new Uint32Array(idx),
    colors: new Float32Array(col),
    center: [cx, base, cz],
  };
}

export const CAVE_BIOMES = BIOMES.filter((b) => b.indoor);

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type V3 = [number, number, number];

/** Collects colored primitives into one merged vertex-colored geometry (the whole art pipeline is procedural). */
export class Prims {
  private geos: THREE.BufferGeometry[] = [];
  private tmp = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  private add(g: THREE.BufferGeometry, color: number, x: number, y: number, z: number, rot?: V3, scale?: V3, shade = 1): this {
    let geo = g.index ? g.toNonIndexed() : g;
    geo.deleteAttribute('uv');
    const col = new THREE.Color(color);
    const n = geo.attributes.position!.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = col.r * shade;
      arr[i * 3 + 1] = col.g * shade;
      arr[i * 3 + 2] = col.b * shade;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.e.set(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0);
    this.q.setFromEuler(this.e);
    this.tmp.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(scale?.[0] ?? 1, scale?.[1] ?? 1, scale?.[2] ?? 1));
    if (geo === g) geo = g.clone();
    geo.applyMatrix4(this.tmp);
    this.geos.push(geo);
    return this;
  }

  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, rot?: V3, shade = 1): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, rot, undefined, shade);
  }
  cyl(rt: number, rb: number, h: number, seg: number, x: number, y: number, z: number, color: number, rot?: V3, shade = 1): this {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y, z, rot, undefined, shade);
  }
  cone(r: number, h: number, seg: number, x: number, y: number, z: number, color: number, rot?: V3): this {
    return this.add(new THREE.ConeGeometry(r, h, seg), color, x, y, z, rot);
  }
  sphere(r: number, x: number, y: number, z: number, color: number, scale?: V3, detail = 1): this {
    return this.add(new THREE.IcosahedronGeometry(r, detail), color, x, y, z, undefined, scale);
  }
  octa(r: number, x: number, y: number, z: number, color: number, scale?: V3, rot?: V3): this {
    return this.add(new THREE.OctahedronGeometry(r, 0), color, x, y, z, rot, scale);
  }
  torus(r: number, t: number, x: number, y: number, z: number, color: number, rot?: V3): this {
    return this.add(new THREE.TorusGeometry(r, t, 6, 14), color, x, y, z, rot);
  }
  plane(w: number, h: number, x: number, y: number, z: number, color: number, rot?: V3): this {
    return this.add(new THREE.PlaneGeometry(w, h), color, x, y, z, rot);
  }
  /** Square pyramid roof (4-sided cone rotated 45°). */
  pyramid(w: number, h: number, d: number, x: number, y: number, z: number, color: number): this {
    return this.add(new THREE.ConeGeometry(0.7071, 1, 4), color, x, y, z, [0, Math.PI / 4, 0], [w, h, d]);
  }
  geometry(g: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, rot?: V3, scale?: V3): this {
    return this.add(g, color, x, y, z, rot, scale);
  }

  get empty(): boolean {
    return this.geos.length === 0;
  }

  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.geos, false);
    if (!g) throw new Error('empty prims');
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

let sharedMat: THREE.MeshLambertMaterial | null = null;
/** Shared flat-shaded vertex-color material. */
export function propMaterial(): THREE.MeshLambertMaterial {
  if (!sharedMat) sharedMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  return sharedMat;
}

export function meshOf(p: Prims, castShadow = true, receiveShadow = true): THREE.Mesh {
  const m = new THREE.Mesh(p.build(), propMaterial());
  m.castShadow = castShadow;
  m.receiveShadow = receiveShadow;
  return m;
}

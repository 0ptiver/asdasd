import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type V3 = [number, number, number];

/** Collects colored primitives into one merged vertex-colored geometry (the whole art pipeline is procedural). */
export class Prims {
  private geos: THREE.BufferGeometry[] = [];
  private tmp = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  private add(
    g: THREE.BufferGeometry,
    color: number,
    x: number,
    y: number,
    z: number,
    rot?: V3,
    scale?: V3,
    shade = 1,
  ): this {
    let geo = g.index ? g.toNonIndexed() : g;
    geo.deleteAttribute('uv');
    const col = new THREE.Color(color);
    const n = geo.attributes.position!.count;
    const arr = new Float32Array(n * 3);
    // baked ambient occlusion: darken toward the bottom of every primitive, lighten the top
    const pa = geo.attributes.position!;
    let y0 = Infinity,
      y1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const y = pa.getY(i);
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    const span = Math.max(1e-4, y1 - y0);
    for (let i = 0; i < n; i++) {
      const k = shade * (0.8 + 0.26 * ((pa.getY(i) - y0) / span));
      arr[i * 3] = col.r * k;
      arr[i * 3 + 1] = col.g * k;
      arr[i * 3 + 2] = col.b * k;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.e.set(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0);
    this.q.setFromEuler(this.e);
    this.tmp.compose(
      new THREE.Vector3(x, y, z),
      this.q,
      new THREE.Vector3(scale?.[0] ?? 1, scale?.[1] ?? 1, scale?.[2] ?? 1),
    );
    if (geo === g) geo = g.clone();
    geo.applyMatrix4(this.tmp);
    this.geos.push(geo);
    return this;
  }

  box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    color: number,
    rot?: V3,
    shade = 1,
  ): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, rot, undefined, shade);
  }
  cyl(
    rt: number,
    rb: number,
    h: number,
    seg: number,
    x: number,
    y: number,
    z: number,
    color: number,
    rot?: V3,
    shade = 1,
  ): this {
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

/** Adds world-space multi-octave noise to the albedo so flat vertex colors read as textured surfaces. */
export function addDetailNoise<T extends THREE.Material>(mat: T, strength = 0.28, pattern = false): T {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDetailPos;\nvarying vec3 vDetailN;')
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        vDetailN = normalize(mat3(modelMatrix) * objectNormal);`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 dwp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          dwp = instanceMatrix * dwp;
        #endif
        vDetailPos = (modelMatrix * dwp).xyz;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vDetailPos;
        varying vec3 vDetailN;
        float dHash(vec3 p){ p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float dNoise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(dHash(i), dHash(i + vec3(1,0,0)), f.x), mix(dHash(i + vec3(0,1,0)), dHash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(dHash(i + vec3(0,0,1)), dHash(i + vec3(1,0,1)), f.x), mix(dHash(i + vec3(0,1,1)), dHash(i + vec3(1,1,1)), f.x), f.y), f.z); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float dn = dNoise(vDetailPos * 0.55) * 0.5 + dNoise(vDetailPos * 2.3) * 0.3 + dNoise(vDetailPos * 9.0) * 0.2;
        diffuseColor.rgb *= 1.0 - ${strength.toFixed(2)} * 0.5 + ${strength.toFixed(2)} * dn;
        ${
          pattern
            ? `
        if (vDetailN.y > 0.7) {
          vec2 tp = vDetailPos.xz / 1.3;
          vec2 tc = floor(tp);
          vec2 tf = fract(tp);
          float mortar = step(tf.x, 0.045) + step(tf.y, 0.045);
          diffuseColor.rgb *= 0.9 + 0.2 * dHash(vec3(tc.x, 3.0, tc.y));
          diffuseColor.rgb *= 1.0 - 0.28 * clamp(mortar, 0.0, 1.0);
        } else if (abs(vDetailN.y) < 0.4) {
          float along = abs(vDetailN.x) > abs(vDetailN.z) ? vDetailPos.z : vDetailPos.x;
          float row = vDetailPos.y / 0.32;
          float ry = fract(row);
          float plank = floor(along / 1.1 + floor(row) * 0.37);
          diffuseColor.rgb *= 0.93 + 0.12 * dHash(vec3(plank, floor(row), 7.0));
          diffuseColor.rgb *= 1.0 - 0.22 * smoothstep(0.0, 0.07, 0.07 - min(ry, 1.0 - ry) * 0.5);
        }`
            : ''
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'detail' + strength;
  return mat;
}

let sharedMat: THREE.MeshStandardMaterial | null = null;
/** Shared smooth-shaded PBR vertex-color material with procedural surface detail. */
export function propMaterial(): THREE.MeshStandardMaterial {
  if (!sharedMat)
    sharedMat = addDetailNoise(
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.02 }),
      0.3,
    );
  return sharedMat;
}

export function meshOf(p: Prims, castShadow = true, receiveShadow = true): THREE.Mesh {
  const m = new THREE.Mesh(p.build(), propMaterial());
  m.castShadow = castShadow;
  m.receiveShadow = receiveShadow;
  return m;
}

let hubMat: THREE.MeshStandardMaterial | null = null;
/** Like propMaterial but adds paving tiles on top faces and plank siding on walls (town buildings). */
export function hubMaterial(): THREE.MeshStandardMaterial {
  if (!hubMat)
    hubMat = addDetailNoise(
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02 }),
      0.26,
      true,
    );
  return hubMat;
}

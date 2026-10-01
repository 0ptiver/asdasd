import * as THREE from 'three';

let glowMat: THREE.MeshLambertMaterial | null = null;
/** Lambert vertex-color material that supports a per-instance `aGlow` emissive factor. */
export function glowMaterial(): THREE.MeshLambertMaterial {
  if (glowMat) return glowMat;
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow;',
      );
  };
  glowMat = m;
  return m;
}

/** A fixed-capacity InstancedMesh with O(1) add/remove by string id (swap-remove). */
export class InstancePool {
  readonly mesh: THREE.InstancedMesh;
  private ids: string[] = [];
  private index = new Map<string, number>();
  private glow: THREE.InstancedBufferAttribute;
  private mat4 = new THREE.Matrix4();
  private dirty = false;

  constructor(
    geo: THREE.BufferGeometry,
    readonly capacity: number,
    material: THREE.Material = glowMaterial(),
    castShadow = true,
  ) {
    const g = geo.clone();
    this.glow = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.glow.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aGlow', this.glow);
    this.mesh = new THREE.InstancedMesh(g, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.castShadow = castShadow;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }

  get count(): number {
    return this.ids.length;
  }
  has(id: string): boolean {
    return this.index.has(id);
  }

  add(id: string, m: THREE.Matrix4, color: THREE.Color, glow = 0): boolean {
    if (this.index.has(id)) return true;
    const i = this.ids.length;
    if (i >= this.capacity) return false;
    this.ids.push(id);
    this.index.set(id, i);
    this.mesh.setMatrixAt(i, m);
    this.mesh.setColorAt(i, color);
    this.glow.setX(i, glow);
    this.mesh.count = i + 1;
    this.dirty = true;
    return true;
  }

  remove(id: string): void {
    const i = this.index.get(id);
    if (i === undefined) return;
    const last = this.ids.length - 1;
    if (i !== last) {
      const lid = this.ids[last]!;
      this.mesh.getMatrixAt(last, this.mat4);
      this.mesh.setMatrixAt(i, this.mat4);
      const c = this.mesh.instanceColor!;
      c.setXYZ(i, c.getX(last), c.getY(last), c.getZ(last));
      this.glow.setX(i, this.glow.getX(last));
      this.ids[i] = lid;
      this.index.set(lid, i);
    }
    this.ids.pop();
    this.index.delete(id);
    this.mesh.count = this.ids.length;
    this.dirty = true;
  }

  setMatrix(id: string, m: THREE.Matrix4): void {
    const i = this.index.get(id);
    if (i === undefined) return;
    this.mesh.setMatrixAt(i, m);
    this.dirty = true;
  }

  /** Direct write mode (every frame): set instance i, then call setCount(n) + flush(). */
  setAt(i: number, m: THREE.Matrix4, color: THREE.Color, glow = 0): void {
    if (i >= this.capacity) return;
    this.mesh.setMatrixAt(i, m);
    this.mesh.setColorAt(i, color);
    this.glow.setX(i, glow);
    this.dirty = true;
  }
  setCount(n: number): void {
    this.mesh.count = Math.min(n, this.capacity);
  }

  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.glow.needsUpdate = true;
  }
}

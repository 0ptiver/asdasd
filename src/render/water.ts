import * as THREE from 'three';

function makeNormalMap(): THREE.CanvasTexture {
  const size = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const h = new Float32Array(size * size);
  const f = (x: number, y: number) => Math.sin(x * 0.19) * Math.cos(y * 0.23) + Math.sin((x + y) * 0.11) * 0.7 + Math.sin(x * 0.07 - y * 0.05) * 0.5;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = f(x * (2 * Math.PI * 2) / size * 4, y * (2 * Math.PI * 2) / size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = h[y * size + ((x + 1) % size)]! - h[y * size + ((x - 1 + size) % size)]!;
      const dy = h[((y + 1) % size) * size + x]! - h[((y - 1 + size) % size) * size + x]!;
      const i = (y * size + x) * 4;
      img.data[i] = 128 + dx * 22;
      img.data[i + 1] = 128 + dy * 22;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(90, 90);
  return tex;
}

/** One big translucent water plane that follows the camera; the normal map scrolls for ripples. */
export class Water {
  readonly mesh: THREE.Mesh;
  private tex: THREE.CanvasTexture;
  private mat: THREE.MeshStandardMaterial;
  constructor() {
    this.tex = makeNormalMap();
    this.mat = new THREE.MeshStandardMaterial({
      color: 0x2a7ab8, transparent: true, opacity: 0.74, roughness: 0.12, metalness: 0.15, normalMap: this.tex, normalScale: new THREE.Vector2(0.45, 0.45), depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400, 1, 1).rotateX(-Math.PI / 2), this.mat);
    this.mesh.renderOrder = 2;
    this.mesh.receiveShadow = false;
  }
  update(t: number, cam: THREE.Vector3, tint: THREE.ColorRepresentation, daylight: number): void {
    this.mesh.position.set(Math.round(cam.x / 15.5556) * 15.5556, 0, Math.round(cam.z / 15.5556) * 15.5556);
    this.tex.offset.set(t * 0.006, t * 0.004);
    const c = new THREE.Color(tint).multiplyScalar(0.35 + 0.65 * daylight);
    this.mat.color.lerp(c, 0.05);
  }
}

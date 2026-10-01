import * as THREE from 'three';

const MAX = 5000;

interface Kind {
  life: [number, number];
  speed: [number, number];
  up: number;
  grav: number;
  size: [number, number];
  spread: number;
  fade: boolean;
  drag: number;
}
const KINDS: Record<string, Kind> = {
  chips: {
    life: [0.5, 1.0],
    speed: [2, 5],
    up: 3,
    grav: 14,
    size: [0.1, 0.18],
    spread: 1,
    fade: false,
    drag: 0.5,
  },
  leaves: {
    life: [1.2, 2.4],
    speed: [1, 4],
    up: 1,
    grav: 3.5,
    size: [0.25, 0.45],
    spread: 1.5,
    fade: true,
    drag: 1.5,
  },
  sparks: {
    life: [0.3, 0.7],
    speed: [3, 8],
    up: 2,
    grav: 12,
    size: [0.08, 0.12],
    spread: 1,
    fade: true,
    drag: 0.2,
  },
  sawdust: {
    life: [0.5, 1.2],
    speed: [1, 3],
    up: 1.5,
    grav: 2,
    size: [0.08, 0.14],
    spread: 1,
    fade: true,
    drag: 1.2,
  },
  embers: {
    life: [0.8, 1.8],
    speed: [0.5, 2],
    up: 3,
    grav: -1,
    size: [0.1, 0.18],
    spread: 0.6,
    fade: true,
    drag: 0.4,
  },
  coins: {
    life: [0.7, 1.3],
    speed: [2, 4],
    up: 6,
    grav: 14,
    size: [0.2, 0.28],
    spread: 0.7,
    fade: true,
    drag: 0.3,
  },
  dust: {
    life: [0.6, 1.4],
    speed: [1, 3],
    up: 0.8,
    grav: 0.5,
    size: [0.4, 0.8],
    spread: 1,
    fade: true,
    drag: 1.5,
  },
  splash: {
    life: [0.5, 1],
    speed: [2, 5],
    up: 5,
    grav: 14,
    size: [0.12, 0.2],
    spread: 1,
    fade: true,
    drag: 0.2,
  },
  bolt: {
    life: [0.2, 0.4],
    speed: [0, 1],
    up: 12,
    grav: 0,
    size: [0.4, 0.7],
    spread: 0.3,
    fade: true,
    drag: 0,
  },
  smoke: {
    life: [1.5, 3],
    speed: [0.5, 1.5],
    up: 2,
    grav: -0.3,
    size: [0.6, 1.2],
    spread: 0.5,
    fade: true,
    drag: 0.8,
  },
  magic: {
    life: [0.8, 1.6],
    speed: [0.5, 2],
    up: 1,
    grav: -0.5,
    size: [0.15, 0.25],
    spread: 1,
    fade: true,
    drag: 0.5,
  },
};

/** Single Points-based particle system for all effects (chips, leaves, sparks, embers, coins ...). */
export class Fx {
  readonly points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 4);
  private size = new Float32Array(MAX);
  private vel = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private grav = new Float32Array(MAX);
  private drag = new Float32Array(MAX);
  private fade = new Uint8Array(MAX);
  private n = 0;
  private c = new THREE.Color();

  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `attribute float size; attribute vec4 color; varying vec4 vC; uniform float scale;
        void main(){ vC=color; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size*scale/(-mv.z); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `varying vec4 vC; void main(){ vec2 d=gl_PointCoord-0.5; float a = smoothstep(0.5,0.25,length(d)); gl_FragColor = vec4(vC.rgb, vC.a*a); if(gl_FragColor.a<0.02) discard; }`,
      uniforms: { scale: { value: 700 } },
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    g.setDrawRange(0, 0);
  }

  setScale(h: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.scale!.value = h * 0.9;
  }

  emit(kind: string, x: number, y: number, z: number, n = 8, color?: number): void {
    const k = KINDS[kind] ?? KINDS.chips!;
    for (let i = 0; i < n; i++) {
      const j = this.n < MAX ? this.n++ : Math.floor(Math.random() * MAX);
      this.pos[j * 3] = x + (Math.random() - 0.5) * 0.4 * k.spread;
      this.pos[j * 3 + 1] = y;
      this.pos[j * 3 + 2] = z + (Math.random() - 0.5) * 0.4 * k.spread;
      const sp = k.speed[0] + Math.random() * (k.speed[1] - k.speed[0]);
      const a = Math.random() * Math.PI * 2;
      this.vel[j * 3] = Math.cos(a) * sp * k.spread;
      this.vel[j * 3 + 1] = (Math.random() * 0.6 + 0.4) * k.up;
      this.vel[j * 3 + 2] = Math.sin(a) * sp * k.spread;
      this.maxLife[j] = this.life[j] = k.life[0] + Math.random() * (k.life[1] - k.life[0]);
      this.grav[j] = k.grav;
      this.drag[j] = k.drag;
      this.fade[j] = k.fade ? 1 : 0;
      this.size[j] = (k.size[0] + Math.random() * (k.size[1] - k.size[0])) * 60;
      let hex = color ?? 0xffffff;
      if (kind === 'sparks') hex = 0xffd060;
      else if (kind === 'embers') hex = 0xff7a20;
      else if (kind === 'coins') hex = 0xffd84a;
      else if (kind === 'sawdust') hex = 0xe8d0a0;
      else if (kind === 'bolt') hex = 0xffee66;
      else if (kind === 'dust') hex = color ?? 0xb8a888;
      else if (kind === 'splash') hex = 0xbfe8ff;
      else if (kind === 'smoke') hex = color ?? 0x888888;
      this.c.set(hex);
      const v = 0.85 + Math.random() * 0.3;
      this.col[j * 4] = this.c.r * v;
      this.col[j * 4 + 1] = this.c.g * v;
      this.col[j * 4 + 2] = this.c.b * v;
      this.col[j * 4 + 3] = 1;
    }
  }

  /** A ring of short-lived particles (boss telegraphs). */
  ring(x: number, y: number, z: number, r: number, color: number): void {
    const n = Math.min(48, Math.round(r * 3));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.emit('magic', x + Math.cos(a) * r, y, z + Math.sin(a) * r, 1, color);
    }
  }

  update(dt: number): void {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const l = this.life[i]! - dt;
      if (l <= 0) continue;
      this.life[i] = l;
      const d = 1 - Math.min(1, this.drag[i]! * dt);
      this.vel[i * 3] = this.vel[i * 3]! * d;
      this.vel[i * 3 + 2] = this.vel[i * 3 + 2]! * d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1]! - this.grav[i]! * dt;
      if (w !== i) {
        for (let k = 0; k < 3; k++) {
          this.pos[w * 3 + k] = this.pos[i * 3 + k]! + this.vel[i * 3 + k]! * dt;
          this.vel[w * 3 + k] = this.vel[i * 3 + k]!;
        }
        for (let k = 0; k < 4; k++) this.col[w * 4 + k] = this.col[i * 4 + k]!;
        this.size[w] = this.size[i]!;
        this.life[w] = l;
        this.maxLife[w] = this.maxLife[i]!;
        this.grav[w] = this.grav[i]!;
        this.drag[w] = this.drag[i]!;
        this.fade[w] = this.fade[i]!;
      } else {
        for (let k = 0; k < 3; k++) this.pos[i * 3 + k] = this.pos[i * 3 + k]! + this.vel[i * 3 + k]! * dt;
      }
      if (this.fade[w]) this.col[w * 4 + 3] = Math.min(1, (l / this.maxLife[w]!) * 1.6);
      w++;
    }
    this.n = w;
    const g = this.points.geometry;
    g.setDrawRange(0, w);
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('size') as THREE.BufferAttribute).needsUpdate = true;
  }
}

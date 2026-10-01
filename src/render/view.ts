import * as THREE from 'three';
import type { Game } from '../core/game';
import type { Sim } from '../core/sim';

/** Rendering side. Reads the Sim; never mutates game state. */
export class View {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.1, 2500);
  sim: Sim | null = null;
  private idle = new THREE.Group();

  constructor(
    readonly game: Game,
    readonly canvas: HTMLCanvasElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color(0x9ecbff);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x446644, 1.1));
    this.scene.add(this.idle);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  async preload(progress: (p: number) => void): Promise<void> {
    const logo = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshStandardMaterial({ color: 0xc0853a }),
    );
    this.idle.add(logo);
    this.camera.position.set(4, 3, 6);
    this.camera.lookAt(0, 0, 0);
    progress(1);
  }

  attach(sim: Sim): void {
    this.sim = sim;
    this.idle.visible = false;
  }
  detach(): void {
    this.sim = null;
    this.idle.visible = true;
  }
  applyQuality(): void {
    const q = this.game.settings.quality;
    const pr = q === 'low' ? 0.75 : q === 'medium' ? 1 : q === 'high' ? 1.5 : 2;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, pr));
    this.renderer.shadowMap.enabled = this.game.settings.shadows && q !== 'low';
    this.resize();
  }
  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  render(_alpha: number, dt: number): void {
    if (!this.sim) this.idle.rotation.y += dt * 0.6;
    this.renderer.render(this.scene, this.camera);
  }
}

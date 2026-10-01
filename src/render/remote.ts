import * as THREE from 'three';
import type { Game } from '../core/game';
import { Human } from './models';
import { hash2 } from '../core/rng';

function nameTag(text: string): THREE.Sprite {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 48;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = 'rgba(20,14,8,0.7)';
  ctx.fillRect(0, 0, 256, 48);
  ctx.fillStyle = '#ffe8a8';
  ctx.font = '800 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 26);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  sp.scale.set(2.4, 0.45, 1);
  sp.position.y = 2.5;
  sp.renderOrder = 10;
  return sp;
}

/** Other players (multiplayer ghosts): simple humanoids with name tags, smoothed between presence snapshots. */
export class RemoteRender {
  readonly group = new THREE.Group();
  private models = new Map<string, { h: Human; tag: THREE.Sprite }>();
  constructor(private game: Game) {}

  update(dt: number): void {
    const net = this.game.net;
    for (const [id, m] of this.models) {
      if (!net.players.has(id)) {
        this.group.remove(m.h.root);
        this.models.delete(id);
      }
    }
    for (const p of net.players.values()) {
      let m = this.models.get(p.id);
      if (!m) {
        const r = hash2(p.id.length * 31, p.id.charCodeAt(0) * 7, 1);
        const h = new Human({
          shirt: [0x2e86de, 0x27ae60, 0x8e44ad, 0xe67e22, 0x16a085, 0xc0392b][Math.floor(r * 6)]!,
          pants: 0x3a3a4a,
          hat: r > 0.5 ? 0x2a2a2a : null,
          beard: r > 0.7,
        });
        const tag = nameTag(p.name);
        h.root.add(tag);
        m = { h, tag };
        this.models.set(p.id, m);
        this.group.add(h.root);
      }
      const k = 1 - Math.exp(-dt * 10);
      p.rx = (p.rx ?? p.x) + (p.x - (p.rx ?? p.x)) * k;
      p.ry = (p.ry ?? p.y) + (p.y - (p.ry ?? p.y)) * k;
      p.rz = (p.rz ?? p.z) + (p.z - (p.rz ?? p.z)) * k;
      m.h.root.position.set(p.rx, p.ry, p.rz);
      m.h.root.rotation.y = p.yaw;
      m.h.root.visible = !p.vehicle;
      m.h.animate(dt, p.moving, -1);
    }
  }
}

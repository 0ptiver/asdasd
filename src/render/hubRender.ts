import * as THREE from 'three';
import type { HubLayout, PartDesc, SignDesc } from '../world/hub';
import { Prims, propMaterial } from './prims';

function signTexture(s: SignDesc): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  const scale = 128;
  cv.width = Math.round(s.w * scale);
  cv.height = Math.round(s.h * scale);
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = s.bg;
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.strokeStyle = s.fg;
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, cv.width - 8, cv.height - 8);
  ctx.fillStyle = s.fg;
  ctx.font = `800 ${Math.floor(cv.height * 0.5)}px 'Trebuchet MS', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = cv.height * 0.5;
  while (ctx.measureText(s.text).width > cv.width - 20 && size > 8) {
    size -= 2;
    ctx.font = `800 ${size}px 'Trebuchet MS', sans-serif`;
  }
  ctx.fillText(s.text, cv.width / 2, cv.height / 2 + 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class HubRender {
  readonly group = new THREE.Group();
  readonly saw: THREE.Object3D | null = null;
  private sawMesh: THREE.Mesh | null = null;

  constructor(layout: HubLayout) {
    const p = new Prims();
    for (const d of layout.parts) this.addPart(p, d);
    const mesh = new THREE.Mesh(p.build(), propMaterial());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    for (const s of layout.signs) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(s.w, s.h),
        new THREE.MeshBasicMaterial({ map: signTexture(s), side: THREE.DoubleSide }),
      );
      m.position.set(s.x, s.y, s.z);
      m.rotation.y = s.ry;
      this.group.add(m);
    }
    // animated saw blade next to the conveyor
    const intake = layout.sawIntake;
    const blade = new THREE.Mesh(
      new THREE.CylinderGeometry(1.25, 1.25, 0.1, 24),
      new THREE.MeshLambertMaterial({ color: 0xdfe6ee, flatShading: true }),
    );
    blade.rotation.z = Math.PI / 2;
    blade.position.set(intake.x + 12.6 + 0.1, intake.y + 0.2, intake.z);
    blade.rotation.x = 0;
    blade.rotation.y = 0;
    this.sawMesh = blade;
    // teeth
    const teeth = new Prims();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      teeth.box(0.28, 0.12, 0.24, Math.cos(a) * 1.28, 0, Math.sin(a) * 1.28, 0xb0b8c0, [0, -a, 0]);
    }
    const tm = new THREE.Mesh(teeth.build(), propMaterial());
    blade.add(tm);
    blade.rotation.set(0, 0, Math.PI / 2);
    // set blade axis facing z (vertical disc, axis along z)
    blade.rotation.set(Math.PI / 2, 0, 0);
    this.group.add(blade);
  }

  private addPart(p: Prims, d: PartDesc): void {
    switch (d.t) {
      case 'box':
        p.box(d.w, d.h, d.d, d.x, d.y, d.z, d.c, [d.rx ?? 0, d.ry ?? 0, d.rz ?? 0]);
        break;
      case 'cyl':
        p.cyl(d.rt, d.rb, d.h, d.seg ?? 10, d.x, d.y, d.z, d.c);
        break;
      case 'cone':
        p.cone(d.r, d.h, d.seg ?? 8, d.x, d.y, d.z, d.c);
        break;
      case 'pyr':
        p.pyramid(d.w, d.h, d.d, d.x, d.y, d.z, d.c);
        break;
      case 'sphere':
        p.sphere(d.r, d.x, d.y, d.z, d.c, undefined, 1);
        break;
    }
  }

  update(t: number, sawing: boolean): void {
    if (this.sawMesh) this.sawMesh.rotation.y += sawing ? 0.5 : 0.04;
    void t;
  }
}

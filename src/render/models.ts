import * as THREE from 'three';
import type { AxeDef } from '../data/types';
import { Prims, propMaterial, meshOf } from './prims';

export interface HumanOpts {
  shirt: number;
  pants: number;
  skin?: number;
  hat?: number | null;
  hair?: number;
  beard?: boolean;
  apron?: number | null;
  boots?: number;
  scale?: number;
}

export class Human {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly head: THREE.Mesh;
  readonly torso: THREE.Mesh;
  readonly armL = new THREE.Group();
  readonly armR = new THREE.Group();
  readonly legL = new THREE.Group();
  readonly legR = new THREE.Group();
  /** attach point in the right hand */
  readonly hand = new THREE.Group();
  private phase = 0;
  private held: THREE.Object3D | null = null;

  constructor(o: HumanOpts) {
    const skin = o.skin ?? 0xe8b88a;
    const part = (p: Prims) => {
      const m = meshOf(p, true, false);
      return m;
    };
    const hair = o.hair ?? 0x5a3a20;
    const belt = 0x3a2a1a;
    this.torso = part(
      new Prims()
        .cyl(0.27, 0.23, 0.72, 10, 0, 0, 0, o.shirt, undefined, 1)
        .sphere(0.17, -0.27, 0.3, 0, o.shirt, [1.1, 0.9, 1], 1)
        .sphere(0.17, 0.27, 0.3, 0, o.shirt, [1.1, 0.9, 1], 1)
        .cyl(0.245, 0.245, 0.09, 10, 0, -0.3, 0, belt)
        .box(0.1, 0.1, 0.03, 0, -0.3, 0.235, 0xd9b44a)
        .cyl(0.08, 0.09, 0.1, 8, 0, 0.4, 0, skin),
    );
    if (o.apron) this.torso.add(part(new Prims().box(0.4, 0.5, 0.04, 0, -0.1, 0.22, o.apron)));
    this.torso.position.y = 1.2;
    const hp = new Prims().sphere(0.2, 0, 0, 0, skin, [1, 1.08, 1], 2);
    hp.sphere(0.04, -0.075, 0.02, 0.17, 0xfaf6ee, [1, 1.1, 0.6], 1)
      .sphere(0.04, 0.075, 0.02, 0.17, 0xfaf6ee, [1, 1.1, 0.6], 1)
      .sphere(0.022, -0.075, 0.02, 0.2, 0x1b1b22, undefined, 0)
      .sphere(0.022, 0.075, 0.02, 0.2, 0x1b1b22, undefined, 0)
      .sphere(0.04, 0, -0.04, 0.2, skin, [0.8, 1, 1], 1)
      .sphere(0.035, -0.2, 0, 0, skin, [0.6, 1, 1], 1)
      .sphere(0.035, 0.2, 0, 0, skin, [0.6, 1, 1], 1);
    if (o.beard) hp.sphere(0.17, 0, -0.1, 0.06, hair, [1, 0.8, 0.9], 1);
    hp.sphere(0.215, 0, 0.05, -0.03, hair, [1, 0.85, 1.02], 1);
    if (o.hat != null) {
      hp.cyl(0.26, 0.26, 0.035, 14, 0, 0.13, 0, o.hat).cyl(0.17, 0.2, 0.17, 12, 0, 0.22, 0, o.hat);
      hp.cyl(0.18, 0.18, 0.04, 12, 0, 0.17, 0, 0x222222);
    }
    this.head = part(hp);
    this.head.position.y = 1.86;
    const limb = (w: number, h: number, c: number, c2: number, boot: boolean) => {
      const g = new THREE.Group();
      const pr = new Prims()
        .sphere(w * 0.62, 0, 0, 0, c, [1, 1, 1], 1)
        .cyl(w * 0.56, w * 0.46, h, 9, 0, -h / 2, 0, c)
        .sphere(w * 0.52, 0, -h + 0.02, boot ? 0.05 : 0, c2, boot ? [1, 0.7, 1.5] : [1, 1, 1], 1);
      if (boot) pr.cyl(w * 0.6, w * 0.6, h * 0.22, 9, 0, -h * 0.9, 0, c2);
      g.add(part(pr));
      return g;
    };
    this.legL.add(limb(0.26, 0.88, o.pants, o.boots ?? 0x3a2a1a, true).children[0]!);
    this.legR.add(limb(0.26, 0.88, o.pants, o.boots ?? 0x3a2a1a, true).children[0]!);
    this.legL.position.set(-0.13, 0.9, 0);
    this.legR.position.set(0.13, 0.9, 0);
    this.armL.add(limb(0.2, 0.68, o.shirt, skin, false).children[0]!);
    this.armR.add(limb(0.2, 0.68, o.shirt, skin, false).children[0]!);
    this.armL.position.set(-0.4, 1.5, 0);
    this.armR.position.set(0.4, 1.5, 0);
    this.hand.position.set(0, -0.66, 0.05);
    this.armR.add(this.hand);
    this.body.add(this.torso, this.head, this.legL, this.legR, this.armL, this.armR);
    this.root.add(this.body);
    this.root.scale.setScalar(o.scale ?? 1);
  }

  setHeld(obj: THREE.Object3D | null): void {
    if (this.held) this.hand.remove(this.held);
    this.held = obj;
    if (obj) {
      this.hand.add(obj);
    }
  }

  /** speed = horizontal m/s, swing = 0..1 chop phase (or -1 when idle), carry = arms forward holding a log. */
  animate(dt: number, speed: number, swing: number, grabbing = false, swimming = false): void {
    this.phase += dt * (3 + speed * 0.9);
    const k = Math.min(1, speed / 6);
    const s = Math.sin(this.phase) * 0.9 * k;
    this.legL.rotation.x = s;
    this.legR.rotation.x = -s;
    this.armL.rotation.x = -s * 0.8;
    this.torso.rotation.y = Math.sin(this.phase) * 0.06 * k;
    this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.05 * k + (swimming ? -0.5 : 0);
    if (swing >= 0) {
      // wind-up (0..0.4) then slam (0.4..0.62) then recover
      let a: number;
      if (swing < 0.4) a = -0.2 - (swing / 0.4) * 2.3;
      else if (swing < 0.62) a = -2.5 + ((swing - 0.4) / 0.22) * 2.6;
      else a = 0.1 - ((swing - 0.62) / 0.38) * 0.35;
      this.armR.rotation.x = a;
      this.armR.rotation.z = -0.05;
      this.torso.rotation.x = swing > 0.4 && swing < 0.62 ? 0.25 : 0;
    } else if (grabbing) {
      this.armR.rotation.x = -1.3;
      this.armL.rotation.x = -1.3;
      this.torso.rotation.x = 0;
    } else {
      this.armR.rotation.x = s * 0.8 - (this.held ? 0.5 : 0);
      this.torso.rotation.x = 0;
    }
  }
}

// ---------------------------------------------------------------- axes
const HANDLE_Y = 0.55;

/** Procedural axe model. Origin at the grip; blade extends +Y (up) and head faces +Z. */
export function makeAxeModel(
  a: Pick<AxeDef, 'shape' | 'head' | 'handle' | 'glow'>,
  skinTint: number | null = null,
): THREE.Group {
  const p = new Prims();
  const head = skinTint ?? a.head;
  const hl =
    a.shape === 'long'
      ? 1.45
      : a.shape === 'maul'
        ? 1.05
        : a.shape === 'hatchet'
          ? 0.75
          : a.shape === 'chainsaw'
            ? 0.5
            : 1.0;
  if (a.shape !== 'chainsaw') p.cyl(0.035, 0.04, hl, 6, 0, hl / 2 - 0.1, 0, a.handle);
  const top = hl - 0.1;
  switch (a.shape) {
    case 'hatchet':
      p.box(0.06, 0.2, 0.2, 0, top - 0.1, 0.08, head).box(0.05, 0.22, 0.04, 0, top - 0.1, 0.21, 0xe8eef4);
      break;
    case 'axe':
      p.box(0.07, 0.26, 0.28, 0, top - 0.12, 0.1, head)
        .box(0.04, 0.3, 0.05, 0, top - 0.12, 0.27, 0xe8eef4)
        .box(0.08, 0.08, 0.1, 0, top + 0.03, -0.02, head);
      break;
    case 'double':
      p.box(0.07, 0.26, 0.5, 0, top - 0.12, 0, head)
        .box(0.04, 0.3, 0.05, 0, top - 0.12, 0.27, 0xe8eef4)
        .box(0.04, 0.3, 0.05, 0, top - 0.12, -0.27, 0xe8eef4);
      break;
    case 'maul':
      p.box(0.2, 0.22, 0.34, 0, top - 0.05, 0.02, head).box(0.1, 0.2, 0.1, 0, top - 0.05, 0.22, 0xdfe6ee);
      break;
    case 'pick':
      p.box(0.06, 0.14, 0.6, 0, top, 0, head)
        .cone(0.05, 0.2, 5, 0, top, 0.38, head, [Math.PI / 2, 0, 0])
        .cone(0.05, 0.2, 5, 0, top, -0.38, head, [-Math.PI / 2, 0, 0]);
      break;
    case 'cleaver':
      p.box(0.05, 0.4, 0.34, 0, top - 0.2, 0.15, head).box(0.03, 0.4, 0.04, 0, top - 0.2, 0.33, 0xe8eef4);
      break;
    case 'curved':
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        p.box(0.05, 0.18, 0.1, 0, top - 0.05 + Math.sin(t * Math.PI) * 0.1, 0.06 + t * 0.34, head, [
          t * 0.8 - 0.4,
          0,
          0,
        ]);
      }
      break;
    case 'long':
      p.box(0.06, 0.26, 0.26, 0, top - 0.1, 0.1, head)
        .box(0.04, 0.3, 0.04, 0, top - 0.1, 0.24, 0xe8eef4)
        .cone(0.04, 0.22, 5, 0, top + 0.18, 0, head);
      break;
    case 'blade':
      p.box(0.05, 0.12, 0.22, 0, top - 0.2, 0.08, head)
        .box(0.04, 0.55, 0.08, 0, top + 0.18, 0.08, head, [0.1, 0, 0])
        .cone(0.05, 0.22, 4, 0, top + 0.58, 0.14, head, [0.1, 0, 0]);
      break;
    case 'chainsaw':
      p.box(0.14, 0.2, 0.34, 0, 0.1, 0, a.head)
        .box(0.06, 0.1, 0.7, 0, 0.12, 0.5, 0xcfd4da)
        .box(0.07, 0.03, 0.72, 0, 0.2, 0.5, 0x444)
        .box(0.07, 0.03, 0.72, 0, 0.04, 0.5, 0x444)
        .box(0.04, 0.2, 0.04, 0, 0.35, -0.1, 0x222);
      break;
  }
  const g = new THREE.Group();
  const m = new THREE.Mesh(p.build(), propMaterial());
  m.castShadow = true;
  g.add(m);
  if (a.glow) {
    const gm = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 8),
      new THREE.MeshBasicMaterial({
        color: a.glow,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    gm.position.set(0, top - 0.1, 0.12);
    g.add(gm);
  }
  g.userData.handleY = HANDLE_Y;
  return g;
}

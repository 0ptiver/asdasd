import * as THREE from 'three';
import type { Sim } from '../core/sim';
import { buildDome, CAVE_BIOMES } from '../world/caves';
import { OUTPOSTS, SHAFTS } from '../world/landmarks';
import { BRIDGE } from '../world/layout';
import { Prims, propMaterial } from './prims';
import { buildVehicleModel } from './vehicleModels';
import { VEHICLE_BY_ID } from '../data/vehicles';

/** Static world landmarks: caves, fast-travel stations, secrets, shafts, outposts, bridge gate, ferry. */
export class LandmarkRender {
  readonly group = new THREE.Group();
  private secretGroup = new THREE.Group();
  private secretSig = '';
  private gateArm: THREE.Mesh;
  private ferry: THREE.Group;
  private glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  private t = 0;

  constructor(private sim: Sim) {
    const T = sim.streamer.terrain;
    // caves
    for (const b of CAVE_BIOMES) {
      const d = buildDome(T, b);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(d.positions, 3));
      g.setAttribute('color', new THREE.BufferAttribute(d.colors, 3));
      g.setIndex(new THREE.BufferAttribute(d.indices, 1));
      g.computeVertexNormals();
      const m = new THREE.Mesh(
        g,
        new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }),
      );
      m.receiveShadow = true;
      this.group.add(m);
      // stalactites inside
      const p = new Prims();
      for (let i = 0; i < 40; i++) {
        const a = (i * 2.399) % (Math.PI * 2),
          r = (0.2 + ((i * 0.618) % 1) * 0.7) * b.radius;
        const x = b.center[0] + Math.cos(a) * r,
          z = b.center[1] + Math.sin(a) * r;
        const h = 3 + (i % 5) * 1.6;
        p.cone(0.8 + (i % 3) * 0.3, h, 5, x, T.heightAt(x, z) + h / 2, z, 0x4a4256);
      }
      this.group.add(new THREE.Mesh(p.build(), propMaterial()));
    }
    // stations, shafts, outposts
    const p = new Prims();
    const glow = new Prims();
    for (const s of sim.world.stationList) {
      const y = s.biome === 'sky' ? 220 : T.heightAt(s.x, s.z);
      p.cyl(0.9, 1.3, 0.5, 8, s.x, y + 0.25, s.z, 0x8a8a92).cyl(
        0.45,
        0.6,
        2.4,
        6,
        s.x,
        y + 1.7,
        s.z,
        0x6a6a74,
      );
      glow.octa(0.55, s.x, y + 3.4, s.z, 0x66e0ff, [1, 1.6, 1]);
    }
    for (const sh of SHAFTS) {
      for (const [x, z] of [sh.a, sh.b]) {
        const y = T.heightAt(x, z);
        p.box(0.4, 3.4, 0.4, x - 1.6, y + 1.7, z, 0x6a4a2a)
          .box(0.4, 3.4, 0.4, x + 1.6, y + 1.7, z, 0x6a4a2a)
          .box(4, 0.4, 0.5, x, y + 3.5, z, 0x6a4a2a)
          .box(2.8, 3, 0.2, x, y + 1.5, z + 0.1, 0x14101a);
      }
    }
    for (const o of OUTPOSTS) {
      const y = T.heightAt(o.x, o.z);
      p.box(7, 3.2, 5, o.x, y + 1.6, o.z, 0xb8956a)
        .pyramid(8.4, 2.2, 6.4, o.x, y + 4.2, o.z, 0x6a3a2a)
        .box(1.4, 2.2, 0.15, o.x, y + 1.1, o.z + 2.55, 0x4a3220);
      p.cyl(0.1, 0.1, 6, 5, o.x + 4.2, y + 3, o.z, 0x3a2a1a).box(
        1.6,
        0.9,
        0.05,
        o.x + 5,
        y + 5.4,
        o.z,
        0xe0c040,
      );
    }
    // bridge gate arm (visual)
    const arm = new THREE.Mesh(
      new Prims().box(0.2, 0.3, BRIDGE.width - 0.4, 0, 0, 0, 0xe0a010).build(),
      propMaterial(),
    );
    arm.position.set(BRIDGE.x - BRIDGE.halfLen - 1, BRIDGE.y + 1.5, BRIDGE.z);
    this.gateArm = arm;
    this.group.add(arm);
    this.group.add(new THREE.Mesh(p.build(), propMaterial()));
    this.group.add(new THREE.Mesh(glow.build(), this.glowMat));
    this.group.add(this.secretGroup);
    // ferry
    const fd = VEHICLE_BY_ID.ferry!;
    this.ferry = buildVehicleModel(fd, fd.color).root;
    this.group.add(this.ferry);
  }

  private buildSecrets(): void {
    this.secretGroup.clear();
    const T = this.sim.streamer.terrain;
    const p = new Prims();
    const g = new Prims();
    for (const s of this.sim.world.secrets) {
      if (this.sim.state.world.secrets.includes(s.id)) continue;
      const y = s.biome === 'sky' ? (T.skyIslandHeight(s.x, s.z) ?? 220) : T.heightAt(s.x, s.z);
      if (s.kind === 'acorn') g.sphere(0.35, s.x, y + 0.5, s.z, 0xffd23a, [1, 1.2, 1], 1);
      else if (s.kind === 'chest') {
        p.box(0.9, 0.6, 0.6, s.x, y + 0.3, s.z, 0x7a5230).box(0.95, 0.25, 0.65, s.x, y + 0.75, s.z, 0x5a3a1a);
        g.box(0.12, 0.2, 0.05, s.x, y + 0.6, s.z + 0.33, 0xffd23a);
      } else if (s.kind === 'statue') {
        p.box(0.9, 0.5, 0.9, s.x, y + 0.25, s.z, 0x8a8a92)
          .cyl(0.3, 0.4, 1.5, 6, s.x, y + 1.2, s.z, 0x9a9aa2)
          .sphere(0.35, s.x, y + 2.2, s.z, 0xa8a8b0, undefined, 1);
        g.octa(0.15, s.x, y + 2.9, s.z, 0x66ffcc);
      } else {
        p.cyl(0.25, 0.4, 2, 6, s.x, y + 1, s.z, 0x6a5a8a);
        g.octa(0.4, s.x, y + 2.4, s.z, 0xc080ff, [1, 1.5, 1]);
      }
    }
    if (!p.empty) this.secretGroup.add(new THREE.Mesh(p.build(), propMaterial()));
    if (!g.empty) this.secretGroup.add(new THREE.Mesh(g.build(), this.glowMat));
  }

  update(dt: number): void {
    this.t += dt;
    const sig = String(this.sim.state.world.secrets.length);
    if (sig !== this.secretSig) {
      this.secretSig = sig;
      this.buildSecrets();
    }
    this.gateArm.visible = !this.sim.world.tollActive();
    const f = this.sim.world.ferry;
    this.ferry.position.set(f.x, f.y + Math.sin(this.t * 1.2) * 0.1, f.z);
    this.ferry.rotation.y = f.yaw;
  }
}

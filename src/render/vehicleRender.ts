import * as THREE from 'three';
import type { Sim } from '../core/sim';
import type { LiveVehicle } from '../systems/vehicles';
import { wheelLayout } from '../systems/vehicles';
import { buildVehicleModel, type VehicleModel } from './vehicleModels';
import { RAIL } from '../world/terrain';
import { Prims, propMaterial } from './prims';

interface Entry {
  lv: LiveVehicle;
  model: VehicleModel;
  key: string;
  smokeT: number;
}

const OPEN = new Set([
  'hand_cart',
  'snowmobile',
  'dune_buggy',
  'rowboat',
  'motorboat',
  'balloon',
  'timber_barge',
  'hover_sled',
  'jeep',
  'tractor',
]);

/** Renders live vehicles (models, wheel animation, rotors, headlights) and the railway. */
export class VehicleRenderer {
  readonly group = new THREE.Group();
  private entries = new Map<string, Entry>();
  private spot = new THREE.SpotLight(0xfff2c0, 0, 70, 0.5, 0.5, 1.2);
  private rails = new THREE.Group();

  constructor(private sim: Sim) {
    this.group.add(this.spot, this.spot.target);
    this.buildRails();
    this.group.add(this.rails);
  }

  private buildRails(): void {
    const T = this.sim.streamer.terrain;
    const p = new Prims();
    const ties: { x: number; y: number; z: number; yaw: number }[] = [];
    for (let i = 0; i < RAIL.length - 1; i++) {
      const a = RAIL[i]!,
        b = RAIL[i + 1]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
      const n = Math.ceil(len / 1.6);
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const x = a[0] + (b[0] - a[0]) * t,
          z = a[1] + (b[1] - a[1]) * t;
        ties.push({ x, y: T.heightAt(x, z), z, yaw });
      }
    }
    const geo = new Prims()
      .box(2.3, 0.14, 0.34, 0, 0.12, 0, 0x5a3a24)
      .box(0.12, 0.14, 0.4, 0.8, 0.26, 0, 0x8a8a92)
      .box(0.12, 0.14, 0.4, -0.8, 0.26, 0, 0x8a8a92)
      .build();
    const mesh = new THREE.InstancedMesh(geo, propMaterial(), ties.length);
    const m = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      v = new THREE.Vector3(),
      s = new THREE.Vector3(1, 1, 1);
    ties.forEach((t, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.yaw);
      m.compose(v.set(t.x, t.y, t.z), q, s);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, new THREE.Color(1, 1, 1));
    });
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    this.rails.add(mesh);
    void p;
  }

  private make(lv: LiveVehicle): Entry {
    const model = buildVehicleModel(lv.def, lv.owned.paint, lv.owned.decal);
    this.group.add(model.root);
    return { lv, model, key: `${lv.owned.paint}:${lv.owned.decal}`, smokeT: 0 };
  }

  update(
    dt: number,
    fx: (kind: string, x: number, y: number, z: number, n: number, color?: number) => void,
    playerModel: { root: THREE.Object3D } | null,
    night: boolean,
  ): void {
    const veh = this.sim.vehicles;
    // sync set
    for (const [uid, e] of this.entries) {
      if (!veh.live.has(uid)) {
        this.group.remove(e.model.root);
        this.entries.delete(uid);
      }
    }
    for (const lv of veh.live.values()) {
      let e = this.entries.get(lv.owned.uid);
      if (!e) {
        e = this.make(lv);
        this.entries.set(lv.owned.uid, e);
      }
      if (e.key !== `${lv.owned.paint}:${lv.owned.decal}`) {
        this.group.remove(e.model.root);
        e = this.make(lv);
        this.entries.set(lv.owned.uid, e);
      }
      const t = lv.body.translation();
      const q = lv.body.rotation();
      const r = e.model.root;
      r.position.set(t.x, t.y, t.z);
      r.quaternion.set(q.x, q.y, q.z, q.w);
      // wheels
      const lay = wheelLayout(lv.def);
      const rest = Math.max(0.3, lv.def.wheelRadius * 0.7);
      e.model.wheels.forEach((w, i) => {
        const wl = lay[i];
        if (!wl) return;
        let sl = rest;
        if (lv.ctrl) sl = lv.ctrl.wheelSuspensionLength(i) ?? rest;
        w.position.set(wl.x, -lv.halfH + 0.12 - sl, wl.z);
        w.rotation.set(lv.wheelSpin, wl.steer ? lv.steerAngle : 0, 0, 'YXZ');
      });
      for (const rot of e.model.rotors) {
        if (lv.control === 'plane') rot.rotation.z = lv.rotor * 2;
        else if (rot.position.x > 0.1) rot.rotation.x = lv.rotor;
        else rot.rotation.y = lv.rotor;
      }
      // damage smoke
      if (lv.owned.hp < 40 && (lv.driver || lv.owned.hp < 20)) {
        e.smokeT -= dt;
        if (e.smokeT <= 0) {
          e.smokeT = 0.12;
          fx('smoke', t.x, t.y + lv.def.size[1], t.z, 1, 0x333333);
        }
      }
      // boat wake
      if ((lv.control === 'boat' || lv.control === 'hover') && Math.abs(lv.speed) > 3 && Math.random() < 0.4)
        fx('splash', t.x, 0.2, t.z, 2);
    }
    // headlight on current vehicle
    const cur = veh.current;
    if (cur && (cur.lights || night)) {
      const t = cur.body.translation();
      const q = cur.body.rotation();
      const yaw = 2 * Math.atan2(q.y, q.w);
      this.spot.intensity = 14;
      this.spot.position.set(
        t.x + Math.sin(yaw) * (cur.def.size[2] / 2),
        t.y + 0.2,
        t.z + Math.cos(yaw) * (cur.def.size[2] / 2),
      );
      this.spot.target.position.set(t.x + Math.sin(yaw) * 30, t.y - 1.5, t.z + Math.cos(yaw) * 30);
    } else this.spot.intensity = 0;
    // seated player
    if (playerModel) {
      if (cur && OPEN.has(cur.def.id)) {
        const e = this.entries.get(cur.owned.uid);
        if (e) {
          playerModel.root.visible = true;
          const wp = new THREE.Vector3();
          e.model.seat.getWorldPosition(wp);
          playerModel.root.position.set(wp.x, wp.y - 0.55, wp.z);
          const q = cur.body.rotation();
          playerModel.root.rotation.y = 2 * Math.atan2(q.y, q.w);
        }
      } else playerModel.root.visible = !cur;
    }
  }
}

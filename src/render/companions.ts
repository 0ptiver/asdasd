import * as THREE from 'three';
import type { Sim } from '../core/sim';
import { InstancePool } from './instancePool';
import { Prims } from './prims';
import { ITEM_BY_ID } from '../data/items';
import { Human } from './models';
import { HUB } from '../world/layout';

const CAP = 700;

function geoRock(): THREE.BufferGeometry {
  return new Prims()
    .octa(0.7, 0, 0.45, 0, 0xffffff, [1, 0.8, 1], [0.2, 0.5, 0])
    .octa(0.4, 0.5, 0.25, 0.3, 0xffffff, undefined, [0, 1, 0])
    .octa(0.35, -0.4, 0.2, -0.3, 0xffffff, undefined, [0.5, 0, 0])
    .build();
}
function geoCrystalTop(): THREE.BufferGeometry {
  return new Prims()
    .octa(0.25, 0.1, 0.95, 0, 0xffffff, [0.8, 1.9, 0.8])
    .octa(0.18, -0.25, 0.7, 0.2, 0xffffff, [0.8, 1.6, 0.8], [0, 0.4, 0.3])
    .build();
}
function geoBush(): THREE.BufferGeometry {
  return new Prims()
    .sphere(0.55, 0, 0.4, 0, 0xffffff, [1, 0.7, 1], 1)
    .sphere(0.4, 0.5, 0.3, 0.2, 0xffffff, undefined, 1)
    .sphere(0.4, -0.4, 0.3, -0.2, 0xffffff, undefined, 1)
    .build();
}
function geoBerries(): THREE.BufferGeometry {
  return new Prims()
    .sphere(0.12, 0.2, 0.72, 0.3, 0xffffff, undefined, 0)
    .sphere(0.12, -0.3, 0.65, 0.3, 0xffffff, undefined, 0)
    .sphere(0.12, 0.35, 0.55, -0.2, 0xffffff, undefined, 0)
    .sphere(0.12, -0.1, 0.8, -0.1, 0xffffff, undefined, 0)
    .build();
}
function geoSeasonal(): THREE.BufferGeometry {
  return new Prims().sphere(0.4, 0, 0.4, 0, 0xffffff, [1, 0.85, 1], 1).build();
}

/** Ore rocks, forage bushes, seasonal collectibles, meteors and the treasure marker (only those near the player). */
export class NodeRender {
  readonly group = new THREE.Group();
  private rock = new InstancePool(geoRock(), CAP);
  private crystal = new InstancePool(geoCrystalTop(), CAP);
  private bush = new InstancePool(geoBush(), CAP);
  private berry = new InstancePool(geoBerries(), CAP);
  private season = new InstancePool(geoSeasonal(), 120);
  private marker: THREE.Mesh;
  private t = 0;
  private acc = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private c = new THREE.Color();
  private gray = new THREE.Color(0x7a7a84);
  private green = new THREE.Color(0x3f8a3a);

  constructor(private sim: Sim) {
    this.group.add(this.rock.mesh, this.crystal.mesh, this.bush.mesh, this.berry.mesh, this.season.mesh);
    this.marker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 40, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffd23a,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.marker.visible = false;
    this.group.add(this.marker);
  }

  update(dt: number): void {
    this.t += dt;
    this.acc -= dt;
    if (this.acc <= 0) {
      this.acc = 0.4;
      this.rebuild();
    }
    for (const p of [this.rock, this.crystal, this.bush, this.berry, this.season]) p.flush();
    const tr = this.sim.nodes.treasure;
    if (tr && !tr.found) {
      this.marker.visible = true;
      this.marker.position.set(tr.x, this.sim.streamer.terrain.heightAt(tr.x, tr.z) + 20, tr.z);
    } else this.marker.visible = false;
  }

  private rebuild(): void {
    const sim = this.sim;
    const p = sim.player;
    let ri = 0,
      ci = 0,
      bi = 0,
      ei = 0,
      si = 0;
    for (const n of sim.nodes.nodes) {
      if (Math.abs(n.x - p.x) > 130 || Math.abs(n.z - p.z) > 130) continue;
      if (!sim.nodes.available(n)) continue;
      if (n.seasonal && !sim.nodes.seasonalItem()) continue;
      const item = sim.nodes.itemOf(n);
      const col = ITEM_BY_ID[item]?.color ?? 0xffffff;
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), (n.x * 12.9 + n.z * 7.3) % 6.28);
      this.m.compose(this.v.set(n.x, n.y, n.z), this.q, this.s.setScalar(n.biome === 'meteor' ? 1.4 : 1));
      if (n.seasonal) {
        this.season.setAt(si++, this.m, this.c.set(col), 0.4);
      } else if (n.kind === 'ore') {
        this.rock.setAt(ri++, this.m, this.gray, 0);
        this.crystal.setAt(
          ci++,
          this.m,
          this.c.set(col),
          item === 'crystal_shard' || n.biome === 'meteor' ? 0.9 : 0.3,
        );
      } else {
        this.bush.setAt(bi++, this.m, this.green, 0);
        this.berry.setAt(ei++, this.m, this.c.set(col), 0.3);
      }
    }
    this.rock.setCount(ri);
    this.crystal.setCount(ci);
    this.bush.setCount(bi);
    this.berry.setCount(ei);
    this.season.setCount(si);
  }
}

/** Crew members idling/chopping near the sawmill yard, and the active pet. */
export class CrewRender {
  readonly group = new THREE.Group();
  private crew = new Map<number, { h: Human; phase: number }>();
  private pet: THREE.Group | null = null;
  private petId = '';
  constructor(private sim: Sim) {}

  update(dt: number): void {
    const st = this.sim.state;
    const p = this.sim.player;
    // crew
    for (const [id, c] of this.crew) {
      if (!st.workers.find((w) => w.id === id)) {
        this.group.remove(c.h.root);
        this.crew.delete(id);
      }
    }
    st.workers.forEach((w, i) => {
      const cx = HUB.sawmill[0] + 12,
        cz = HUB.sawmill[1] + 22;
      const a = (i / Math.max(1, st.workers.length)) * Math.PI * 2;
      const x = cx + Math.cos(a) * 5,
        z = cz + Math.sin(a) * 5;
      if (Math.hypot(x - p.x, z - p.z) > 160) {
        const c = this.crew.get(w.id);
        if (c) c.h.root.visible = false;
        return;
      }
      let c = this.crew.get(w.id);
      if (!c) {
        const h = new Human({
          shirt: [0x3a7a3a, 0xa05a2a, 0x3a5a9a, 0x8a3a8a][i % 4]!,
          pants: 0x4a3a2a,
          hat: 0xd0b060,
          beard: i % 2 === 0,
          hair: 0x3a2a1a,
        });
        c = { h, phase: i * 1.7 };
        this.crew.set(w.id, c);
        this.group.add(h.root);
        const stump = new THREE.Mesh(
          new THREE.CylinderGeometry(0.5, 0.6, 0.6, 8),
          new THREE.MeshLambertMaterial({ color: 0x7a5230, flatShading: true }),
        );
        stump.position.set(0, 0.3, 0.9);
        h.root.add(stump);
      }
      c.h.root.visible = true;
      c.phase += dt;
      const y = this.sim.streamer.terrain.heightAt(x, z);
      c.h.root.position.set(x, y, z);
      c.h.root.rotation.y = a + Math.PI;
      c.h.animate(dt, 0, (c.phase * 1.1) % 1);
    });
    // pet
    const pet = st.activePet;
    if (pet !== this.petId) {
      if (this.pet) this.group.remove(this.pet);
      this.pet = null;
      this.petId = pet ?? '';
      if (pet) {
        const col = ITEM_BY_ID[pet]?.color ?? 0xcccccc;
        const prims = new Prims();
        prims
          .box(0.45, 0.35, 0.8, 0, 0.35, 0, col)
          .box(0.35, 0.3, 0.35, 0, 0.55, 0.5, col)
          .box(0.1, 0.2, 0.1, 0.12, 0.8, 0.5, col)
          .box(0.1, 0.2, 0.1, -0.12, 0.8, 0.5, col)
          .box(0.12, 0.12, 0.5, 0, 0.45, -0.6, 0xffffff);
        for (const [x, z] of [
          [-0.15, 0.25],
          [0.15, 0.25],
          [-0.15, -0.25],
          [0.15, -0.25],
        ] as [number, number][])
          prims.box(0.1, 0.25, 0.1, x, 0.12, z, 0x3a2a1a);
        prims
          .box(0.06, 0.06, 0.02, 0.1, 0.6, 0.69, 0x111111)
          .box(0.06, 0.06, 0.02, -0.1, 0.6, 0.69, 0x111111);
        const mesh = new THREE.Mesh(
          prims.build(),
          new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
        );
        this.pet = new THREE.Group();
        this.pet.add(mesh);
        if (pet === 'pet_sprite' || pet === 'pet_owl') {
          const l = new THREE.PointLight(pet === 'pet_sprite' ? 0x6aff9a : 0xffe6a0, 1.2, 14);
          l.position.set(0, 1, 0);
          this.pet.add(l);
        }
        this.group.add(this.pet);
      }
    }
    if (this.pet) {
      const pt = this.sim.pets;
      const y = this.sim.streamer.terrain.surfaceAt(pt.x, pt.z, p.y + 1);
      this.pet.position.set(
        pt.x,
        y +
          (this.petId === 'pet_sprite'
            ? 1.5 + Math.sin(performance.now() / 300) * 0.2
            : Math.abs(Math.sin(performance.now() / 160)) * 0.08),
        pt.z,
      );
      this.pet.rotation.y = Math.atan2(p.x - pt.x, p.z - pt.z);
    }
  }
}

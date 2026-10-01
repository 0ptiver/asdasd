import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SAOPass } from 'three/examples/jsm/postprocessing/SAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Game } from '../core/game';
import type { Sim } from '../core/sim';
import { Environment } from './environment';
import { Water } from './water';
import { buildSkyMesh, buildTerrainMesh } from './terrainMesh';
import type { Chunk } from '../systems/streaming';
import { TreeRenderer } from './treeRender';
import { HubRender } from './hubRender';
import { Human, makeAxeModel } from './models';
import { LogRenderer } from './logRender';
import { BuildRender } from './buildRender';
import { VehicleRenderer } from './vehicleRender';
import { LandmarkRender } from './landmarkRender';
import { WeatherFx } from './weatherFx';
import { NodeRender, CrewRender } from './companions';
import { RemoteRender } from './remote';
import { isNight } from '../core/gameTime';
import { Fx } from './fx';
import { AXE_BY_ID, SKINS } from '../data/axes';
import { NPCS } from '../data/npcs';
import { BIOME_BY_ID } from '../data/biomes';
import { CONFIG } from '../config';

/** Rendering side. Reads the Sim; never mutates game state. */
export class View {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.1, 2500);
  sim: Sim | null = null;
  private idle = new THREE.Group();
  private world = new THREE.Group();
  private env!: Environment;
  private water!: Water;
  private terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private chunkMeshes = new Map<string, THREE.Object3D[]>();
  private treeR: TreeRenderer | null = null;
  private logR: LogRenderer | null = null;
  private buildR: BuildRender | null = null;
  private vehR: VehicleRenderer | null = null;
  private lmR: LandmarkRender | null = null;
  private nodeR: NodeRender | null = null;
  private remoteR: RemoteRender | null = null;
  private crewR: CrewRender | null = null;
  private weather = new WeatherFx();
  private fx = new Fx();
  private heldKey = '';
  private hubR: HubRender | null = null;
  private playerModel: Human | null = null;
  private npcModels: { human: Human; x: number; z: number; phase: number }[] = [];
  private time = 0;
  private camPos = new THREE.Vector3();
  private shake = 0;
  private unsub: (() => void)[] = [];
  private composer: EffectComposer | null = null;
  private composerKey = '';
  private bloom: UnrealBloomPass | null = null;
  get indoor(): number {
    return this.env.indoor;
  }

  constructor(
    readonly game: Game,
    readonly canvas: HTMLCanvasElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.add(this.idle, this.world);
    this.env = new Environment(this.scene);
    this.water = new Water();
    this.scene.add(this.water.mesh);
    this.water.mesh.visible = false;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  async preload(progress: (p: number) => void): Promise<void> {
    const logo = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshStandardMaterial({ color: 0xc0853a }),
    );
    this.idle.add(logo);
    this.idle.add(new THREE.AmbientLight(0xffffff, 1.2));
    this.camera.position.set(4, 3, 6);
    this.camera.lookAt(0, 0, 0);
    progress(1);
  }

  attach(sim: Sim): void {
    this.sim = sim;
    this.idle.visible = false;
    this.water.mesh.visible = true;
    this.applyQuality();
    const st = sim.streamer;
    const addChunk = (c: Chunk) => {
      const objs: THREE.Object3D[] = [];
      const m = buildTerrainMesh(c, st.terrain, this.terrainMat);
      this.world.add(m);
      objs.push(m);
      const sky = buildSkyMesh(c, this.terrainMat);
      if (sky) {
        this.world.add(sky);
        objs.push(sky);
      }
      this.chunkMeshes.set(c.key, objs);
    };
    const removeChunk = (c: Chunk) => {
      for (const o of this.chunkMeshes.get(c.key) ?? []) {
        this.world.remove(o);
        (o as THREE.Mesh).geometry.dispose();
      }
      this.chunkMeshes.delete(c.key);
    };
    for (const c of st.loaded.values()) addChunk(c);
    st.onLoad.push(addChunk);
    st.onUnload.push(removeChunk);
    this.treeR = new TreeRenderer(sim.trees);
    this.world.add(this.treeR.group);
    this.logR = new LogRenderer(sim.logs, this.treeR);
    this.world.add(this.logR.group, this.fx.points);
    this.unsub.push(
      sim.bus.on('fx', (e) =>
        e.kind === 'ring'
          ? this.fx.ring(e.x, e.y, e.z, e.n ?? 5, e.color ?? 0xffffff)
          : this.fx.emit(e.kind, e.x, e.y, e.z, e.n ?? 8, e.color),
      ),
    );
    this.buildR = new BuildRender(sim);
    this.world.add(this.buildR.group);
    this.remoteR = new RemoteRender(this.game);
    this.world.add(this.remoteR.group);
    this.nodeR = new NodeRender(sim);
    this.crewR = new CrewRender(sim);
    this.world.add(this.nodeR.group, this.crewR.group);
    this.lmR = new LandmarkRender(sim);
    this.world.add(this.lmR.group, this.weather.points);
    this.vehR = new VehicleRenderer(sim);
    this.world.add(this.vehR.group);
    this.hubR = new HubRender(sim.hub.layout);
    this.world.add(this.hubR.group);
    this.playerModel = new Human({ shirt: 0xc0392b, pants: 0x3a4a6a, hat: 0x2a5a3a, beard: true });
    this.world.add(this.playerModel.root);
    for (const n of NPCS) {
      const h = new Human({
        shirt: n.color,
        pants: 0x4a3a2a,
        hat: n.id === 'gus' || n.id === 'brokk' ? 0x6a4a2a : null,
        hair: 0x3a2a1a,
        beard: n.id === 'gus' || n.id === 'brokk' || n.id === 'nell',
        apron: n.id === 'brokk' || n.id === 'gus' ? 0x6a5a4a : null,
      });
      const y = st.terrain.heightAt(n.pos[0], n.pos[1]);
      h.root.position.set(n.pos[0], y, n.pos[1]);
      h.root.rotation.y = Math.atan2(-n.pos[0], 14 - n.pos[1]);
      this.world.add(h.root);
      this.npcModels.push({ human: h, x: n.pos[0], z: n.pos[1], phase: Math.random() * 6 });
    }
    this.unsub.push(sim.bus.on('shake', (e) => (this.shake = Math.max(this.shake, e.amount))));
  }

  detach(): void {
    for (const u of this.unsub) u();
    this.unsub = [];
    this.sim = null;
    this.idle.visible = true;
    this.water.mesh.visible = false;
    for (const objs of this.chunkMeshes.values())
      for (const o of objs) {
        this.world.remove(o);
        (o as THREE.Mesh).geometry.dispose();
      }
    this.chunkMeshes.clear();
    if (this.treeR) this.world.remove(this.treeR.group);
    if (this.hubR) this.world.remove(this.hubR.group);
    if (this.buildR) {
      this.buildR.dispose();
      this.world.remove(this.buildR.group);
    }
    this.buildR = null;
    if (this.remoteR) this.world.remove(this.remoteR.group);
    this.remoteR = null;
    if (this.nodeR) this.world.remove(this.nodeR.group);
    if (this.crewR) this.world.remove(this.crewR.group);
    this.nodeR = this.crewR = null;
    if (this.lmR) this.world.remove(this.lmR.group, this.weather.points);
    this.lmR = null;
    if (this.vehR) this.world.remove(this.vehR.group);
    this.vehR = null;
    if (this.playerModel) this.world.remove(this.playerModel.root);
    for (const n of this.npcModels) this.world.remove(n.human.root);
    this.npcModels = [];
    if (this.logR) this.world.remove(this.logR.group, this.fx.points);
    this.treeR = this.hubR = this.playerModel = null;
    this.logR = null;
    this.heldKey = '';
  }

  applyQuality(): void {
    const q = this.game.settings.quality;
    const pr = q === 'low' ? 0.75 : q === 'medium' ? 1 : q === 'high' ? 1.5 : 2;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, pr));
    this.renderer.shadowMap.enabled = this.game.settings.shadows && q !== 'low';
    this.env.setShadows(
      this.game.settings.shadows && q !== 'low',
      q === 'ultra' ? 4096 : q === 'high' ? 2048 : 1024,
    );
    this.camera.fov = this.game.settings.fov;
    this.camera.updateProjectionMatrix();
    this.resize();
  }
  /** (Re)build the post-processing chain when bloom/SSAO settings change. */
  private ensureComposer(): EffectComposer | null {
    const st = this.game.settings;
    const key = `${st.bloom}:${st.ssao}`;
    if (!st.bloom && !st.ssao) {
      this.composer = null;
      this.composerKey = '';
      return null;
    }
    if (this.composer && this.composerKey === key) return this.composer;
    try {
      const w = window.innerWidth, h = window.innerHeight;
      const c = new EffectComposer(this.renderer);
      c.setSize(w, h);
      c.addPass(new RenderPass(this.scene, this.camera));
      if (st.ssao) {
        const sao = new SAOPass(this.scene, this.camera);
        sao.params.saoBias = 0.5;
        sao.params.saoIntensity = 0.012;
        sao.params.saoScale = 8;
        sao.params.saoKernelRadius = 24;
        c.addPass(sao);
      }
      if (st.bloom) {
        this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.45, 0.6, 0.88);
        c.addPass(this.bloom);
      }
      c.addPass(new OutputPass());
      this.composer = c;
      this.composerKey = key;
      return c;
    } catch (e) {
      console.warn('post-processing unavailable', e);
      this.game.settings.bloom = false;
      this.game.settings.ssao = false;
      this.composer = null;
      return null;
    }
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
  }

  render(_alpha: number, dt: number): void {
    this.time += dt;
    const sim = this.sim;
    if (!sim) {
      this.idle.rotation.y += dt * 0.6;
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const p = sim.player;
    const st = sim.state;
    // ---- camera
    const curV = sim.vehicles.current;
    const headOff = curV ? Math.max(1.8, curV.def.size[1] * 0.7 + 1.2) : 1.7;
    const head = new THREE.Vector3(p.x, p.y + headOff, p.z);
    const cp = Math.cos(p.camPitch);
    const sp = Math.sin(p.camPitch);
    const fwd = new THREE.Vector3(-Math.sin(p.camYaw) * cp, -sp, -Math.cos(p.camYaw) * cp);
    const dist = p.camDist;
    const wantPos = head
      .clone()
      .addScaledVector(fwd, -dist)
      .add(new THREE.Vector3(Math.cos(p.camYaw) * 0.5, 0.3, -Math.sin(p.camYaw) * 0.5));
    const gh = sim.streamer.terrain.surfaceAt(wantPos.x, wantPos.z, p.y) + 0.7;
    if (wantPos.y < gh) wantPos.y = gh;
    this.camPos.lerp(wantPos, 1 - Math.exp(-dt * 25));
    if (this.camPos.distanceTo(wantPos) > 30) this.camPos.copy(wantPos);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0 && !this.game.settings.reducedMotion) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.5;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.5;
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.camera.lookAt(head.x + Math.cos(p.camYaw) * 0.5, head.y - 0.1, head.z - Math.sin(p.camYaw) * 0.5);

    const dbg = (window as any).__cam;
    if (dbg) {
      this.camera.position.set(dbg.pos[0], dbg.pos[1], dbg.pos[2]);
      this.camera.lookAt(dbg.at[0], dbg.at[1], dbg.at[2]);
    }

    // ---- environment
    {
      const blend = sim.streamer.terrain.biomeBlend(p.x, p.z);
      this.env.update(
        dt,
        blend,
        st.time,
        new THREE.Vector3(p.x, p.y, p.z),
        !!st.gear.head && st.gear.head === 'headlamp',
        st.weather.kind,
        this.camera.position.y,
      );
      const b = blend.main;
      this.water.update(
        this.time,
        this.camera.position,
        b.id === 'swamp'
          ? 0x4a6a3a
          : b.id === 'tropics'
            ? 0x20b8d0
            : b.id === 'volcano'
              ? 0x3a2a28
              : 0x2a7ab8,
        this.env.daylight,
      );
    }

    // ---- models
    if (this.playerModel) {
      const m = this.playerModel;
      m.root.position.set(p.x, p.y, p.z);
      m.root.rotation.y = p.yaw;
      m.animate(dt, p.moveSpeed, p.swing >= 0 ? p.swing : -1, false, p.swimming);
    }
    for (const n of this.npcModels) {
      n.phase += dt;
      n.human.armR.rotation.x = Math.sin(n.phase * 1.2) * 0.06;
      n.human.head.rotation.y = Math.sin(n.phase * 0.5) * 0.4;
    }
    this.hubR?.update(this.time, sim.sawmill.sawing);
    this.logR?.update();
    this.buildR?.update(dt);
    this.lmR?.update(dt);
    this.nodeR?.update(dt);
    this.remoteR?.update(dt);
    this.crewR?.update(dt);
    this.weather.update(dt, st.weather.kind, this.camera.position, this.env.daylight, this.env.indoor);
    this.vehR?.update(
      dt,
      (k, x, y, z, n, c) => this.fx.emit(k, x, y, z, n, c),
      this.playerModel,
      isNight(st.time),
    );
    this.fx.setScale(this.renderer.domElement.height);
    this.fx.update(dt);
    // held axe
    const eq = sim.inventory.equipped();
    const key = eq ? `${eq.uid}:${eq.skin}` : '';
    if (key !== this.heldKey && this.playerModel) {
      this.heldKey = key;
      if (eq) {
        const def = AXE_BY_ID[eq.def]!;
        const tint = SKINS.find((k) => k.id === eq.skin)?.tint ?? null;
        const m = makeAxeModel(def, tint);
        m.rotation.x = Math.PI / 2 - 0.5;
        this.playerModel.setHeld(m);
      } else this.playerModel.setHeld(null);
    }
    this.treeR?.update(dt, p.x, p.z);
    const comp = this.ensureComposer();
    if (comp) comp.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}

void BIOME_BY_ID;
void CONFIG;

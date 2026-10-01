import * as THREE from 'three';
import type { BiomeBlend } from '../world/terrain';
import { daylight, hourOfDay } from '../core/gameTime';

const SKY_VERT = `
varying vec3 vDir;
void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`;
const SKY_FRAG = `
uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunDir; uniform float day; uniform float stars; uniform vec3 sunColor;
varying vec3 vDir;
float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
void main(){
  float h = clamp(vDir.y, -0.2, 1.0);
  float t = pow(max(h,0.0), 0.55);
  vec3 col = mix(horizon, zenith, t);
  float sd = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
  col += sunColor * (pow(sd, 400.0)*2.5 + pow(sd, 12.0)*0.28*day);
  // sunset tint near horizon when sun low
  float low = 1.0 - smoothstep(0.0, 0.35, abs(sunDir.y));
  col = mix(col, col*vec3(1.25,0.8,0.65), low*0.35*(1.0-t));
  // stars
  vec3 sp = floor(normalize(vDir)*140.0);
  float s = step(0.9965, hash(sp)) * stars * smoothstep(0.0,0.25,vDir.y);
  col += vec3(s);
  // moon
  vec3 md = -sunDir; float mm = pow(max(dot(normalize(vDir), normalize(md)),0.0), 900.0);
  col += vec3(0.8,0.85,1.0) * mm * (1.0-day) * 1.5;
  gl_FragColor = vec4(col,1.0);
}`;

export interface EnvState {
  zenith: THREE.Color;
  horizon: THREE.Color;
  fog: THREE.Color;
  fogDensity: number;
  light: THREE.Color;
  ambient: THREE.Color;
  sunIntensity: number;
  hemiIntensity: number;
  indoor: number;
}

/** Sky dome, sun/moon, fog and lights. Blends biome atmosphere + time of day + weather. */
export class Environment {
  readonly sky: THREE.Mesh;
  readonly sun = new THREE.DirectionalLight(0xffffff, 1.4);
  readonly hemi = new THREE.HemisphereLight(0xbcd8ff, 0x556644, 0.9);
  readonly lamp = new THREE.PointLight(0xfff0c0, 0, 36, 1.4);
  readonly fog = new THREE.FogExp2(0xbfe3ff, 0.0035);
  private uniforms: Record<string, THREE.IUniform>;
  private cur: EnvState = {
    zenith: new THREE.Color(0x4a90e2),
    horizon: new THREE.Color(0xbfe3ff),
    fog: new THREE.Color(0xbfe3ff),
    fogDensity: 0.0035,
    light: new THREE.Color(0xfff2d8),
    ambient: new THREE.Color(0x8fa8c8),
    sunIntensity: 1.4,
    hemiIntensity: 0.9,
    indoor: 0,
  };
  private tgt = {
    ...this.cur,
    zenith: new THREE.Color(),
    horizon: new THREE.Color(),
    fog: new THREE.Color(),
    light: new THREE.Color(),
    ambient: new THREE.Color(),
  };
  daylight = 1;
  weatherDark = 0;
  weatherFog = 0;
  sunDir = new THREE.Vector3(0.4, 0.8, 0.3);
  private scratch = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.uniforms = {
      zenith: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      day: { value: 1 },
      stars: { value: 0 },
      sunColor: { value: new THREE.Color(1, 0.9, 0.7) },
    };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1000, 32, 16),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        uniforms: this.uniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky, this.hemi, this.sun, this.sun.target, this.lamp);
    scene.fog = this.fog;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -70;
    sc.right = 70;
    sc.top = 70;
    sc.bottom = -70;
    sc.near = 1;
    sc.far = 400;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.6;
  }

  setShadows(enabled: boolean, size: number): void {
    this.sun.castShadow = enabled;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      (this.sun.shadow as any).map = null;
    }
  }

  update(
    dt: number,
    blend: BiomeBlend,
    days: number,
    focus: THREE.Vector3,
    headlamp: boolean,
    weather: string,
    camY: number,
  ): void {
    const dl = daylight(days);
    this.daylight = dl;
    // target atmosphere = weighted biome mix
    const t = this.tgt;
    t.zenith.setRGB(0, 0, 0);
    t.horizon.setRGB(0, 0, 0);
    t.fog.setRGB(0, 0, 0);
    t.light.setRGB(0, 0, 0);
    t.ambient.setRGB(0, 0, 0);
    let fd = 0;
    let indoor = 0;
    for (const w of blend.weights) {
      const b = w.biome;
      t.zenith.r += this.scratch.set(b.sky).r * w.w;
      t.zenith.g += this.scratch.g * w.w;
      t.zenith.b += this.scratch.b * w.w;
      t.horizon.r += this.scratch.set(b.horizon).r * w.w;
      t.horizon.g += this.scratch.g * w.w;
      t.horizon.b += this.scratch.b * w.w;
      t.fog.r += this.scratch.set(b.fog).r * w.w;
      t.fog.g += this.scratch.g * w.w;
      t.fog.b += this.scratch.b * w.w;
      t.light.r += this.scratch.set(b.light).r * w.w;
      t.light.g += this.scratch.g * w.w;
      t.light.b += this.scratch.b * w.w;
      t.ambient.r += this.scratch.set(b.ambient).r * w.w;
      t.ambient.g += this.scratch.g * w.w;
      t.ambient.b += this.scratch.b * w.w;
      fd += b.fogDensity * w.w;
      if (b.indoor) indoor += w.w;
    }
    // only count indoor when we are really inside
    indoor = blend.main.indoor && blend.score < 0.95 ? Math.min(1, (0.98 - blend.score) * 8) : 0;
    const k = 1 - Math.exp(-dt * 2.2);
    const c = this.cur;
    c.zenith.lerp(t.zenith, k);
    c.horizon.lerp(t.horizon, k);
    c.fog.lerp(t.fog, k);
    c.light.lerp(t.light, k);
    c.ambient.lerp(t.ambient, k);
    c.fogDensity += (fd - c.fogDensity) * k;
    c.indoor += (indoor - c.indoor) * k;

    // time-of-day modulation
    const night = new THREE.Color(0x070b1c);
    const nightH = new THREE.Color(0x141c3a);
    const z = c.zenith.clone().lerp(night, (1 - dl) * 0.92);
    const hz = c.horizon.clone().lerp(nightH, (1 - dl) * 0.9);
    const hr = hourOfDay(days);
    const sunAng = ((hr - 6) / 24) * Math.PI * 2;
    this.sunDir.set(Math.cos(sunAng) * 0.8, Math.sin(sunAng), 0.45).normalize();
    // golden hour tint
    const gold = 1 - Math.min(1, Math.abs(this.sunDir.y) * 3.2);
    if (dl > 0.05) hz.lerp(new THREE.Color(0xff9a5a), gold * 0.45 * dl);
    // weather
    const wd =
      weather === 'rain' || weather === 'snow'
        ? 0.35
        : weather === 'blizzard' || weather === 'sandstorm' || weather === 'ash'
          ? 0.6
          : weather === 'fog'
            ? 0.25
            : 0;
    this.weatherDark += (wd - this.weatherDark) * Math.min(1, dt);
    const wf =
      weather === 'fog'
        ? 3
        : weather === 'blizzard'
          ? 4
          : weather === 'sandstorm'
            ? 4.5
            : weather === 'rain'
              ? 1.8
              : weather === 'ash'
                ? 2
                : weather === 'snow'
                  ? 1.6
                  : 1;
    this.weatherFog += (wf - this.weatherFog) * Math.min(1, dt * 0.8);
    const grey = new THREE.Color(
      weather === 'sandstorm' ? 0xc8a070 : weather === 'ash' ? 0x4a3a38 : 0x8a929c,
    ).multiplyScalar(0.3 + 0.7 * dl);
    z.lerp(grey, this.weatherDark);
    hz.lerp(grey, this.weatherDark);
    // indoor: pitch dark
    z.lerp(new THREE.Color(0x010103), c.indoor);
    hz.lerp(new THREE.Color(0x040208), c.indoor);

    this.uniforms.zenith!.value.copy(z);
    this.uniforms.horizon!.value.copy(hz);
    this.uniforms.sunDir!.value.copy(this.sunDir);
    this.uniforms.day!.value = dl * (1 - c.indoor);
    this.uniforms.stars!.value = (1 - dl) * (1 - this.weatherDark) * (1 - c.indoor);
    this.uniforms.sunColor!.value.copy(c.light);

    const fogCol = hz.clone().lerp(new THREE.Color(0x050510), (1 - dl) * 0.6);
    this.fog.color.copy(fogCol);
    this.fog.density = c.fogDensity * this.weatherFog * (1 + (1 - dl) * 0.3) * (1 + c.indoor * 0.8);

    // lights
    const sunUp = Math.max(0, this.sunDir.y);
    this.sun.color.copy(c.light).lerp(new THREE.Color(0xff9a60), gold * 0.5);
    this.sun.intensity =
      (0.15 + 1.35 * Math.pow(sunUp, 0.5)) *
      (1 - this.weatherDark * 0.7) *
      (1 - c.indoor * 0.97) *
      (dl > 0.02 ? 1 : 0.1);
    // moon light at night
    if (dl < 0.25) {
      this.sun.color.lerp(new THREE.Color(0x8aa0ff), 1 - dl * 4);
      this.sun.intensity = Math.max(this.sun.intensity, 0.4 * (1 - c.indoor));
    }
    const dirY = Math.abs(this.sunDir.y) < 0.12 ? 0.12 : this.sunDir.y;
    const lightDir =
      dl > 0.2
        ? this.sunDir
        : new THREE.Vector3(-this.sunDir.x, Math.max(0.35, -this.sunDir.y), -this.sunDir.z).normalize();
    void dirY;
    this.sun.position.copy(focus).addScaledVector(lightDir, 160);
    this.sun.target.position.copy(focus);
    this.hemi.color.copy(c.ambient).lerp(new THREE.Color(0x1a2040), (1 - dl) * 0.8);
    this.hemi.groundColor.copy(c.ambient).multiplyScalar(0.45);
    this.hemi.intensity = (0.4 + 0.6 * dl) * (1 - this.weatherDark * 0.4) * (1 - c.indoor * 0.9) + 0.05;
    // headlamp / pet light
    const lampWant = headlamp ? 2.6 : 0;
    this.lamp.intensity += (lampWant - this.lamp.intensity) * Math.min(1, dt * 6);
    this.lamp.position.set(focus.x, focus.y + 2.2, focus.z);
    this.sky.position.set(focus.x, camY, focus.z);
    this.sky.scale.setScalar(1);
  }

  get indoor(): number {
    return this.cur.indoor;
  }
}

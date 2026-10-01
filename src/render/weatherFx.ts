import * as THREE from 'three';

const N = 3200;
const VERT = `
uniform float time; uniform float fall; uniform float drift; uniform vec3 center; uniform float size; uniform float box;
attribute vec3 seed; varying float vA;
void main(){
  vec3 p = seed * box;
  p.y = mod(seed.y*box - time*fall, box);
  p.x = mod(seed.x*box + time*drift*0.7 + sin(time*0.7+seed.z*20.0)*0.6 - center.x, box) - box*0.5 + center.x;
  p.z = mod(seed.z*box + time*drift*0.3 - center.z, box) - box*0.5 + center.z;
  vec3 w = vec3(p.x, p.y + center.y - box*0.35, p.z);
  vec4 mv = viewMatrix * vec4(w, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = size * (300.0 / -mv.z);
  vA = smoothstep(box*0.5, box*0.2, length(w - center));
}`;
const FRAG = `uniform vec3 color; uniform float alpha; uniform float streak; varying float vA;
void main(){ vec2 d = gl_PointCoord - 0.5; float a = streak > 0.5 ? smoothstep(0.5,0.1,abs(d.x))*smoothstep(0.5,0.0,abs(d.y*0.35)) : smoothstep(0.5,0.2,length(d)); gl_FragColor = vec4(color, a*alpha*vA); if(gl_FragColor.a<0.01) discard; }`;

/** GPU-animated precipitation/dust around the camera. */
export class WeatherFx {
  readonly points: THREE.Points;
  private mat: THREE.ShaderMaterial;
  private amount = 0;
  private time = 0;
  private current = 'clear';

  constructor() {
    const seed = new Float32Array(N * 3);
    for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        time: { value: 0 },
        fall: { value: 20 },
        drift: { value: 0 },
        center: { value: new THREE.Vector3() },
        size: { value: 2 },
        box: { value: 60 },
        color: { value: new THREE.Color(0xbfd8ff) },
        alpha: { value: 0 },
        streak: { value: 1 },
      },
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
  }

  update(dt: number, kind: string, cam: THREE.Vector3, daylight: number, indoor: number): void {
    this.time += dt;
    const u = this.mat.uniforms;
    let want = 0;
    if (kind !== this.current) this.current = kind;
    switch (kind) {
      case 'rain':
      case 'storm':
        u.fall!.value = 28;
        u.drift!.value = kind === 'storm' ? 6 : 1;
        u.size!.value = 3.2;
        u.streak!.value = 1;
        u.color!.value.set(0xaecbff);
        want = kind === 'storm' ? 0.55 : 0.4;
        break;
      case 'snow':
        u.fall!.value = 3;
        u.drift!.value = 2;
        u.size!.value = 3.4;
        u.streak!.value = 0;
        u.color!.value.set(0xffffff);
        want = 0.9;
        break;
      case 'blizzard':
        u.fall!.value = 6;
        u.drift!.value = 26;
        u.size!.value = 3.4;
        u.streak!.value = 0;
        u.color!.value.set(0xf2f8ff);
        want = 1;
        break;
      case 'sandstorm':
        u.fall!.value = 1;
        u.drift!.value = 34;
        u.size!.value = 3.0;
        u.streak!.value = 0;
        u.color!.value.set(0xe0b878);
        want = 0.9;
        break;
      case 'ash':
        u.fall!.value = 2.2;
        u.drift!.value = 4;
        u.size!.value = 2.6;
        u.streak!.value = 0;
        u.color!.value.set(0x888080);
        want = 0.8;
        break;
    }
    this.amount += (want * (1 - indoor) - this.amount) * Math.min(1, dt * 1.5);
    u.alpha!.value = this.amount * (0.5 + 0.5 * daylight);
    u.time!.value = this.time;
    u.center!.value.copy(cam);
    this.points.visible = this.amount > 0.01;
  }
}

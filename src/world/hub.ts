/**
 * Hub town + landmarks as pure descriptions (render parts, solid colliders, interaction points, signs).
 * The render layer turns parts into merged meshes; the sim layer turns boxes into Rapier colliders.
 */
import { HUB, BRIDGE, DOCK, riverX, AIRFIELD } from './layout';
import type { Terrain } from './terrain';

export type PartDesc =
  | {
      t: 'box';
      x: number;
      y: number;
      z: number;
      w: number;
      h: number;
      d: number;
      c: number;
      ry?: number;
      rx?: number;
      rz?: number;
    }
  | {
      t: 'cyl';
      x: number;
      y: number;
      z: number;
      rt: number;
      rb: number;
      h: number;
      c: number;
      seg?: number;
      rx?: number;
      rz?: number;
    }
  | { t: 'cone'; x: number; y: number; z: number; r: number; h: number; c: number; seg?: number }
  | { t: 'pyr'; x: number; y: number; z: number; w: number; h: number; d: number; c: number }
  | { t: 'sphere'; x: number; y: number; z: number; r: number; c: number };

export interface BoxCollider {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  ry: number;
}
export interface SignDesc {
  text: string;
  x: number;
  y: number;
  z: number;
  ry: number;
  w: number;
  h: number;
  bg: string;
  fg: string;
}

export interface InteractPoint {
  id: string;
  label: string;
  x: number;
  z: number;
  radius: number;
  kind:
    | 'npc'
    | 'shop'
    | 'sell'
    | 'sawmill'
    | 'board'
    | 'garage'
    | 'gas'
    | 'dock'
    | 'train'
    | 'forge'
    | 'fast_travel';
  arg?: string;
}

export interface Zone {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
}

export interface HubLayout {
  parts: PartDesc[];
  boxes: BoxCollider[];
  signs: SignDesc[];
  points: InteractPoint[];
  sellZone: Zone;
  sawIntake: Zone;
  garagePad: { x: number; y: number; z: number; yaw: number };
  boatPad: { x: number; y: number; z: number; yaw: number };
  airPad: { x: number; y: number; z: number; yaw: number };
  lamps: { x: number; y: number; z: number }[];
  pierY: number;
}

const WOOD = 0xa87a4a,
  WOOD_D = 0x7a5530,
  STONE = 0xb8b0a0,
  ROOF_R = 0xa8402e,
  ROOF_B = 0x3a5a8a,
  ROOF_G = 0x3a7a4a,
  PLASTER = 0xefe4cc,
  PLASTER2 = 0xe0d0b0;

class Struct {
  parts: PartDesc[] = [];
  boxes: BoxCollider[] = [];
  signs: SignDesc[] = [];
  points: InteractPoint[] = [];
  lamps: { x: number; y: number; z: number }[] = [];

  box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    c: number,
    solid = false,
    ry = 0,
  ): void {
    this.parts.push({ t: 'box', x, y: y + h / 2, z, w, h, d, c, ry });
    if (solid) this.boxes.push({ x, y: y + h / 2, z, hx: w / 2, hy: h / 2, hz: d / 2, ry });
  }
  cyl(x: number, y: number, z: number, r: number, h: number, c: number, seg = 10): void {
    this.parts.push({ t: 'cyl', x, y: y + h / 2, z, rt: r, rb: r, h, c, seg });
  }
  pyr(x: number, y: number, z: number, w: number, h: number, d: number, c: number): void {
    this.parts.push({ t: 'pyr', x, y: y + h / 2, z, w, h, d, c });
  }
  sign(
    text: string,
    x: number,
    y: number,
    z: number,
    ry: number,
    w = 3.2,
    h = 0.9,
    bg = '#4a3220',
    fg = '#f6dc9a',
  ): void {
    this.signs.push({ text, x, y, z, ry, w, h, bg, fg });
  }

  /** A shop-style building: walls, pitched roof, door + windows on the face turned toward (tx,tz). Solid collider. */
  building(
    x: number,
    z: number,
    w: number,
    d: number,
    h: number,
    wall: number,
    roof: number,
    y0: number,
    label?: string,
    face: [number, number] = [0, 0],
  ): void {
    const raw = Math.atan2(face[0] - x, face[1] - z);
    const q = Math.round(raw / (Math.PI / 2));
    const ry = q * (Math.PI / 2);
    const swap = Math.abs(q) % 2 === 1;
    const sn = Math.sin(ry),
      cs = Math.cos(ry);
    const loc = (dx: number, dz: number): [number, number] => [x + dx * cs + dz * sn, z - dx * sn + dz * cs];
    const W = swap ? d : w,
      D = swap ? w : d;
    this.box(x, y0, z, W, h, D, wall, true);
    this.box(x, y0 + h, z, W + 1, 0.4, D + 1, roof);
    this.pyr(x, y0 + h + 0.4, z, W + 1.6, h * 0.55, D + 1.6, roof);
    const deco = (dx: number, dy: number, dz: number, bw: number, bh: number, bd: number, c: number) => {
      const [wx, wz] = loc(dx, dz);
      this.parts.push({ t: 'box', x: wx, y: y0 + dy + bh / 2, z: wz, w: bw, h: bh, d: bd, c, ry });
    };
    deco(0, 0, d / 2 + 0.03, 1.6, 2.5, 0.1, WOOD_D);
    deco(-w * 0.3, 1.4, d / 2 + 0.03, 1.4, 1.2, 0.1, 0x9ad0f0);
    deco(w * 0.3, 1.4, d / 2 + 0.03, 1.4, 1.2, 0.1, 0x9ad0f0);
    deco(0, 0, d / 2 + 0.6, w * 0.9, 0.18, 1.1, STONE);
    if (label) {
      const [wx, wz] = loc(0, d / 2 + 0.15);
      this.sign(label, wx, y0 + h - 0.2, wz, ry);
    }
  }
  lamp(x: number, y: number, z: number): void {
    this.cyl(x, y, z, 0.1, 3.4, 0x2a2a30, 6);
    this.parts.push({ t: 'sphere', x, y: y + 3.6, z, r: 0.28, c: 0xffe39a });
    this.lamps.push({ x, y: y + 3.6, z });
  }
  fence(x0: number, z0: number, x1: number, z1: number, y: number): void {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 2.2));
    const ang = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.box(x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t, 0.18, 1.2, 0.18, WOOD_D);
    }
    this.parts.push({
      t: 'box',
      x: (x0 + x1) / 2,
      y: y + 0.95,
      z: (z0 + z1) / 2,
      w: 0.1,
      h: 0.12,
      d: len,
      c: WOOD,
      ry: ang,
    });
    this.parts.push({
      t: 'box',
      x: (x0 + x1) / 2,
      y: y + 0.55,
      z: (z0 + z1) / 2,
      w: 0.1,
      h: 0.12,
      d: len,
      c: WOOD,
      ry: ang,
    });
  }
}

export function buildHub(terrain: Terrain): HubLayout {
  const s = new Struct();
  const Y = terrain.heightAt(0, 0);

  // ---------------- town square & fountain
  s.parts.push({ t: 'cyl', x: 0, y: Y + 0.05, z: 0, rt: 15, rb: 15, h: 0.2, c: 0xc9bfae, seg: 28 });
  s.parts.push({ t: 'cyl', x: 0, y: Y + 0.45, z: 0, rt: 2.6, rb: 3, h: 0.9, c: STONE, seg: 14 });
  s.parts.push({ t: 'cyl', x: 0, y: Y + 1.0, z: 0, rt: 2.0, rb: 2.0, h: 0.2, c: 0x4a9ad0, seg: 14 });
  s.parts.push({ t: 'cyl', x: 0, y: Y + 1.5, z: 0, rt: 0.3, rb: 0.5, h: 1.6, c: STONE, seg: 8 });
  s.parts.push({ t: 'sphere', x: 0, y: Y + 2.4, z: 0, r: 0.45, c: 0x7ac0f0 });
  s.boxes.push({ x: 0, y: Y + 0.5, z: 0, hx: 2.7, hy: 0.6, hz: 2.7, ry: 0 });

  // ---------------- shops
  const T = HUB;
  s.building(T.toolShop[0], T.toolShop[1], 12, 9, 5, PLASTER, ROOF_R, Y, 'GUS & SONS — TOOLS', [
    T.toolShop[0],
    100,
  ]);
  s.building(T.landOffice[0], T.landOffice[1], 12, 9, 5, PLASTER2, ROOF_B, Y, 'LAND OFFICE', [
    T.landOffice[0],
    100,
  ]);
  s.building(T.smithy[0], T.smithy[1], 11, 9, 4.5, 0x9a8f86, 0x4a4a52, Y, 'THE SMITHY', [-100, T.smithy[1]]);
  s.cyl(T.smithy[0] + 3.5, Y + 4, T.smithy[1] - 2, 0.7, 4, 0x6a625a, 8);
  s.box(T.smithy[0] - 8, Y, T.smithy[1], 0.9, 1.0, 1.6, 0x3a3a42, true); // anvil
  s.building(T.exchange[0], T.exchange[1], 12, 9, 5, 0xe8d8b0, ROOF_G, Y, 'LUMBER EXCHANGE', [
    T.exchange[0],
    -100,
  ]);
  s.building(T.garage[0], T.garage[1], 16, 12, 5, 0xc8ccd4, 0x5a6270, Y, 'GARAGE & MECHANIC', [
    T.garage[0],
    100,
  ]);
  s.box(T.garage[0], Y, T.garage[1] + 6.1, 8, 4, 0.2, 0x5a6270); // roll-up door

  // quest board
  s.box(T.questBoard[0] - 2, Y, T.questBoard[1], 0.3, 3.2, 0.3, WOOD_D, true);
  s.box(T.questBoard[0] + 2, Y, T.questBoard[1], 0.3, 3.2, 0.3, WOOD_D, true);
  s.box(T.questBoard[0], Y + 1.2, T.questBoard[1], 4.6, 2.2, 0.25, 0x8a6a40);
  s.box(T.questBoard[0], Y + 3.3, T.questBoard[1], 5, 0.3, 0.9, ROOF_R);
  s.sign('QUESTS & JOBS', T.questBoard[0], Y + 3.0, T.questBoard[1] + 0.3, 0, 3.6, 0.7);
  for (let i = 0; i < 6; i++)
    s.box(
      T.questBoard[0] - 1.7 + (i % 3) * 1.7,
      Y + 1.7 + Math.floor(i / 3) * 0.8,
      T.questBoard[1] + 0.15,
      1.0,
      0.6,
      0.04,
      0xf2e8c8,
    );

  // ---------------- public sawmill
  const [sx, sz] = T.sawmill;
  s.box(sx, Y, sz, 20, 0.3, 14, 0x8a8478); // concrete pad
  s.box(sx, Y + 0.3, sz - 3, 16, 6, 6, 0xb88a58, true);
  s.box(sx, Y + 6.3, sz - 3, 17, 0.4, 7, 0x6a4a30);
  s.pyr(sx, Y + 6.7, sz - 3, 18, 2.5, 8, 0x7a5a3a);
  s.box(sx - 3, Y + 0.3, sz + 3, 10, 0.8, 2.2, 0x6a6a72, true); // conveyor bed leading to saw
  s.box(sx - 3, Y + 1.15, sz + 3, 10, 0.12, 2.0, 0x2a2a30);
  s.cyl(sx + 4.2, Y + 1.5, sz + 3, 1.2, 0.18, 0xd0d6dc, 20); // saw blade (static decor, animated in view)
  s.sign('PUBLIC SAWMILL', sx, Y + 6.0, sz + 0.15, 0, 5, 1.1);
  s.sign('LOGS IN →', sx - 8.5, Y + 2.0, sz + 3, Math.PI / 2, 2.2, 0.6, '#2a3a2a', '#c8f0a0');
  const sawIntake: Zone = { x: sx - 8.4, y: Y + 1.5, z: sz + 3, hx: 3.2, hy: 2.5, hz: 3.2 };
  s.points.push({ id: 'sawmill', label: 'Collect planks', x: sx + 3, z: sz + 7, radius: 5, kind: 'sawmill' });

  // ---------------- sell counter
  const [cx, cz] = T.sellCounter;
  s.box(cx, Y, cz, 9, 0.25, 7, 0xb8b0a0);
  s.box(cx, Y + 0.25, cz - 2.6, 8, 1.2, 1.2, WOOD, true);
  s.box(cx - 3.8, Y + 0.25, cz - 2.6, 0.3, 3.8, 0.3, WOOD_D);
  s.box(cx + 3.8, Y + 0.25, cz - 2.6, 0.3, 3.8, 0.3, WOOD_D);
  s.box(cx, Y + 4.0, cz - 2.6, 8.6, 0.3, 2.4, ROOF_R);
  s.sign('SELL LOGS HERE', cx, Y + 3.6, cz - 1.4, 0, 4.4, 0.8, '#5a2a1a', '#ffe8a8');
  const sellZone: Zone = { x: cx, y: Y + 1.5, z: cz + 0.8, hx: 3.8, hy: 2.5, hz: 2.6 };
  s.points.push({ id: 'sell_planks', label: 'Sell items', x: cx, z: cz - 1.5, radius: 4.5, kind: 'sell' });

  // ---------------- gas station
  const [gx, gz] = T.gasStation;
  s.box(gx, Y + 4.4, gz, 12, 0.4, 7, 0xd04a3a);
  s.box(gx - 5.5, Y, gz - 3, 0.4, 4.4, 0.4, 0xe8e8e8, true);
  s.box(gx + 5.5, Y, gz - 3, 0.4, 4.4, 0.4, 0xe8e8e8, true);
  s.box(gx - 5.5, Y, gz + 3, 0.4, 4.4, 0.4, 0xe8e8e8, true);
  s.box(gx + 5.5, Y, gz + 3, 0.4, 4.4, 0.4, 0xe8e8e8, true);
  for (const dx of [-2.5, 2.5]) s.box(gx + dx, Y, gz, 0.9, 1.9, 0.9, 0xd04a3a, true);
  s.sign('FUEL', gx, Y + 4.2, gz + 3.6, 0, 2.4, 0.7, '#2a2a30', '#ffd84a');
  s.points.push({ id: 'gas', label: 'Refuel', x: gx, z: gz + 3, radius: 6, kind: 'gas' });

  // ---------------- train station (west) + short platform
  const [tx, tz] = T.trainStation;
  s.box(tx, Y, tz, 16, 0.8, 5, 0xb8b0a0);
  s.box(tx, Y + 0.8, tz - 1.8, 15, 3.2, 1.2, 0xa07a5a, true);
  s.box(tx, Y + 4, tz, 17, 0.3, 6, 0x8a3a2a);
  s.sign('HUB STATION', tx, Y + 3.6, tz + 1.6, 0, 4.4, 0.8);
  s.points.push({ id: 'station', label: 'Train station', x: tx, z: tz + 4, radius: 5, kind: 'train' });

  // ---------------- decor: houses, lamps, fences
  const houses: [number, number, number][] = [
    [-70, -8, ROOF_G],
    [-72, 8, ROOF_B],
    [66, -48, ROOF_R],
    [-52, -56, ROOF_B],
    [78, 56, ROOF_G],
    [-30, 66, ROOF_R],
  ];
  for (const [hx, hz, rc] of houses)
    s.building(hx, hz, 8, 7, 3.6, PLASTER, rc, terrain.heightAt(hx, hz), undefined, [0, 0]);
  for (const a of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const ang = (a / 8) * Math.PI * 2;
    s.lamp(Math.cos(ang) * 14, Y, Math.sin(ang) * 14);
  }
  for (const [lx, lz] of [
    [-26, -8],
    [26, -8],
    [0, -20],
    [-24, 28],
    [22, 26],
    [40, 22],
    [50, 30],
    [-58, 20],
    [70, 8],
  ] as [number, number][])
    s.lamp(lx, Y, lz);
  s.fence(-14, 18, -4, 18, Y);
  s.fence(4, 18, 14, 18, Y);
  // welcome sign at spawn
  s.sign('WELCOME TO TIMBER EMPIRE', 0, Y + 2.6, 22, Math.PI, 6, 0.9, '#2e3a22', '#f6e8a8');
  s.box(-2.8, Y, 22, 0.3, 2.6, 0.3, WOOD_D);
  s.box(2.8, Y, 22, 0.3, 2.6, 0.3, WOOD_D);

  // ---------------- bridge over the river (toll bridge)
  const bx = BRIDGE.x,
    bz = BRIDGE.z,
    by = BRIDGE.y;
  const half = BRIDGE.halfLen;
  s.box(bx, by - 0.5, bz, half * 2, 0.5, BRIDGE.width, 0x8a6a45, true);
  for (const side of [-1, 1]) {
    s.box(bx, by, bz + side * (BRIDGE.width / 2 - 0.15), half * 2, 0.9, 0.3, WOOD_D);
    for (let i = -half + 1; i <= half; i += 5)
      s.box(bx + i, by - 3, bz + side * (BRIDGE.width / 2 - 0.3), 0.6, 3, 0.6, WOOD_D);
  }
  for (let i = -half + 4; i <= half - 4; i += 10)
    s.box(bx + i, by - 5.2, bz, 1.2, 5, BRIDGE.width - 1, WOOD_D);
  s.sign('TOLL BRIDGE — $25', bx - half - 0.5, by + 2.2, bz - 5.2, 0, 3.6, 0.8, '#3a2a1a', '#ffd070');
  s.box(bx - half + 2, by, bz + 6, 2.4, 2.4, 2.4, 0x9a6a4a, true); // toll booth
  s.points.push({
    id: 'toll',
    label: 'Toll booth ($25)',
    x: bx - half + 2,
    z: bz + 6,
    radius: 4,
    kind: 'shop',
    arg: 'toll',
  });

  // ---------------- dock
  const shoreProbe = (() => {
    for (let x = DOCK.x; x < riverX(DOCK.z) + 6; x += 1) if (terrain.heightAt(x, DOCK.z) < 1.5) return x;
    return DOCK.x + 10;
  })();
  const pierY = 1.5;
  const pierLen = Math.max(18, riverX(DOCK.z) + 8 - shoreProbe);
  s.box(shoreProbe + pierLen / 2, pierY - 0.3, DOCK.z, pierLen, 0.3, 5, 0x9a7a52, true);
  for (let i = 0; i <= pierLen; i += 4) {
    s.box(shoreProbe + i, pierY - 3.5, DOCK.z - 2.4, 0.5, 3.5, 0.5, WOOD_D);
    s.box(shoreProbe + i, pierY - 3.5, DOCK.z + 2.4, 0.5, 3.5, 0.5, WOOD_D);
  }
  s.building(
    shoreProbe - 6,
    DOCK.z - 7,
    9,
    6,
    3.6,
    0xc8d8e0,
    0x2a6a8a,
    terrain.heightAt(shoreProbe - 6, DOCK.z - 7),
    'HARBOR',
    [shoreProbe + 6, DOCK.z],
  );
  s.points.push({ id: 'dock', label: 'Harbor', x: shoreProbe + 2, z: DOCK.z, radius: 6, kind: 'dock' });

  // ---------------- airfield
  const AY = terrain.heightAt(AIRFIELD.x, AIRFIELD.z);
  s.parts.push({
    t: 'box',
    x: AIRFIELD.x,
    y: AY + 0.1,
    z: AIRFIELD.z,
    w: AIRFIELD.hx * 2,
    h: 0.2,
    d: AIRFIELD.hz * 2,
    c: 0x4a4a52,
  });
  for (let i = -AIRFIELD.hx + 6; i < AIRFIELD.hx - 6; i += 12)
    s.parts.push({
      t: 'box',
      x: AIRFIELD.x + i,
      y: AY + 0.22,
      z: AIRFIELD.z,
      w: 6,
      h: 0.05,
      d: 0.6,
      c: 0xf4f4f4,
    });
  s.building(AIRFIELD.x - 40, AIRFIELD.z + 34, 22, 14, 7, 0xc8ccd4, 0x5a6270, AY, 'AIRFIELD HANGAR', [
    AIRFIELD.x - 40,
    AIRFIELD.z,
  ]);
  s.cyl(AIRFIELD.x + 62, AY, AIRFIELD.z + 22, 0.15, 6, 0xdddddd, 6);
  s.parts.push({
    t: 'cone',
    x: AIRFIELD.x + 63.6,
    y: AY + 5.6,
    z: AIRFIELD.z + 22,
    r: 0.7,
    h: 3,
    c: 0xff6a1a,
    seg: 8,
  });
  s.points.push({
    id: 'airfield',
    label: 'Airfield',
    x: AIRFIELD.x - 40,
    z: AIRFIELD.z + 18,
    radius: 8,
    kind: 'shop',
    arg: 'airfield',
  });
  s.points.push({
    id: 'airfield2',
    label: 'Airfield',
    x: AIRFIELD.x + 20,
    z: AIRFIELD.z + 22,
    radius: 6,
    kind: 'shop',
    arg: 'airfield',
  });

  return {
    parts: s.parts,
    boxes: s.boxes,
    signs: s.signs,
    points: s.points,
    sellZone,
    sawIntake,
    garagePad: { x: T.garage[0], y: Y, z: T.garage[1] + 13, yaw: 0 },
    boatPad: { x: shoreProbe + pierLen - 2, y: 0, z: DOCK.z + 7, yaw: Math.PI / 2 },
    airPad: { x: AIRFIELD.x - AIRFIELD.hx + 12, y: AY, z: AIRFIELD.z, yaw: Math.PI / 2 },
    lamps: s.lamps,
    pierY,
  };
}

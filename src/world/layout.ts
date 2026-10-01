/** Hand-placed world layout shared by data tables and terrain generation (no imports → no cycles). */
export const riverX = (z: number): number =>
  190 + 45 * Math.sin((z - 66) * 0.0072) + 16 * Math.sin((z - 66) * 0.02);
export const RIVER_WIDTH = 13;

export const BRIDGE_Z = -40;
export const BRIDGE = { x: riverX(BRIDGE_Z), z: BRIDGE_Z, halfLen: 26, width: 9, y: 4.2 };
export const DOCK = { x: riverX(66) - 27, z: 66 };

/** Canal linking the river to the Tropic Isles; also the ferry route (river course + canal). */
export const CANAL: [number, number][] = (() => {
  const r = riverX(760);
  return [
    [r, 760],
    [r + 140, 800],
    [r + 380, 840],
    [r + 560, 880],
    [840, 880],
  ];
})();
export const FERRY_ROUTE: [number, number][] = (() => {
  const pts: [number, number][] = [];
  for (let z = DOCK.z + 20; z < 760; z += 40) pts.push([riverX(z), z]);
  return [...pts, ...CANAL];
})();

/** Airfield: runway along x, flattened by the terrain generator. */
export const AIRFIELD = { x: -230, z: 130, hx: 80, hz: 18 };
/** Extra axis-aligned zones the terrain flattens (besides plots and the hub). */
export const FLAT_ZONES: { id: string; x: number; z: number; hx: number; hz: number }[] = [
  { id: 'airfield', x: AIRFIELD.x, z: AIRFIELD.z + 14, hx: AIRFIELD.hx + 10, hz: AIRFIELD.hz + 26 },
];

/** Hub landmark layout (x,z). */
export const HUB = {
  center: [0, 0] as [number, number],
  flatRadius: 90,
  square: [0, 0] as [number, number],
  toolShop: [-26, -22] as [number, number],
  landOffice: [26, -22] as [number, number],
  questBoard: [0, -28] as [number, number],
  sawmill: [-58, 32] as [number, number],
  sellCounter: [-24, 38] as [number, number],
  smithy: [40, 8] as [number, number],
  garage: [50, 44] as [number, number],
  gasStation: [70, 20] as [number, number],
  exchange: [22, 36] as [number, number],
  dock: [DOCK.x, DOCK.z] as [number, number],
  spawn: [0, 12] as [number, number],
  bridge: [BRIDGE.x, BRIDGE.z] as [number, number],
  trainStation: [-80, -50] as [number, number],
  airfield: [AIRFIELD.x, AIRFIELD.z] as [number, number],
};

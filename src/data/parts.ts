/** Building parts. Geometry origin = bottom-center of the footprint; size is [w,h,d] in meters. */
export type PartCat = 'wall' | 'floor' | 'roof' | 'stairs' | 'door' | 'fence' | 'decor' | 'light' | 'prefab' | 'logic';

export interface PartDef {
  id: string;
  name: string;
  cat: PartCat;
  size: [number, number, number];
  planks: number; // planks (of chosen wood) per part
  money?: number; // prefabs cost money
  collider: 'box' | 'ramp' | 'none';
  interactive?: 'door' | 'chest' | 'switch' | 'sawmill' | 'sellstand' | 'workbench' | 'forge' | 'pump';
  unlock?: number; // crafting level required
  desc: string;
  furniture?: string; // places a furniture item from inventory instead of planks
}

export const PARTS: PartDef[] = [
  { id: 'wall', name: 'Wall', cat: 'wall', size: [4, 3, 0.3], planks: 3, collider: 'box', desc: 'A solid wall segment.' },
  { id: 'wall_half', name: 'Half Wall', cat: 'wall', size: [4, 1.4, 0.3], planks: 2, collider: 'box', desc: 'Waist-high wall.' },
  { id: 'wall_window', name: 'Window Wall', cat: 'wall', size: [4, 3, 0.3], planks: 3, collider: 'box', desc: 'Wall with a window.' },
  { id: 'wall_door', name: 'Doorway Wall', cat: 'wall', size: [4, 3, 0.3], planks: 3, collider: 'none', desc: 'Wall with an open doorway. Fits a door.' },
  { id: 'floor', name: 'Floor', cat: 'floor', size: [4, 0.3, 4], planks: 3, collider: 'box', desc: 'Floor tile; stack for upper floors.' },
  { id: 'floor_half', name: 'Half Floor', cat: 'floor', size: [4, 0.3, 2], planks: 2, collider: 'box', desc: 'Half-depth floor tile.' },
  { id: 'roof_flat', name: 'Flat Roof', cat: 'roof', size: [4, 0.3, 4], planks: 3, collider: 'box', desc: 'Flat roof tile.' },
  { id: 'roof_slope', name: 'Sloped Roof', cat: 'roof', size: [4, 1.6, 4], planks: 4, collider: 'ramp', desc: 'Pitched roof section (rises along depth).' },
  { id: 'roof_peak', name: 'Gable Peak', cat: 'roof', size: [4, 2, 0.3], planks: 3, collider: 'none', desc: 'Triangular gable end.' },
  { id: 'stairs', name: 'Stairs', cat: 'stairs', size: [2, 3, 4], planks: 5, collider: 'ramp', desc: 'Stairs up one storey.' },
  { id: 'pillar', name: 'Pillar', cat: 'wall', size: [0.5, 3, 0.5], planks: 1, collider: 'box', desc: 'Support pillar.' },
  { id: 'beam', name: 'Beam', cat: 'wall', size: [4, 0.3, 0.3], planks: 1, collider: 'box', desc: 'Horizontal beam.' },
  { id: 'fence', name: 'Fence', cat: 'fence', size: [2, 1.1, 0.15], planks: 1, collider: 'box', desc: 'Picket fence.' },
  { id: 'door', name: 'Door', cat: 'door', size: [1.6, 2.6, 0.15], planks: 3, collider: 'box', interactive: 'door', desc: 'Opens with [E].' },
  { id: 'gate', name: 'Gate', cat: 'door', size: [2.2, 1.4, 0.15], planks: 3, collider: 'box', interactive: 'door', desc: 'Garden gate.' },
  { id: 'lamp', name: 'Lamp Post', cat: 'light', size: [0.4, 3.2, 0.4], planks: 2, collider: 'box', desc: 'Emits light at night.' },
  { id: 'lantern', name: 'Lantern', cat: 'light', size: [0.4, 0.5, 0.4], planks: 1, collider: 'none', desc: 'Small hanging/standing light.' },
  { id: 'sign', name: 'Sign Board', cat: 'decor', size: [2, 1, 0.15], planks: 1, collider: 'box', desc: 'A sign (name it in the build menu).' },
  { id: 'chest', name: 'Storage Chest', cat: 'decor', size: [1.1, 0.8, 0.7], planks: 0, furniture: 'chest_item', collider: 'box', interactive: 'chest', desc: 'Place a Storage Chest item. Stores 40 stacks.' },
  { id: 'chair', name: 'Chair', cat: 'decor', size: [0.6, 1.0, 0.6], planks: 0, furniture: 'chair', collider: 'box', desc: 'Place a crafted chair.' },
  { id: 'table', name: 'Table', cat: 'decor', size: [1.8, 0.9, 1.0], planks: 0, furniture: 'table', collider: 'box', desc: 'Place a crafted table.' },
  { id: 'bookshelf', name: 'Bookshelf', cat: 'decor', size: [1.8, 2.2, 0.5], planks: 0, furniture: 'bookshelf', collider: 'box', desc: 'Place a crafted bookshelf.' },
  { id: 'bed', name: 'Bed', cat: 'decor', size: [1.2, 0.7, 2.2], planks: 0, furniture: 'bed', collider: 'box', desc: 'Place a crafted bed. Sleep with [E] to skip to morning.', interactive: 'switch' },
  { id: 'barrel', name: 'Barrel', cat: 'decor', size: [0.8, 1.0, 0.8], planks: 0, furniture: 'barrel', collider: 'box', desc: 'Place a crafted barrel.' },
  { id: 'sawmill', name: 'Personal Sawmill', cat: 'prefab', size: [8, 4, 6], planks: 0, money: 8000, collider: 'box', interactive: 'sawmill', desc: 'Your own sawmill. Drop logs at the intake; upgrade for speed, yield and automation.' },
  { id: 'sellstand', name: 'Sell Stand', cat: 'prefab', size: [3, 2.6, 2], planks: 0, money: 3000, collider: 'box', interactive: 'sellstand', desc: 'A market stall that auto-sells goods dropped on it and earns passive income from stocked planks.' },
  { id: 'workbench', name: 'Crafting Bench', cat: 'prefab', size: [2.4, 1.1, 1.1], planks: 0, money: 1500, collider: 'box', interactive: 'workbench', desc: 'Craft furniture and goods from planks.' },
  { id: 'workshop', name: 'Workshop', cat: 'prefab', size: [5, 3, 4], planks: 0, money: 24000, collider: 'box', interactive: 'workbench', desc: 'Business: crafts furniture automatically from stocked planks, producing sellable goods.' },
  { id: 'factory', name: 'Factory', cat: 'prefab', size: [8, 5, 6], planks: 0, money: 160000, collider: 'box', interactive: 'workbench', desc: 'Business: mass-produces furniture. Big passive income.' },
  { id: 'firewood_stall', name: 'Firewood Stall', cat: 'prefab', size: [3, 2.4, 2], planks: 0, money: 2500, collider: 'box', interactive: 'workbench', desc: 'Business: turns planks into firewood bundles that sell all winter.' },
  { id: 'switch', name: 'Switch', cat: 'logic', size: [0.3, 0.4, 0.15], planks: 1, money: 300, collider: 'none', interactive: 'switch', unlock: 3, desc: 'Toggle with [E]. Powers wired parts.' },
  { id: 'timer', name: 'Timer', cat: 'logic', size: [0.4, 0.4, 0.3], planks: 1, money: 800, collider: 'none', unlock: 5, desc: 'Pulses its output on an interval.' },
  { id: 'sensor', name: 'Sensor', cat: 'logic', size: [0.4, 0.4, 0.3], planks: 1, money: 800, collider: 'none', unlock: 5, desc: 'Outputs power while a player or log is in range.' },
  { id: 'gate_and', name: 'AND Gate', cat: 'logic', size: [0.5, 0.5, 0.3], planks: 1, money: 1000, collider: 'none', unlock: 6, desc: 'Powered only if both inputs are powered.' },
  { id: 'gate_not', name: 'NOT Gate', cat: 'logic', size: [0.5, 0.5, 0.3], planks: 1, money: 1000, collider: 'none', unlock: 6, desc: 'Inverts its input.' },
  { id: 'piston', name: 'Piston', cat: 'logic', size: [0.6, 0.6, 1.6], planks: 2, money: 1500, collider: 'box', unlock: 6, desc: 'Extends when powered; pushes logs.' },
  { id: 'conveyor', name: 'Conveyor', cat: 'logic', size: [1.2, 0.3, 4], planks: 2, money: 1200, collider: 'box', unlock: 4, desc: 'Moves logs and players along it when powered (or always if unwired).' },
  { id: 'screen', name: 'Screen', cat: 'logic', size: [2, 1.2, 0.15], planks: 1, money: 1500, collider: 'none', unlock: 6, desc: 'Displays a counter: logs sold on this plot, or power state.' },
];

export const PART_BY_ID: Record<string, PartDef> = Object.fromEntries(PARTS.map((p) => [p.id, p]));
export const PART_INDEX: Record<string, number> = Object.fromEntries(PARTS.map((p, i) => [p.id, i]));

import type { NpcDef } from './types';
import { DOCK } from '../world/layout';

export const NPCS: NpcDef[] = [
  {
    id: 'gus',
    name: 'Gus',
    role: 'Tool Seller',
    pos: [-26, -14],
    color: 0xc0853a,
    shop: 'tools',
    lines: [
      'Welcome to Gus & Sons! Well, just Gus. The sons left.',
      'A good axe pays for itself in a week. A bad one pays for a doctor.',
      'Hardened steel, bronze, silver... take your pick.',
    ],
  },
  {
    id: 'marla',
    name: 'Marla',
    role: 'Land Agent',
    pos: [26, -14],
    color: 0x7a5ac8,
    shop: 'land',
    lines: [
      "Land is the only thing they're not making more of.",
      'Pick a plot, build a sawmill, make it yours.',
      'Buy adjacent sections to grow your property.',
    ],
  },
  {
    id: 'brokk',
    name: 'Brokk',
    role: 'Smith',
    pos: [38, 14],
    color: 0x8a4a2a,
    shop: 'smith',
    lines: [
      'I can upgrade, enchant, repair... or forge three old axes into something fresh.',
      "Bring me ore and I'll bring you a sharper edge.",
      'Dull axes make dull lumberjacks.',
    ],
  },
  {
    id: 'dot',
    name: 'Dot',
    role: 'Mechanic',
    pos: [48, 40],
    color: 0x3a8ad0,
    shop: 'mechanic',
    lines: [
      "Fill 'er up or fix 'er up?",
      'Engine, tires, tank — I can tune it all.',
      "Don't park on the road. Seriously.",
    ],
  },
  {
    id: 'ivy',
    name: 'Ivy',
    role: 'Forester',
    pos: [0, -32],
    color: 0x4aa84a,
    lines: [
      "The forests are alive. Treat them well and they'll treat you better.",
      "Check the quest board — there's always work.",
      'Rare trees hide in the far biomes.',
    ],
  },
  {
    id: 'percival',
    name: 'Percival',
    role: 'Market Clerk',
    pos: [22, 30],
    color: 0xd0c048,
    shop: 'market',
    lines: [
      'Prices move! Watch the board and sell high.',
      'The exchange lets you bet on the future — carefully.',
      'Auction house open daily. 5% fee, no refunds.',
    ],
  },
  {
    id: 'nell',
    name: 'Captain Nell',
    role: 'Harbor Master',
    pos: [DOCK.x + 3, DOCK.z],
    color: 0x2a7a9a,
    shop: 'harbor',
    lines: [
      'Boats, ferries and barges. Ever sailed a cargo ship?',
      "The swamp channels are deep — you'll want a boat.",
      'The ferry runs to the Isles every few minutes.',
    ],
  },
  {
    id: 'wanderer',
    name: 'The Wanderer',
    role: 'Mysterious Traveler',
    pos: [-58, -40],
    color: 0x5a3a7a,
    shop: 'traveler',
    lines: [
      'I trade in things you may not understand.',
      'Some trees only bloom when no one is looking.',
      "Find me again tomorrow. I won't be here.",
    ],
  },
  {
    id: 'rue',
    name: 'Rue',
    role: 'Gear Merchant',
    pos: [-44, -10],
    color: 0xd06a8a,
    shop: 'gear',
    lines: [
      'Packs, boots, lamps, suits — the right kit opens the right doors.',
      'Cold? Hot? Dark? I have something for it.',
    ],
  },
];
export const NPC_BY_ID: Record<string, NpcDef> = Object.fromEntries(NPCS.map((n) => [n.id, n]));

export { HUB } from '../world/layout';

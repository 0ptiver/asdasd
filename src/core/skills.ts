import type { SkillId } from '../data/types';

/** XP needed for level L is 20*L^2 (so level = floor(sqrt(xp/20))). */
export const levelOf = (xp: number): number => Math.floor(Math.sqrt(Math.max(0, xp) / 20));
export const xpForLevel = (lvl: number): number => 20 * lvl * lvl;
export const SKILLS: { id: SkillId; name: string; perk: string; icon: string }[] = [
  { id: 'woodcutting', name: 'Woodcutting', perk: '+1% axe damage per level', icon: '🪓' },
  { id: 'strength', name: 'Strength', perk: 'Drag heavier logs', icon: '💪' },
  { id: 'driving', name: 'Driving', perk: '+0.5% vehicle speed & -1% fuel use per level', icon: '🚚' },
  { id: 'crafting', name: 'Crafting', perk: 'Unlocks recipes, +1% bonus output chance', icon: '🔨' },
  { id: 'foraging', name: 'Foraging', perk: 'Better fishing, foraging and digging luck', icon: '🌿' },
];
export const SKILL_PERKS: Record<number, string> = { 5: 'Novice', 10: 'Apprentice', 20: 'Journeyman', 35: 'Expert', 50: 'Master', 75: 'Grandmaster' };

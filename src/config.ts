/** Global tunables. Balance numbers for content live in /data; engine constants live here. */
export const CONFIG = {
  title: 'Timber Empire',
  version: '0.1.0',
  saveVersion: 1,
  worldSize: 3000,
  chunkSize: 64,
  chunkSegments: 16,
  viewChunks: 4, // radius in chunks that are loaded
  simHz: 60,
  maxSimStepsPerFrame: 5,
  autosaveSec: 30,
  saveSlots: 3,
  dayLengthSec: 960, // one in-game day in real seconds
  startMoney: 100,
  startHour: 8,
  player: {
    walkSpeed: 6.5,
    sprintSpeed: 10.5,
    jumpSpeed: 8.5,
    gravity: 24,
    radius: 0.45,
    height: 1.8,
    maxStamina: 100,
    staminaRegen: 18,
    sprintCost: 14,
    baseStrength: 40, // max log mass you can drag
    grabReach: 9,
  },
  physics: {
    maxLogs: 220,
    logDespawnSec: 900,
    logWarnSec: 60,
    sleepDistance: 140,
    fallSplitDelay: 6,
  },
  market: {
    tickSec: 20,
    sellTax: 0.04,
    tradeTax: 0.05,
    elasticity: 0.012,
    recovery: 0.02,
  },
  idle: { offlineCapHours: 8, offlineEfficiency: 0.5 },
  prestige: { baseMoneyRequirement: 2_000_000, multPerLevel: 0.25 },
  buildCap: { perPlot: 600, perSectionBonus: 150 },
  debug: { console: true },
} as const;

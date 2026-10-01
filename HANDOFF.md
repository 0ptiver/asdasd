# HANDOFF

State as of the last commit on `claude/youthful-wozniak-8l0ark`: **all 13 phases from the brief are implemented**, `npm run build`, `npm run lint`, `npm run typecheck`, `npm test` (~70 tests) and the Playwright e2e pass. Use this file to resume.

## Resume checklist

```bash
npm install
npm run dev              # play
npm test                 # headless sim tests (fast)
npm run test:e2e         # builds + runs Playwright (needs /opt/pw-browsers chromium or `npx playwright install chromium`)
npm run economy          # regenerate ECONOMY.md after touching prices
```

Dev helpers for visual checks (software GL is ~4 fps, so use waits): `node scripts/tour.mjs '[["name","js-or-@file.js",waitMs]]' 1280x720` takes screenshots into `/tmp/name.png`; the page exposes `window.__game` and `window.__cam = {pos:[x,y,z], at:[x,y,z]}` overrides the camera.

## File map (where to look)

- Game loop/sim: `src/core/{game,sim,boot,loop,input}.ts` — `boot.ts` is the system list/order.
- Data (all numbers): `src/data/*.ts`; validation `src/data/validate.ts`.
- World gen: `src/world/{terrain,trees,hub,caves,landmarks,layout}.ts`; chunk streaming `src/systems/streaming.ts`.
- Gameplay systems: `src/systems/*` — chopping/logs/grab/sawmill/sell/market, plots/building/logic/businesses, vehicles, jobs/workers/crafting/exchange(market2)/nodes, bosses/events/progression (achievements, prestige, events, pets), worldFeatures (caves, stations, secrets, ferry, toll, outposts), quests, tutorial.
- Rendering: `src/render/view.ts` composes `treeRender`, `logRender`, `buildRender`, `vehicleRender`, `landmarkRender`, `companions` (nodes/crew/pet), `remote`, `fx`, `weatherFx`, `environment` (sky/light), `water`, `terrainMesh`; models in `models.ts`, `vehicleModels.ts`, `partGeo.ts`, `treeGeo.ts`.
- UI: `src/ui/App.tsx` (panel router), `Hud.tsx`, `BuildBar.tsx`, `panels/*`, `Settings.tsx`, `MainMenu.tsx`.
- Saves: `src/save/{schema,migrations,slots}.ts` — bump `CONFIG.saveVersion` and add a migration when the shape changes (`fillDefaults` covers additive changes).
- Multiplayer: `src/net/{protocol,client}.ts`, `src/net/server/{hub,index}.ts`, tests in `tests/net.test.ts`.

## Gotchas learned

- When patching code with scripts, run prettier first or match its multi-line formatting — several early edits silently failed after prettier reformatted arrays (the interaction `switch` in `game.ts` is the example; verify with `grep`).
- Rapier: impulses apply immediately (re-read `linvel` before `setLinvel`); heightfield index is `ix*(N+1)+iz`; wheel brake only works when engine force is exactly 0.
- Plots flatten terrain with a margin — keep new landmarks away from plot rectangles (the bridge approach conflicted once).
- `Terrain.heightAt` wraps `rawHeight` (plot/zone flattening); use `rawHeight` for base-height questions.

## Ideas not done / next steps

- Real-GPU profiling pass and automatic quality scaling from measured frame time.
- Tap-and-drag log picking for touch; on-screen stick graphics.
- Richer boss models/animations; crew pathfinding; ferry timetable UI.
- Server-side validation of shared plot parts against part defs; admin tooling; Docker compose with TLS.

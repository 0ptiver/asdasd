# Timber Empire 🪓

A browser-based 3D lumberjack-tycoon game inspired by the _loop_ of Lumber Tycoon 2 — chop, drag, saw, sell, upgrade, build, drive — with original art, names and layout and a lot more content: **30 woods, 46 axes, 28 vehicles, 14 biomes, 34 land plots, 18 income streams**, a freeform building system with logic parts, a dynamic market, guardian bosses, prestige, and an opt-in multiplayer server.

Everything is procedural (low-poly models from primitives, synthesized sound and music), so the download is small (~5 MB) and there are no external assets.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/ (GitHub Pages / Netlify / Cloudflare Pages ready)
npm run preview    # serve the production build
```

Optional multiplayer server:

```bash
npm run server                      # ws://localhost:8787 (PORT, DATA_FILE env vars)
docker build -t timber-empire-server . && docker run -p 8787:8787 -v te-data:/data timber-empire-server
```

In game: pause menu (Esc) → **Multiplayer** → connect.

## Controls

| Action                                         | Keyboard / mouse                                                                                                                                     | Touch                                  |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Move / look / sprint / jump                    | WASD / mouse / Shift / Space                                                                                                                         | left stick / right-side drag / buttons |
| Chop (hold) · grab a log (hold on a log)       | Left mouse                                                                                                                                           | 🪓 button                              |
| Throw held log · log distance                  | Right mouse · wheel                                                                                                                                  | —                                      |
| Interact                                       | **E**                                                                                                                                                | E button                               |
| Inventory · Quests/Jobs · Map · Build · Garage | I · J · M · B · G                                                                                                                                    | on-screen buttons / menu               |
| Hotbar                                         | 1–8                                                                                                                                                  | tap hotbar                             |
| Vehicles                                       | WASD, Space brake, **E** exit, **R** hitch, **V** camera, **L** lights, **H** horn                                                                   |                                        |
| Build mode                                     | click place · RMB-click delete · RMB-drag orbit · **R** rotate · **Tab** tool · Ctrl+Z/Y undo/redo · Ctrl+C/V copy/paste · **X** snap · wheel height |                                        |
| Debug console                                  | `` ` `` (backtick) — try `help`, `unlockall`, `tp volcano`, `time 22`                                                                                |                                        |

All keys are rebindable in Settings. Gamepad: left stick move, right stick look, A jump, RT chop.

## The loop

1. Buy an axe at **Gus & Sons**, walk to the forest, chop trees (HP, per-wood multipliers, crits, abilities).
2. Trees fall as an inverted pendulum and split into **physical logs** (Rapier rigid bodies). Grab them with the mouse, throw them, load them on vehicles.
3. The **sawmill** turns logs into planks; sell at the counter. Prices follow supply & demand with random events — spread your sales.
4. Earn → better axes, gear, vehicles, **land**, a personal sawmill, businesses, a crew, outposts.
5. Push into harder biomes (gated by axe tier, gear and vehicles), fell guardian trees, discover secrets, **prestige** for permanent multipliers.

See `ECONOMY.md` for the numbers (income/hour per tier, time-to-unlock for every axe, vehicle and biome) and `DESIGN.md` for architecture and decisions.

## Project layout

```
src/
  core/      game loop (fixed 60 Hz), ECS, event bus, input, RNG/noise, day-night, debug console
  data/      woods, axes, vehicles, items, recipes, biomes, quests, npcs, bosses, plots, parts, achievements  ← add content here
  world/     seeded terrain, biomes, roads/rail/river/canal, tree placement, hub town, caves, landmarks
  systems/   trees, chopping, logs, grab, sawmill, sell, market, plots, building, logic, vehicles, jobs, workers, ...
  physics/   Rapier wrapper + collision groups
  render/    Three.js scene, terrain meshes, instanced trees/logs/parts, sky, water, fx, vehicle/character models
  ui/        Preact HUD, panels, build bar, settings, minimap
  audio/     procedural sfx + generative music/ambience
  save/      schema, migrations, IndexedDB slots, import/export
  net/       protocol, authoritative hub server, browser client
tests/       vitest (data validation, save migrations, terrain, headless simulation, vehicles, building, logic, net, economy, soak)
e2e/         Playwright smoke + full-flow tests
scripts/     data validator, economy model/report, dev screenshot helpers
```

Adding content = editing one data entry (e.g. a new wood in `src/data/woods.ts` plus listing its id in a biome). `npm run validate` checks every table and runs on build.

## Testing

```bash
npm test                 # unit + headless simulation tests (~70 tests, incl. a randomized soak session)
SOAK_MINUTES=20 npx vitest run tests/soak.test.ts   # longer soak
npm run test:e2e         # Playwright: boots the game, buys an axe, chops, saws, sells, reloads the page and checks the save
npm run lint && npm run typecheck
```

## Status & honest limitations

Everything listed above is implemented and exercised by tests. Known limitations are documented in `DESIGN.md` ("Known limitations"): notably the single-player simulation is client-side (multiplayer authority covers the wallet/stash, trades, social graph, leaderboards and shared plots — not the whole physics world), visuals were verified under software WebGL only, and some systems (e.g. worker visuals, ferry scheduling UI) are intentionally simple.

## License

Code: MIT. No third-party art/audio assets are used — see `CREDITS.md`.

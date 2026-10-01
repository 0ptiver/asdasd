# DESIGN

Decisions and architecture. Title/branding lives in `src/config.ts` and `index.html`.

## Tech stack (and why)

| Concern        | Choice                                                                                                | Notes                                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Language/build | TypeScript strict, Vite                                                                               | `npm run build` = validate data → typecheck → vite build                                                                        |
| Rendering      | Three.js (WebGL2)                                                                                     | instanced meshes (trees, logs, building parts), chunked terrain, 2 LOD levels for trees, flat-shaded vertex-color low-poly look |
| Physics        | Rapier (`rapier3d-compat`, WASM inlined)                                                              | heightfield colliders per chunk, dynamic logs, kinematic character controller, DynamicRayCastVehicleController                  |
| ECS/state      | tiny typed ECS (`core/ecs.ts`) for dynamic entities + one serializable `GameState` + typed `EventBus` | Systems are classes with `update(dt)`; no global mutable state outside systems                                                  |
| UI             | Preact + hand-written CSS                                                                             | HUD/panels are plain components reading the sim; `Game.bump()` throttles re-render                                              |
| Audio          | WebAudio synthesis (no files)                                                                         | `audio/sfx.ts` one-shots, `audio/music.ts` generative pads/plucks + noise ambience crossfading by biome/time                    |
| Assets         | none                                                                                                  | models are built from primitives (`render/prims.ts`), textures are canvas-generated                                             |
| Saves          | IndexedDB via `idb`, 3 slots, versioned schema + migrations + `fillDefaults`, JSON export/import      | autosave 30 s and on tab hide                                                                                                   |
| Multiplayer    | Node + `ws`, transport-independent `Hub`                                                              | see below                                                                                                                       |

## Simulation / rendering separation

`Sim` (core/sim.ts) owns physics and an ordered list of `System`s and steps at a fixed 60 Hz (`FixedLoop`). `View` (render/view.ts) only _reads_ the sim (positions, state) and is updated per animation frame. The sim never imports Three.js, so the whole game runs headless in Node — all gameplay tests (`tests/*.test.ts`) drive a real `Sim` with a fake input. This is also what lets multiplayer be layered on without touching gameplay code.

Systems are registered in `core/boot.ts` (dependency order matters: plots before player so tree exclusion exists when the first chunks load).

## World

- **Terrain** (`world/terrain.ts`) is a pure function of (seed, x, z): biome ownership by warped normalized distance with inverse-power blending; per-biome height functions (cone volcano, mesas, island masks, ridges…); hub/plot/airfield flattening, road/rail beds, river and canal carving, bridge abutments, world-edge ocean. Chunks (64 m, 16 segments) generate heights once; the same array feeds the mesh and the Rapier heightfield (`H[ix*(N+1)+iz]`, verified empirically).
- **Trees** (`world/trees.ts`) are deterministic per chunk (jittered grid, biome-weighted wood choice, mutation rolls, 1/20000 mythic). Chopped state is `state.world.chopped[treeId] = respawnAt`, so nothing else needs saving.
- **Hub** (`world/hub.ts`) is a pure description (render parts + solid boxes + interaction points + signs) consumed by both layers.
- **Caves**: dome shell with an arch entrance (render mesh + trimesh collider from the same geometry); darkness is lighting (headlamp point light), not a gameplay flag. **Sky islands**: a second height layer (`skyIslandHeight`) with its own heightfield; `surfaceAt(x,z,y)` picks the layer from the caller's altitude.
- **Landmarks** (`world/landmarks.ts`): fast-travel stations, seeded secrets, shafts, outposts.

## Physics choices

- **Falling trees** are an inverted pendulum (cheap, deterministic, looks right); on impact the trunk splits into log rigid bodies at the planned cut points with tangential velocities. Logs cap at 220 (oldest culled), sleep far away, despawn when idle and outside owned plots, float via a buoyancy impulse.
- **Grab** is a velocity spring (not a joint): stable with heavy logs, strength-gated (`mass ≤ strength`), reach-limited, throwable.
- **Vehicles**: ground = raycast vehicle (lowered COM, speed-limited engine, passive drag, brake/handbrake, anti-flip), boats = 4-point buoyancy + keel, rail = kinematic along the polyline, air = arcade velocity control, hover = analytic hover springs (works over water), mech = walker that chops what's in front. Learned the hard way: Rapier applies impulses immediately, so velocity must be re-read before `setLinvel`; wheel `engineForce != 0` disables braking, so throttle has a dead-zone.

## Data-driven content

Tables in `src/data/*` are the only place numbers live. `data/validate.ts` checks referential integrity (ids exist, no duplicates, sane numbers) on every build and in tests. Items for planks are generated from woods; furniture is `shape@wood` and priced from plank value.

## Economy

`ECONOMY.md` is generated by `scripts/economy.ts` (a greedy-progression model). `tests/economy.test.ts` pins the targets: first upgrade ≈ 5 min, first vehicle ≈ 30 min, first end-game axe 20–30 h. Market: per-wood multiplier mean-reverting with noise, supply from sales pushes price down (`elasticity`), recovery per tick, random events; `bonus()` aggregates prestige/pet/events. Money sinks are listed in `ECONOMY.md`.

## Building

Parts are compact tuples `[kind,x,y,z,yaw,sx,sy,sz,color,material,uid]` saved per plot. Placement raycasts (cursor ray in build mode via a free-cursor input mode), snaps to grid or flush against neighbours, validates plot bounds/cost/caps, charges planks of the chosen wood (full refund on delete). Interactive/logic parts get a stable `uid` in slot 10; wires are `[uidFrom,uidTo]` per plot. `LogicSystem` relaxes AND/NOT chains in 4 passes per tick and actuates doors/pistons/conveyors; screens and lamps read the results.

## Multiplayer security model

The single-player sim is client-authoritative by nature (it is a local save). The server (`net/server/hub.ts`) is therefore authoritative for what happens _after_ things cross the wire:

- **Accounts** with hashed tokens; one session per account; names and chat sanitized; strict message validators (`net/protocol.ts`) with size/shape/range limits; per-connection token-bucket rate limit and bad-message kick.
- **Wallet/stash** only change through `deposit`/`withdraw`/`trade`, all synchronous (atomic) functions that re-validate balances. Deposits are capped by the earnings the client has reported (and reported earnings growth is rate-limited), so a forged save can't mint unlimited tradeable wealth.
- **Trades**: both sides propose from their _server_ stash, any edit clears confirmations, commit re-validates both sides, applies a 5% tax on money, swaps, and is idempotent (replays are rejected).
- **Movement sanity**: impossible jumps are rubber-banded unless flagged as a teleport.
- **Visiting**: shared plots are validated, size-capped data; owners can be public/friends-only; blocks hide players, chat and trade/visit requests both ways.
- Persistence is an atomic JSON file (`DATA_FILE`).
  Not covered by authority: physics/logs/vehicles in the world (each player simulates their own world; others appear as presence ghosts).

## Performance

- Fixed 60 Hz sim; ≤5 steps per frame; chunk loading budgeted to 2/tick; tree/part pools are fixed-capacity instanced meshes with O(1) add/remove; trees beyond 150 m use low-poly geometry; shadows follow the player; logs capped; far vehicles/logs sleep; businesses and logic only simulate near the player.
- Graphics presets (low→ultra) change pixel ratio, shadows, view distance and post-processing; first run picks a preset from device hints; the tab pauses and saves when hidden.
- Production build ≈ 5 MB (4.3 MB is the inlined Rapier WASM).

## Known limitations (honest list)

- Visual verification was done with software WebGL in headless Chromium (≈4 fps) — frame-rate targets (60 fps laptop / 30 fps phone) are by design (instancing, LOD, budgets) but not measured on real GPUs.
- Multiplayer authority is limited to the economy/social layer described above; there is no shared physics world.
- Crew members are abstract producers with a simple visual (they idle/chop near the sawmill yard), not pathfinding AI.
- Touch controls are functional but basic (stick, look-drag, buttons); tap-and-drag logs uses the crosshair/act button rather than finger picking.
- Some end-game visuals (boss models, vehicle interiors) are simple primitives.
- Hot-air balloon/airship/plane flight models are arcade, not aerodynamic.

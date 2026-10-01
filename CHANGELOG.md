# Changelog

## 0.9.0 — full feature pass

- **Foundation** — Vite + TypeScript (strict) + Preact; fixed-timestep sim decoupled from rendering; typed event bus; lightweight ECS; versioned IndexedDB saves (3 slots, migrations, autosave 30 s, JSON import/export); loading screen; themed UI shell.
- **World** — 3000×3000 seeded terrain streamed in chunks with Rapier heightfield colliders; 14 biomes with sky/fog/light blending, day/night cycle, dynamic weather (rain, snow, blizzard, sandstorm, ash, storm); river with toll bridge, roads, railway, canal; caves with domes; sky islands.
- **Trees & axes** — 30 woods, mutations (Giant/Golden/Frozen/Cursed), instanced trees with LOD and respawn; 46 axes with abilities, upgrades, enchants, skins, durability, forge.
- **Logs & economy** — physics logs, mouse-grab with strength limits, throwing, sawmill, sell counter, dynamic supply/demand market with events, trend board.
- **Land & building** — 34 plots (+expansions), freeform building (snapping, undo/redo, copy/paste, blueprints), 38 part types, businesses (personal sawmill with upgrades/automation, sell stand, workshop, factory, firewood stall), logic (switch, timer, sensor, AND/NOT, piston, conveyor, screen, wires).
- **Vehicles** — 28 drivable vehicles (wheeled raycast, boats with buoyancy, rail, balloon/airship/plane/helicopter, hover sled, mech), fuel, damage, trailers, upgrades, paint/decals, garage/dealers.
- **Income streams** — jobs & reputation, quests (story, daily, weekly), crew, crafting, auction & futures, treasure, fishing, foraging, mining, guardian bosses, outposts (offline income), crates, events, secrets, seasons.
- **Progression** — skills, pets, achievements, prestige.
- **Multiplayer** — opt-in authoritative hub (accounts, trading post, atomic taxed trades, chat, friends/blocks, plot visiting, leaderboards, movement sanity, rate limits) + browser client.
- **Polish** — procedural music & ambience, bloom/SAO toggles, tutorial, accessibility options, touch controls, graphics presets, debug console.
- **Quality** — data validation on build, ~70 unit/headless tests, Playwright e2e, economy model with balance tests.

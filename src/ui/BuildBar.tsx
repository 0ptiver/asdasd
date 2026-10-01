import { useState } from 'preact/hooks';
import { game, useGame, money } from './hooks';
import { PARTS, type PartCat } from '../data/parts';
import { WOODS } from '../data/woods';
import { levelOf } from '../core/skills';
import { itemName } from '../systems/itemValue';
import { hex } from './icons';

const CATS: { id: PartCat; label: string }[] = [
  { id: 'wall', label: 'Walls' },
  { id: 'floor', label: 'Floors' },
  { id: 'roof', label: 'Roofs' },
  { id: 'stairs', label: 'Stairs' },
  { id: 'door', label: 'Doors' },
  { id: 'fence', label: 'Fences' },
  { id: 'light', label: 'Lights' },
  { id: 'decor', label: 'Decor' },
  { id: 'prefab', label: 'Businesses' },
  { id: 'logic', label: 'Logic' },
];
const COLORS = [
  0, 0xf2efe6, 0xc0392b, 0xe67e22, 0xf1c40f, 0x27ae60, 0x16a085, 0x2e86de, 0x8e44ad, 0xff6b9d, 0x7f8c8d,
  0x2c3e50, 0x6a4a2a,
];

/** Build mode toolbar. Free cursor: click to place, RMB click deletes, RMB-drag orbits. */
export function BuildBar() {
  useGame();
  const sim = game.sim!;
  const b = sim.building;
  const [cat, setCat] = useState<PartCat>('wall');
  const [bp, setBp] = useState('house');
  const plot = b.ghost.plot ?? sim.plots.plotAt(sim.player.x, sim.player.z, true)?.id ?? null;
  const st = plot ? sim.state.plots[plot] : null;
  const parts = PARTS.filter((p) => p.cat === cat);
  const crafting = levelOf(sim.state.skills.crafting);
  const woods = WOODS.filter((w) => sim.inventory.count('plank_' + w.id) > 0 || w.id === b.wood);
  const set = (fn: () => void) => () => {
    fn();
    game.bump(true);
  };
  return (
    <div
      style="position:fixed;left:0;right:0;bottom:0;background:#1c140ef2;border-top:2px solid var(--amber);padding:8px 12px;display:flex;flex-direction:column;gap:6px;pointer-events:auto;z-index:30"
      data-testid="build-bar"
    >
      <div class="row" style="justify-content:space-between">
        <div class="row">
          <b style="color:var(--amber-2)">🔨 BUILD</b>
          {(['place', 'select', 'delete'] as const).map((t) => (
            <button class={'btn small' + (b.tool === t ? '' : ' alt')} onClick={set(() => (b.tool = t))}>
              {t}
            </button>
          ))}
          <button class="btn alt small" onClick={set(() => b.undo())}>
            ↶ Undo
          </button>
          <button class="btn alt small" onClick={set(() => b.redo())}>
            ↷ Redo
          </button>
          <button class="btn alt small" onClick={set(() => b.rotate(Math.PI / 2))} title="R">
            ⟳ Rotate
          </button>
          <button class="btn alt small" onClick={set(() => b.resize(1.1))}>
            ＋
          </button>
          <button class="btn alt small" onClick={set(() => b.resize(1 / 1.1))}>
            －
          </button>
          <button
            class="btn alt small"
            onClick={set(
              () => (b.snap = b.snap === 1 ? 0.5 : b.snap === 0.5 ? 0.25 : b.snap === 0.25 ? 2 : 1),
            )}
          >
            Snap {b.snap}m
          </button>
          <button class="btn alt small" onClick={set(() => b.copy())}>
            Copy
          </button>
          <button class="btn alt small" onClick={set(() => b.paste())}>
            Paste
          </button>
        </div>
        <div class="row">
          <span style="font-size:0.8rem;color:var(--parch-dim)">
            {st
              ? `${plot}: ${st.parts.length}/${sim.plots.partCap(plot!)} parts`
              : 'Stand on / aim at your plot'}
          </span>
          <button class="btn bad small" onClick={set(() => sim.building.setMode(false))}>
            Exit [B]
          </button>
        </div>
      </div>
      <div class="row">
        {CATS.map((c) => (
          <div
            class={'tab' + (cat === c.id ? ' on' : '')}
            style="padding:3px 8px;font-size:0.85rem"
            onClick={() => setCat(c.id)}
          >
            {c.label}
          </div>
        ))}
        <span style="margin-left:auto;font-size:0.8rem;color:var(--parch-dim)">Material:</span>
        <select
          class="txt"
          value={b.wood}
          onChange={(e) => {
            b.wood = (e.target as HTMLSelectElement).value;
            game.bump(true);
          }}
        >
          {(woods.length ? woods : WOODS.slice(0, 1)).map((w) => (
            <option value={w.id}>
              {w.name} ({sim.inventory.count('plank_' + w.id)} planks)
            </option>
          ))}
        </select>
        <span style="display:flex;gap:3px">
          {COLORS.map((c) => (
            <span
              class="clickable"
              onClick={set(() => {
                b.color = c;
                if (b.tool === 'select') b.paintSelected(c);
              })}
              style={`width:18px;height:18px;border-radius:50%;border:2px solid ${b.color === c ? '#fff' : '#000'};background:${c ? hex(c) : 'repeating-linear-gradient(45deg,#9a6a3a,#9a6a3a 4px,#7a5230 4px,#7a5230 8px)'};cursor:pointer`}
              title={c ? hex(c) : 'natural wood'}
            />
          ))}
        </span>
      </div>
      <div class="row" style="flex-wrap:nowrap;overflow-x:auto;padding-bottom:2px">
        {parts.map((p) => {
          const cost = b.costOf(p);
          const lock = p.unlock && crafting < p.unlock;
          const ok = b.canAfford(cost) && !lock;
          return (
            <div
              class={'card clickable' + (b.kind === p.id ? ' owned' : '')}
              style={`min-width:150px;padding:5px 8px;cursor:pointer;opacity:${ok ? 1 : 0.6}`}
              onClick={set(() => {
                b.kind = p.id;
                b.tool = 'place';
              })}
              title={p.desc}
            >
              <div style="font-weight:800;font-size:0.9rem">{p.name}</div>
              <div style="font-size:0.72rem;color:var(--parch-dim)">
                {lock
                  ? `Crafting Lv ${p.unlock}`
                  : [
                      ...Object.entries(cost.items).map(([k, v]) => `${v}× ${itemName(k)}`),
                      cost.money ? money(cost.money) : '',
                    ]
                      .filter(Boolean)
                      .join(' + ') || 'free'}
              </div>
            </div>
          );
        })}
      </div>
      <div class="row">
        {b.kind === 'sign' && (
          <input
            class="txt"
            style="width:160px"
            placeholder="Sign text"
            value={b.signText}
            onInput={(e) => (b.signText = (e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.stopPropagation()}
          />
        )}
        <input
          class="txt"
          style="width:130px"
          value={bp}
          onInput={(e) => setBp((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="Blueprint name"
        />
        <button class="btn alt small" disabled={!plot} onClick={set(() => plot && b.saveBlueprint(plot, bp))}>
          Save blueprint
        </button>
        <select class="txt" onChange={(e) => setBp((e.target as HTMLSelectElement).value)}>
          <option value="">— load —</option>
          {Object.keys(st?.blueprints ?? {}).map((k) => (
            <option value={k}>{k}</option>
          ))}
        </select>
        <button
          class="btn alt small"
          disabled={!plot || !st?.blueprints[bp]}
          onClick={set(() => {
            if (plot) {
              const g = b.ghost;
              const err = b.loadBlueprint(
                plot,
                bp,
                g.plot ? g.x : sim.player.x,
                g.plot ? g.z : sim.player.z,
                b.rot,
              );
              if (err) sim.bus.emit('notify', { text: err, kind: 'bad' });
            }
          })}
        >
          Place blueprint at cursor
        </button>
        <span style="margin-left:auto;font-size:0.85rem;color:var(--bad)">{b.ghost.reason}</span>
      </div>
    </div>
  );
}

import { useState } from 'preact/hooks';
import { game, useGame, money } from '../hooks';
import { Panel } from '../Panel';
import { ITEM_BY_ID } from '../../data/items';
import { AXE_BY_ID, SKINS } from '../../data/axes';
import { itemName } from '../../systems/itemValue';
import { colorOf, iconOf } from '../icons';
import { axeStats } from '../../systems/axeStats';
import { levelOf } from '../../core/skills';
import type { GearSlot } from '../../data/types';

const SLOT_NAMES: Record<GearSlot, string> = {
  backpack: 'Backpack',
  boots: 'Boots',
  gloves: 'Gloves',
  head: 'Head',
  body: 'Body',
  tool: 'Tool',
};

export function InventoryPanel() {
  useGame();
  const sim = game.sim!;
  const st = game.state!;
  const [tab, setTab] = useState<'items' | 'axes' | 'gear' | 'skills'>('items');
  const [sel, setSel] = useState<number | null>(null);
  sim.inventory.syncSize();
  const slot = sel !== null ? st.inv.slots[sel] : null;

  const assignHotbar = (i: number) => {
    if (!slot) return;
    sim.inventory.assignHotbar(i, 'item:' + slot.id);
    game.bump(true);
  };

  return (
    <Panel title="Inventory" wide>
      <div class="tabs">
        {(['items', 'axes', 'gear', 'skills'] as const).map((t) => (
          <div class={'tab' + (tab === t ? ' on' : '')} onClick={() => setTab(t)}>
            {t[0]!.toUpperCase() + t.slice(1)}
          </div>
        ))}
      </div>
      <div class="body">
        {tab === 'items' && (
          <div style="display:flex;gap:14px;flex-wrap:wrap">
            <div style="flex:2;min-width:300px">
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(62px,1fr));gap:6px">
                {st.inv.slots.slice(0, st.inv.size).map((s, i) => (
                  <div
                    key={i}
                    class={'hotslot' + (sel === i ? ' sel' : '')}
                    style={{
                      width: 'auto',
                      height: '62px',
                      background: s ? colorOf(s.id) + '55' : '#1c140e',
                    }}
                    onClick={() => setSel(i)}
                    title={s ? itemName(s.id) : ''}
                  >
                    {s && (
                      <>
                        <div style="font-size:1.5rem">{iconOf(s.id)}</div>
                        <div style="position:absolute;right:3px;bottom:1px;font-size:0.72rem;font-weight:800">
                          {s.n > 1 ? s.n : ''}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div style="margin-top:8px;color:var(--parch-dim);font-size:0.85rem">
                {st.inv.slots.filter(Boolean).length}/{st.inv.size} slots · {money(st.money)}
              </div>
            </div>
            <div style="flex:1;min-width:220px" class="card">
              {slot ? (
                <>
                  <h4>
                    {iconOf(slot.id)} {itemName(slot.id)} ×{slot.n}
                  </h4>
                  <div class="desc">{ITEM_BY_ID[slot.id.split('@')[0]!]?.desc}</div>
                  <div>
                    Worth <span class="money">{money(sim.inventory.itemValue(slot.id))}</span> each
                  </div>
                  <div class="row">
                    <button
                      class="btn small"
                      onClick={() => {
                        sim.itemUse.use(slot.id);
                        game.bump(true);
                      }}
                    >
                      Use / Equip
                    </button>
                    <button
                      class="btn small bad"
                      onClick={() => {
                        sim.inventory.remove(slot.id, slot.n);
                        setSel(null);
                        game.bump(true);
                      }}
                    >
                      Destroy
                    </button>
                  </div>
                  <div style="font-size:0.8rem;color:var(--parch-dim)">Assign to hotbar:</div>
                  <div class="row">
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                      <button class="btn alt small" onClick={() => assignHotbar(i)}>
                        {i + 1}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div class="desc">Select an item. Sell planks and goods at the sell counter.</div>
              )}
            </div>
          </div>
        )}
        {tab === 'axes' && (
          <div class="grid">
            {st.axes.map((a) => {
              const def = AXE_BY_ID[a.def]!;
              const s = axeStats(a, { woodcutting: levelOf(st.skills.woodcutting) });
              const eq = st.equipped === a.uid;
              return (
                <div class={'card' + (eq ? ' owned' : '')} key={a.uid}>
                  <h4 class={'rar-' + def.rarity}>
                    🪓 {def.name} {a.up > 0 ? `+${a.up}` : ''}
                  </h4>
                  <div class="stats">
                    <span>Damage</span>
                    <b>{s.damage.toFixed(1)}</b>
                    <span>Speed</span>
                    <b>{s.speed.toFixed(2)}/s</b>
                    <span>Reach</span>
                    <b>{s.reach.toFixed(1)}</b>
                    <span>Tier</span>
                    <b>{def.tier}</b>
                  </div>
                  <div class="bar amber">
                    <i style={{ width: `${(a.dur / def.durability) * 100}%` }} />
                  </div>
                  <div class="desc">
                    {def.abilityDesc || def.desc}
                    {Object.entries(a.ench).length
                      ? ' · ' +
                        Object.entries(a.ench)
                          .map(([k, v]) => `${k} ${v}`)
                          .join(', ')
                      : ''}
                    {a.skin !== 'default' ? ` · skin ${SKINS.find((k) => k.id === a.skin)?.name}` : ''}
                  </div>
                  <div class="row">
                    <button
                      class="btn small"
                      disabled={eq}
                      onClick={() => {
                        sim.inventory.equipAxe(a.uid);
                        game.bump(true);
                      }}
                    >
                      {eq ? 'Equipped' : 'Equip'}
                    </button>
                    <button
                      class="btn alt small"
                      onClick={() => {
                        const free = st.inv.hotbar.indexOf(null);
                        if (free >= 0) {
                          st.inv.hotbar[free] = 'axe:' + a.uid;
                          game.bump(true);
                        }
                      }}
                    >
                      → Hotbar
                    </button>
                  </div>
                </div>
              );
            })}
            {!st.axes.length && <div class="desc">No axes yet — buy one from Gus at the Tool Shop.</div>}
          </div>
        )}
        {tab === 'gear' && (
          <div class="grid">
            {(Object.keys(SLOT_NAMES) as GearSlot[]).map((k) => {
              const g = st.gear[k];
              return (
                <div class="card" key={k}>
                  <h4>{SLOT_NAMES[k]}</h4>
                  {g ? (
                    <>
                      <div>
                        {iconOf(g)} {itemName(g)}
                      </div>
                      <div class="desc">{ITEM_BY_ID[g]?.desc}</div>
                      <button
                        class="btn alt small"
                        onClick={() => {
                          sim.shop.unequipGear(k);
                          game.bump(true);
                        }}
                      >
                        Unequip
                      </button>
                    </>
                  ) : (
                    <div class="desc">Empty. Buy gear from Rue; equip from your Items tab.</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {tab === 'skills' && (
          <div class="grid">
            {Object.entries(st.skills).map(([k, xp]) => {
              const lvl = levelOf(xp);
              const cur = 20 * lvl * lvl,
                nxt = 20 * (lvl + 1) * (lvl + 1);
              return (
                <div class="card" key={k}>
                  <h4>
                    {k[0]!.toUpperCase() + k.slice(1)} — Level {lvl}
                  </h4>
                  <div class="bar">
                    <i style={{ width: `${((xp - cur) / (nxt - cur)) * 100}%` }} />
                  </div>
                  <div class="desc">
                    {Math.floor(xp)} / {nxt} XP
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Panel>
  );
}

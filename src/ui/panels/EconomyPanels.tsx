import { useState } from 'preact/hooks';
import { game, useGame, money } from '../hooks';
import { Panel } from '../Panel';
import { WOODS, WOOD_BY_ID } from '../../data/woods';
import { FURNITURE_SHAPES } from '../../data/recipes';
import { ITEMS, ITEM_BY_ID } from '../../data/items';
import { itemName } from '../../systems/itemValue';
import { colorOf, iconOf, hex } from '../icons';
import { AXE_BY_ID, ENCHANTS, SKINS, AXE_MAX_UPGRADE } from '../../data/axes';
import { OUTPOSTS } from '../../world/landmarks';
import { ACHIEVEMENTS } from '../../data/achievements';
import { MAX_WORKER_LEVEL } from '../../systems/workers';
import { CONFIG } from '../../config';
import { RECIPES } from '../../data/recipes';

const trendIcon = (t: number) =>
  t > 0 ? <span class="up">▲</span> : t < 0 ? <span class="down">▼</span> : <span>–</span>;

function Spark({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const min = Math.min(...data),
    max = Math.max(...data);
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * 80},${18 - ((v - min) / Math.max(0.01, max - min)) * 16}`)
    .join(' ');
  return (
    <svg width="80" height="20">
      <polyline points={pts} fill="none" stroke="var(--amber)" stroke-width="2" />
    </svg>
  );
}

// ------------------------------------------------------------------ price board
export function MarketPanel() {
  useGame();
  const sim = game.sim!;
  const ev = sim.market.event;
  const rows = WOODS.filter((w) => w.weight > 0 && !w.guardianOnly);
  return (
    <Panel title="Lumber Exchange — Price Board" wide>
      <div class="body">
        {ev && (
          <div class="hud-chip" style="margin-bottom:8px">
            📣{' '}
            {ev.id === 'surge'
              ? `Demand surge on ${WOOD_BY_ID[ev.wood ?? '']?.name}`
              : ev.id === 'glut'
                ? `Glut on ${WOOD_BY_ID[ev.wood ?? '']?.name}`
                : ev.id === 'boom'
                  ? 'Construction boom'
                  : 'Economic slump'}{' '}
            (×{ev.mult})
          </div>
        )}
        {sim.events.current && (
          <div class="hud-chip" style="margin-bottom:8px">
            🎉 Event active: {sim.events.current.id.replace('_', ' ')}
          </div>
        )}
        <div class="row" style="margin-bottom:8px">
          <button class="btn" onClick={() => game.openPanel('exchange')}>
            Auctions & futures →
          </button>
          <span class="desc">Prices respond to what everyone sells. Spread your sales across woods!</span>
        </div>
        <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr))">
          {rows.map((w) => {
            const m = sim.market.woodMult(w.id);
            return (
              <div class="pricerow" key={w.id} style="align-items:center;gap:8px">
                <span style={`color:${hex(w.color)}`}>■</span>
                <span style="flex:1">{w.name}</span>
                <Spark data={sim.market.history(w.id)} />
                <b class={m >= 1 ? 'up' : 'down'}>{(m * 100).toFixed(0)}%</b>{' '}
                {trendIcon(sim.market.trend(w.id))}
                <span class="money" title="log value per unit">
                  {money(Math.round(w.baseValue * m * sim.market.bonus()))}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

export function ExchangePanel() {
  useGame();
  const sim = game.sim!;
  const st = game.state!;
  const [tab, setTab] = useState<'auction' | 'sell' | 'futures'>('auction');
  const [item, setItem] = useState('');
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(100);
  const [wood, setWood] = useState('oak');
  const [stake, setStake] = useState(1000);
  const [lev, setLev] = useState(2);
  const have = new Map<string, number>();
  for (const s of st.inv.slots) if (s) have.set(s.id, (have.get(s.id) ?? 0) + s.n);
  return (
    <Panel title="Auction House & Exchange" wide>
      <div class="tabs">
        {(['auction', 'sell', 'futures'] as const).map((t) => (
          <div class={'tab' + (tab === t ? ' on' : '')} onClick={() => setTab(t)}>
            {t === 'auction' ? 'Buy' : t === 'sell' ? 'List an item' : 'Futures'}
          </div>
        ))}
      </div>
      <div class="body">
        <div style="margin-bottom:8px">
          You have <span class="money">{money(st.money)}</span> · {CONFIG.market.tradeTax * 100}% tax on
          sales, {CONFIG.market.tradeTax * 100}% buyer fee, 1% listing fee.
        </div>
        {tab === 'auction' && (
          <div class="grid">
            {st.market.auctions
              .filter((a) => a.seller === 'npc')
              .map((a) => (
                <div class="card" key={a.id}>
                  <h4>
                    {iconOf(a.item)} {itemName(a.item)} ×{a.n}
                  </h4>
                  <div>
                    Ask <span class="money">{money(a.price)}</span>{' '}
                    <span class="desc">(fair {money(sim.market.itemPrice(a.item) * a.n)})</span>
                  </div>
                  <button
                    class="btn small"
                    disabled={st.money < a.price * 1.05}
                    onClick={() => {
                      sim.exchange.buy(a.id);
                      game.bump(true);
                    }}
                  >
                    Buy (+{Math.round(a.price * CONFIG.market.tradeTax)} fee)
                  </button>
                </div>
              ))}
          </div>
        )}
        {tab === 'sell' && (
          <div>
            <div class="row" style="margin-bottom:8px">
              <select
                class="txt"
                value={item}
                onChange={(e) => {
                  const v = (e.target as HTMLSelectElement).value;
                  setItem(v);
                  setPrice(Math.round(sim.market.itemPrice(v) * qty * 1.05));
                }}
              >
                <option value="">— pick an item —</option>
                {[...have.entries()].map(([id, n]) => (
                  <option value={id}>
                    {itemName(id)} (×{n})
                  </option>
                ))}
              </select>
              <input
                class="txt"
                type="number"
                min="1"
                style="width:80px"
                value={qty}
                onInput={(e) => setQty(Number((e.target as HTMLInputElement).value))}
              />
              <input
                class="txt"
                type="number"
                min="1"
                style="width:110px"
                value={price}
                onInput={(e) => setPrice(Number((e.target as HTMLInputElement).value))}
              />
              <button
                class="btn small"
                disabled={!item}
                onClick={() => {
                  sim.exchange.list(item, qty, price);
                  game.bump(true);
                }}
              >
                List for ${price.toLocaleString()}
              </button>
            </div>
            <div class="desc">
              Fair price: {item ? money(sim.market.itemPrice(item) * qty) : '—'}. Listings priced near fair
              value sell fastest.
            </div>
            <h4>Your listings</h4>
            {st.market.auctions
              .filter((a) => a.seller === 'player')
              .map((a) => (
                <div class="pricerow" key={a.id}>
                  <span>
                    {itemName(a.item)} ×{a.n} @ {money(a.price)}
                  </span>
                  <button
                    class="btn alt small"
                    onClick={() => {
                      sim.exchange.cancel(a.id);
                      game.bump(true);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ))}
          </div>
        )}
        {tab === 'futures' && (
          <div>
            <div class="desc" style="margin-bottom:8px">
              Bet on a wood's price multiplier moving up or down over 10 minutes. Leverage amplifies results
              but your payout is capped between $0 and 3× your stake — you can never lose more than the stake.
            </div>
            <div class="row" style="margin-bottom:8px">
              <select
                class="txt"
                value={wood}
                onChange={(e) => setWood((e.target as HTMLSelectElement).value)}
              >
                {WOODS.filter((w) => w.weight > 0 && !w.guardianOnly).map((w) => (
                  <option value={w.id}>
                    {w.name} ({(sim.market.woodMult(w.id) * 100).toFixed(0)}%)
                  </option>
                ))}
              </select>
              <input
                class="txt"
                type="number"
                style="width:100px"
                value={stake}
                onInput={(e) => setStake(Number((e.target as HTMLInputElement).value))}
              />
              <select
                class="txt"
                value={lev}
                onChange={(e) => setLev(Number((e.target as HTMLSelectElement).value))}
              >
                {[1, 2, 3].map((l) => (
                  <option value={l}>{l}× leverage</option>
                ))}
              </select>
              <button
                class="btn good small"
                onClick={() => {
                  sim.exchange.openFuture(wood, 1, stake, lev);
                  game.bump(true);
                }}
              >
                ▲ Long
              </button>
              <button
                class="btn bad small"
                onClick={() => {
                  sim.exchange.openFuture(wood, -1, stake, lev);
                  game.bump(true);
                }}
              >
                ▼ Short
              </button>
            </div>
            {st.market.futures.map((f) => (
              <div class="pricerow" key={f.id} style="align-items:center">
                <span>
                  {f.dir > 0 ? '▲' : '▼'} {WOOD_BY_ID[f.wood]!.name} ×{f.leverage} · stake {money(f.stake)} ·
                  now {money(sim.exchange.futureValue(f))}
                </span>
                <button
                  class="btn alt small"
                  onClick={() => {
                    sim.exchange.closeEarly(f.id);
                    game.bump(true);
                  }}
                >
                  Close
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------ crafting
export function CraftPanel() {
  useGame();
  const sim = game.sim!;
  const [tab, setTab] = useState<'furniture' | 'goods'>('furniture');
  const [wood, setWood] = useState('oak');
  const lvl = sim.crafting.level();
  const near = sim.crafting.stationNearby();
  const woods = WOODS.filter((w) => sim.inventory.count('plank_' + w.id) > 0);
  return (
    <Panel title="Crafting" wide>
      <div class="tabs">
        {(['furniture', 'goods'] as const).map((t) => (
          <div class={'tab' + (tab === t ? ' on' : '')} onClick={() => setTab(t)}>
            {t}
          </div>
        ))}
      </div>
      <div class="body">
        <div style="margin-bottom:8px">
          Crafting level <b>{lvl}</b> ·{' '}
          {near ? (
            <span class="up">at a bench ✔</span>
          ) : (
            <span class="down">Walk to a crafting bench (the hub bench near Gus, or one on your plot)</span>
          )}
        </div>
        {tab === 'furniture' && (
          <>
            <div class="row" style="margin-bottom:8px">
              <span>Wood:</span>
              <select
                class="txt"
                value={wood}
                onChange={(e) => setWood((e.target as HTMLSelectElement).value)}
              >
                {(woods.length ? woods : [WOODS[0]!]).map((w) => (
                  <option value={w.id}>
                    {w.name} ({sim.inventory.count('plank_' + w.id)} planks)
                  </option>
                ))}
              </select>
            </div>
            <div class="grid">
              {FURNITURE_SHAPES.map((sh) => {
                const id = `${sh.id}@${wood}`;
                const c = sim.crafting.canCraftFurniture(sh.id, wood);
                return (
                  <div class={'card' + (c.ok ? '' : ' locked')} key={sh.id}>
                    <h4>
                      {iconOf(id)} {sh.name}
                    </h4>
                    <div class="desc">
                      {sh.planks} {WOOD_BY_ID[wood]?.name} planks → worth{' '}
                      <span class="money">{money(sim.market.itemPrice(id))}</span> (planks alone:{' '}
                      {money(sim.market.itemPrice('plank_' + wood) * sh.planks)})
                    </div>
                    <button
                      class="btn small"
                      disabled={!c.ok || !near}
                      onClick={() => {
                        sim.crafting.craftFurniture(sh.id, wood);
                        game.bump(true);
                      }}
                    >
                      {c.ok ? 'Craft' : `Needs ${c.why}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {tab === 'goods' && (
          <div class="grid">
            {RECIPES.map((r) => (
              <div class={'card' + (lvl >= r.minCraftLevel ? '' : ' locked')} key={r.id}>
                <h4>
                  {iconOf(r.output)} {r.name} ×{r.count}
                </h4>
                <div class="desc">
                  {Object.entries(r.inputs)
                    .map(([k, n]) => `${n}× ${k === 'plank:*' ? 'any planks' : itemName(k)}`)
                    .join(', ')}
                  {r.station === 'forge' ? ' · needs the Forge' : ''}
                </div>
                <button
                  class="btn small"
                  disabled={lvl < r.minCraftLevel}
                  onClick={() => {
                    sim.crafting.craft(r.id);
                    game.bump(true);
                  }}
                >
                  {lvl < r.minCraftLevel ? `Level ${r.minCraftLevel}` : 'Craft'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------ smith
export function SmithPanel() {
  useGame();
  const sim = game.sim!;
  const st = game.state!;
  const [tab, setTab] = useState<'upgrade' | 'enchant' | 'skin' | 'repair' | 'forge' | 'utility'>('upgrade');
  const [uid, setUid] = useState(st.equipped ?? st.axes[0]?.uid ?? '');
  const [forgeSel, setForgeSel] = useState<string[]>([]);
  const [plank, setPlank] = useState('');
  const axe = st.axes.find((a) => a.uid === uid);
  const def = axe ? AXE_BY_ID[axe.def]! : null;
  const ore = axe ? sim.shop.upgradeOre(axe) : null;
  return (
    <Panel title="Brokk's Smithy" wide>
      <div class="tabs">
        {(['upgrade', 'enchant', 'skin', 'repair', 'forge', 'utility'] as const).map((t) => (
          <div class={'tab' + (tab === t ? ' on' : '')} onClick={() => setTab(t)}>
            {t}
          </div>
        ))}
      </div>
      <div class="body">
        <div class="row" style="margin-bottom:10px">
          <span>
            Money <span class="money">{money(st.money)}</span>
          </span>
          {tab !== 'forge' && tab !== 'utility' && (
            <select class="txt" value={uid} onChange={(e) => setUid((e.target as HTMLSelectElement).value)}>
              {st.axes.map((a) => (
                <option value={a.uid}>
                  {AXE_BY_ID[a.def]!.name} +{a.up}
                </option>
              ))}
            </select>
          )}
        </div>
        {tab === 'upgrade' && axe && def && ore && (
          <div class="card">
            <h4>
              {def.name} +{axe.up} → +{Math.min(AXE_MAX_UPGRADE, axe.up + 1)}
            </h4>
            <div class="desc">
              Each level adds +12% damage. Costs {money(sim.shop.upgradeCostOf(axe.uid))} and {ore.n}×{' '}
              {itemName(ore.id)} (you have {sim.inventory.count(ore.id)}).
            </div>
            <button
              class="btn"
              disabled={axe.up >= AXE_MAX_UPGRADE}
              onClick={() => {
                sim.shop.upgradeAxe(axe.uid);
                game.bump(true);
              }}
            >
              {axe.up >= AXE_MAX_UPGRADE ? 'Maxed' : 'Upgrade'}
            </button>
          </div>
        )}
        {tab === 'enchant' && axe && (
          <div class="grid">
            {ENCHANTS.map((e) => {
              const l = axe.ench[e.id] ?? 0;
              return (
                <div class="card" key={e.id}>
                  <h4>
                    ✨ {e.name} {l}/{e.max}
                  </h4>
                  <div class="desc">
                    {e.desc}. Cost {money(e.cost * (l + 1))} + {3 + l * 2}× {itemName(e.ore)}
                  </div>
                  <button
                    class="btn small"
                    disabled={l >= e.max}
                    onClick={() => {
                      sim.shop.enchantAxe(axe.uid, e.id);
                      game.bump(true);
                    }}
                  >
                    {l >= e.max ? 'Max' : 'Enchant'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {tab === 'skin' && axe && (
          <div class="row">
            {SKINS.map((s) => {
              const owned = s.price === 0 || st.cosmetics.includes('skin:' + s.id);
              return (
                <button
                  class={'btn small' + (axe.skin === s.id ? '' : ' alt')}
                  style={s.tint ? `border-bottom-color:${hex(s.tint)}` : ''}
                  onClick={() => {
                    sim.shop.skinAxe(axe.uid, s.id);
                    game.bump(true);
                  }}
                >
                  {s.name} {owned ? '' : money(s.price)}
                </button>
              );
            })}
          </div>
        )}
        {tab === 'repair' && (
          <div class="grid">
            {st.axes.map((a) => {
              const d = AXE_BY_ID[a.def]!;
              const cost = sim.shop.repairCost(a.uid);
              return (
                <div class="card" key={a.uid}>
                  <h4>{d.name}</h4>
                  <div class="bar amber">
                    <i style={{ width: `${(a.dur / d.durability) * 100}%` }} />
                  </div>
                  <button
                    class="btn small"
                    disabled={cost <= 0}
                    onClick={() => {
                      sim.shop.repairAxe(a.uid);
                      game.bump(true);
                    }}
                  >
                    {cost > 0 ? `Repair ${money(cost)}` : 'Perfect'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {tab === 'forge' && (
          <div>
            <div class="desc" style="margin-bottom:8px">
              Combine three axes of the same tier + 5 planks of any uncommon-or-better wood into a random axe
              one tier higher. Costs ${(2000).toLocaleString()} × tier².
            </div>
            <div class="row" style="margin-bottom:8px">
              {st.axes.map((a) => (
                <button
                  class={'btn small' + (forgeSel.includes(a.uid) ? '' : ' alt')}
                  onClick={() =>
                    setForgeSel((s) =>
                      s.includes(a.uid) ? s.filter((x) => x !== a.uid) : s.length < 3 ? [...s, a.uid] : s,
                    )
                  }
                >
                  {AXE_BY_ID[a.def]!.name} (T{AXE_BY_ID[a.def]!.tier})
                </button>
              ))}
            </div>
            <div class="row">
              <span>Planks:</span>
              <select
                class="txt"
                value={plank}
                onChange={(e) => setPlank((e.target as HTMLSelectElement).value)}
              >
                <option value="">— choose —</option>
                {WOODS.filter((w) => w.rarity !== 'common' && sim.inventory.count('plank_' + w.id) >= 5).map(
                  (w) => (
                    <option value={'plank_' + w.id}>
                      {w.name} (×{sim.inventory.count('plank_' + w.id)})
                    </option>
                  ),
                )}
              </select>
              <button
                class="btn good"
                disabled={forgeSel.length !== 3 || !plank}
                onClick={() => {
                  if (sim.shop.forge(forgeSel, plank)) setForgeSel([]);
                  game.bump(true);
                }}
              >
                Forge!
              </button>
            </div>
          </div>
        )}
        {tab === 'utility' && (
          <div class="grid">
            {sim.shop.axeStock('smith').map((e) => (
              <div class={'card' + (e.owned ? ' owned' : '')} key={e.id}>
                <h4>{AXE_BY_ID[e.id]!.name}</h4>
                <div class="desc">
                  {AXE_BY_ID[e.id]!.abilityDesc} {AXE_BY_ID[e.id]!.desc}
                </div>
                <button
                  class="btn small"
                  disabled={e.owned || st.money < e.price || !!e.locked}
                  onClick={() => {
                    sim.shop.buyAxe(e.id);
                    game.bump(true);
                  }}
                >
                  {e.owned ? 'Owned' : (e.locked ?? `Buy ${money(e.price)}`)}
                </button>
              </div>
            ))}
          </div>
        )}
        {!st.axes.length && <div class="desc">You have no axes. Buy one from Gus first.</div>}
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------ workers
export function WorkersPanel() {
  useGame();
  const sim = game.sim!;
  const st = game.state!;
  const [wood, setWood] = useState('oak');
  return (
    <Panel title="Lumberjack Crew" wide>
      <div class="body">
        <div style="margin-bottom:8px">
          Hire loggers who work while you play (and, at reduced efficiency, while you're away). Wages come out
          of your wallet when you collect. Crew {st.workers.length}/{sim.workers.maxWorkers()} · hire cost{' '}
          <span class="money">{money(sim.workers.hireCost())}</span>
        </div>
        <div class="row" style="margin-bottom:10px">
          <select class="txt" value={wood} onChange={(e) => setWood((e.target as HTMLSelectElement).value)}>
            {st.discoveredSpecies.map((w) => (
              <option value={w}>{WOOD_BY_ID[w]?.name}</option>
            ))}
          </select>
          <button
            class="btn good"
            onClick={() => {
              sim.workers.hire(wood);
              game.bump(true);
            }}
          >
            Hire a logger
          </button>
        </div>
        <div class="grid">
          {st.workers.map((w) => (
            <div class="card" key={w.id}>
              <h4>
                🪓 {w.name} — Lv {w.level}
              </h4>
              <div class="stats">
                <span>Wood</span>
                <b>{WOOD_BY_ID[w.wood]?.name}</b>
                <span>Output</span>
                <b>{sim.workers.unitsPerHour(w).toFixed(0)} units/h</b>
                <span>Wage</span>
                <b>{money(sim.workers.wagePerHour(w))}/h</b>
                <span>Value</span>
                <b>{money(Math.round(sim.workers.incomePerHour(w)))}/h</b>
              </div>
              <div>
                Stock: <b>{Math.floor(w.stock)}</b> planks · owed {money(Math.floor(w.owed))}
              </div>
              <div class="row">
                <button
                  class="btn small good"
                  disabled={w.stock < 1}
                  onClick={() => {
                    sim.workers.collect(w.id);
                    game.bump(true);
                  }}
                >
                  Collect
                </button>
                <button
                  class="btn small"
                  disabled={w.level >= MAX_WORKER_LEVEL}
                  onClick={() => {
                    sim.workers.upgrade(w.id);
                    game.bump(true);
                  }}
                >
                  Train {money(sim.workers.upgradeCost(w))}
                </button>
                <select
                  class="txt"
                  value={w.wood}
                  onChange={(e) => {
                    sim.workers.setWood(w.id, (e.target as HTMLSelectElement).value);
                    game.bump(true);
                  }}
                >
                  {st.discoveredSpecies.map((x) => (
                    <option value={x}>{WOOD_BY_ID[x]?.name}</option>
                  ))}
                </select>
                <button
                  class="btn small bad"
                  onClick={() => {
                    sim.workers.fire(w.id);
                    game.bump(true);
                  }}
                >
                  Fire
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------ outposts
export function OutpostPanel({ id }: { id: string }) {
  useGame();
  const sim = game.sim!;
  const o = OUTPOSTS.find((x) => x.id === id);
  if (!o) return null;
  const st = game.state!.world.outposts[o.id];
  return (
    <Panel title={o.name}>
      <div class="body">
        {!st ? (
          <>
            <div class="desc">
              Buy this outpost to earn passive income — even offline (capped at {CONFIG.idle.offlineCapHours}
              h, {CONFIG.idle.offlineEfficiency * 100}% efficiency while away).
            </div>
            <div style="margin:8px 0">
              Earns about <span class="money">{money(o.income)}</span>/hour.
            </div>
            <button
              class="btn good"
              disabled={game.state!.money < o.cost}
              onClick={() => {
                sim.world.buyOutpost(o.id);
                game.bump(true);
              }}
            >
              Buy {money(o.cost)}
            </button>
          </>
        ) : (
          <>
            <div>
              Level {st.level}/5 · <span class="money">{money(Math.round(sim.world.outpostRate(o.id)))}</span>
              /hour
            </div>
            <div style="margin:8px 0">
              Ready to collect: <span class="money">{money(sim.world.outpostPending(o.id))}</span>
            </div>
            <div class="row">
              <button
                class="btn good"
                onClick={() => {
                  sim.world.collectOutpost(o.id);
                  game.bump(true);
                }}
              >
                Collect
              </button>
              <button
                class="btn"
                disabled={st.level >= 5 || game.state!.money < o.cost * 0.6 * st.level}
                onClick={() => {
                  sim.world.upgradeOutpost(o.id);
                  game.bump(true);
                }}
              >
                {st.level >= 5 ? 'Max level' : `Upgrade ${money(Math.round(o.cost * 0.6 * st.level))}`}
              </button>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------ plot business (sawmill/stand/workshop)
export function PartPanel({ id }: { id: string }) {
  useGame();
  const sim = game.sim!;
  const b = sim.building.built.get(Number(id));
  const [recipe, setRecipe] = useState('');
  if (!b) return null;
  const d = sim.building.def(b);
  const bs = sim.businesses.state(b);
  const out = Object.entries(bs.out ?? {}).filter(([, n]) => n > 0);
  const input = Object.entries(bs.input ?? {}).filter(([, n]) => n > 0);
  const inv = new Map<string, number>();
  for (const s of game.state!.inv.slots) if (s) inv.set(s.id, (inv.get(s.id) ?? 0) + s.n);
  return (
    <Panel title={d.name} wide>
      <div class="body">
        <div class="row" style="margin-bottom:8px">
          <span>
            Level <b>{bs.level}</b>/5
          </span>
          <button
            class="btn small"
            disabled={bs.level >= 5}
            onClick={() => {
              sim.businesses.upgrade(b);
              game.bump(true);
            }}
          >
            {bs.level >= 5 ? 'Max' : `Upgrade ${money(sim.businesses.upgradeCost(b))}`}
          </button>
          {d.interactive === 'sawmill' && (
            <span class="desc">
              Speed ×{sim.businesses.speed(bs.level).toFixed(2)} · {sim.businesses.lanes(bs.level)} saw
              lane(s) · yield ×{sim.businesses.yield(bs.level).toFixed(2)}
              {bs.level >= 2 ? ' · auto-feed conveyor' : ''}
              {bs.level >= 5 ? ' · auto-sell' : ''}
            </span>
          )}
        </div>
        {d.interactive === 'sawmill' && (
          <div class="desc" style="margin-bottom:8px">
            Drop logs on the intake bed (left side). Level 2 pulls in nearby logs automatically; level 5 sells
            planks for you.
          </div>
        )}
        <h4>Output bin</h4>
        <div class="row" style="margin-bottom:8px">
          {out.map(([k, n]) => (
            <span class="hud-chip">
              {iconOf(k.includes('@') ? k : 'plank_' + k)} {itemName(k.includes('@') ? k : 'plank_' + k)} ×{n}
            </span>
          ))}
          {!out.length && <span class="desc">Empty</span>}
        </div>
        <button
          class="btn good small"
          disabled={!out.length}
          onClick={() => {
            sim.businesses.collect(b);
            game.bump(true);
          }}
        >
          Collect all
        </button>
        {(d.interactive === 'sellstand' ||
          d.id === 'workshop' ||
          d.id === 'factory' ||
          d.id === 'firewood_stall') && (
          <>
            <h4>Stock</h4>
            <div class="row">
              {input.map(([k, n]) => (
                <span
                  class="hud-chip clickable"
                  onClick={() => {
                    sim.businesses.withdraw(b, k);
                    game.bump(true);
                  }}
                  title="click to withdraw"
                >
                  {itemName(k)} ×{n}
                </span>
              ))}
              {!input.length && <span class="desc">Nothing stocked</span>}
            </div>
            <div class="row" style="margin-top:6px">
              <span>Deposit:</span>
              {[...inv.entries()]
                .filter(([k]) => k.startsWith('plank_') || k.includes('@'))
                .slice(0, 12)
                .map(([k, n]) => (
                  <button
                    class="btn alt small"
                    onClick={() => {
                      sim.businesses.deposit(b, k, n);
                      game.bump(true);
                    }}
                  >
                    {itemName(k)} ×{n}
                  </button>
                ))}
            </div>
            {d.interactive !== 'sellstand' && (
              <div class="row" style="margin-top:8px">
                <span>Make:</span>
                <select
                  class="txt"
                  value={recipe || bs.recipe || ''}
                  onChange={(e) => {
                    const v = (e.target as HTMLSelectElement).value;
                    setRecipe(v);
                    sim.businesses.setRecipe(b, v);
                  }}
                >
                  <option value="">— choose —</option>
                  {FURNITURE_SHAPES.filter(
                    (s) => d.id !== 'firewood_stall' || s.id === 'firewood_bundle',
                  ).flatMap((s) =>
                    WOODS.filter((w) => (bs.input?.['plank_' + w.id] ?? 0) > 0).map((w) => (
                      <option value={`${s.id}@${w.id}`}>
                        {s.name} ({w.name})
                      </option>
                    )),
                  )}
                </select>
                <span class="desc">Currently: {sim.businesses.describeRecipe(bs.recipe)}</span>
              </div>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------ achievements & prestige
export function AchievementsPanel() {
  useGame();
  const sim = game.sim!;
  const st = game.state!;
  const p = sim.prestige;
  return (
    <Panel title="Achievements & Prestige" wide>
      <div class="body">
        <div class="card" style="margin-bottom:10px">
          <h4>⭐ Prestige {st.prestige.level}</h4>
          <div class="desc">
            Reset your money, axes, vehicles and inventory (keeping plots, buildings, cosmetics, pets and half
            your skills) for permanent bonuses: +{CONFIG.prestige.multPerLevel * 100}% sell value, +5% XP and
            +10% axe damage per level. Requires ${p.requirement().toLocaleString()} total earned.
          </div>
          <div class="bar amber">
            <i style={{ width: `${p.progress() * 100}%` }} />
          </div>
          <button
            class="btn bad small"
            disabled={!p.canPrestige()}
            onClick={() => {
              if (confirm('Prestige now? You will lose money, axes, vehicles and items.')) {
                p.doPrestige();
                game.bump(true);
              }
            }}
          >
            Prestige
          </button>
        </div>
        <div class="grid">
          {ACHIEVEMENTS.map((a) => {
            const done = st.achievements.includes(a.id);
            const prog = Math.min(a.target ?? 1, sim.achievements.progress(a));
            return (
              <div class={'card' + (done ? ' owned' : '')} key={a.id}>
                <h4>
                  {done ? '🏆' : '🔒'} {a.name}
                </h4>
                <div class="desc">{a.desc}</div>
                <div class="bar">
                  <i style={{ width: `${(prog / (a.target ?? 1)) * 100}%` }} />
                </div>
                <div style="font-size:0.75rem">
                  {Math.floor(prog).toLocaleString()} / {(a.target ?? 1).toLocaleString()}
                  {a.reward.money ? ` · +${money(a.reward.money)}` : ''}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------ traveler (rotating rare stock) & seasonal exchange
export function TravelerPanel() {
  useGame();
  const sim = game.sim!;
  const st = game.state!;
  const day = Math.floor(st.time);
  const stock = ITEMS.filter(
    (i) => ['crate', 'key', 'pet', 'map'].includes(i.category) || i.id === 'strength_tonic',
  );
  const offer = stock.filter((_, i) => (i + day) % 3 !== 0);
  const price = (id: string) =>
    ({
      crate_common: 1500,
      crate_rare: 12000,
      crate_mythic: 250000,
      key_common: 600,
      key_rare: 5000,
      treasure_map: 300,
      strength_tonic: 900,
      pet_fox: 90000,
      pet_owl: 160000,
      pet_beaver: 220000,
      pet_ox: 300000,
      pet_sprite: 600000,
    })[id] ?? 1000;
  const season = sim.nodes.seasonalItem();
  const sAxe =
    season === 'autumn'
      ? 'pumpkin_axe'
      : season === 'winter'
        ? 'candy_cane_axe'
        : season === 'spring'
          ? 'egg_axe'
          : null;
  return (
    <Panel title="The Wanderer — Strange Wares" wide>
      <div class="body">
        <div style="margin-bottom:8px">
          Stock changes every day. Crates need matching keys and only contain cosmetics (and a tiny chance at
          the Prismatic Axe). <span class="money">{money(st.money)}</span>
        </div>
        <div class="grid">
          {offer.map((i) => (
            <div class="card" key={i.id}>
              <h4>
                {iconOf(i.id)} {i.name}
              </h4>
              <div class="desc">{i.desc}</div>
              <button
                class="btn small"
                disabled={st.money < price(i.id)}
                onClick={() => {
                  if (sim.econ.spend(price(i.id), 'traveler')) sim.inventory.add(i.id, 1);
                  game.bump(true);
                }}
              >
                Buy {money(price(i.id))}
              </button>
            </div>
          ))}
          {sAxe && (
            <div class="card">
              <h4>🎃 Seasonal exchange</h4>
              <div class="desc">
                Trade 10× {itemName(sim.nodes.seasonalItem()!)} for the {AXE_BY_ID[sAxe]!.name}. Collectibles
                appear near the hub each {season}.
              </div>
              <button
                class="btn small good"
                disabled={!sim.inventory.has(sim.nodes.seasonalItem()!, 10) || sim.shop.ownsAxe(sAxe)}
                onClick={() => {
                  sim.inventory.remove(sim.nodes.seasonalItem()!, 10);
                  sim.inventory.giveAxe(sAxe);
                  game.bump(true);
                }}
              >
                {sim.shop.ownsAxe(sAxe) ? 'Owned' : 'Trade'}
              </button>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

export function TrainPanel() {
  useGame();
  return (
    <Panel title="Hub Station — Railway" wide>
      <div class="body">
        <div class="desc" style="margin-bottom:8px">
          The Great Northern Railway runs from the Hub toward Frostpeak Taiga. Buy a locomotive and rail cars
          here, park at the station, hitch cars with [R] and ride the rails (dashed line on the map).
        </div>
        <TrainDealer />
      </div>
    </Panel>
  );
}
import { DealerGrid } from './GaragePanel';
function TrainDealer() {
  return <DealerGrid kinds={['rail']} />;
}
void ITEM_BY_ID;
void colorOf;

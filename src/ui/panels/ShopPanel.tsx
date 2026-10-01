import { useState } from 'preact/hooks';
import { game, useGame, money } from '../hooks';
import { Panel } from '../Panel';
import { AXE_BY_ID } from '../../data/axes';
import { ITEM_BY_ID } from '../../data/items';
import { GEAR_ITEMS, TOOL_ITEMS } from '../../systems/shop';
import { iconOf } from '../icons';

export function AxeCard({
  id,
  locked,
  owned,
  price,
  onBuy,
}: {
  id: string;
  locked?: string;
  owned?: boolean;
  price: number;
  onBuy: () => void;
}) {
  const a = AXE_BY_ID[id]!;
  const sim = game.sim!;
  const can = sim.state.money >= price && !locked && !owned;
  return (
    <div class={'card' + (owned ? ' owned' : locked ? ' locked' : '')} data-testid={'axe-' + id}>
      <h4 class={'rar-' + a.rarity}>🪓 {a.name}</h4>
      <div class="stats">
        <span>Tier</span>
        <b>{a.tier}</b>
        <span>Damage</span>
        <b>{a.damage}</b>
        <span>Speed</span>
        <b>{a.speed.toFixed(1)}/s</b>
        <span>Reach</span>
        <b>{a.reach}</b>
        <span>Durability</span>
        <b>{a.durability}</b>
      </div>
      <div class="desc">
        {a.abilityDesc ? a.abilityDesc + ' ' : ''}
        {a.desc}
        {Object.keys(a.mult).length
          ? ` Bonus vs ${Object.entries(a.mult)
              .map(([k, v]) => `${k} ×${v}`)
              .join(', ')}.`
          : ''}
      </div>
      {locked && <div style="color:var(--bad);font-size:0.8rem">{locked}</div>}
      <button class="btn small" disabled={!can} onClick={onBuy}>
        {owned ? 'Owned' : price > 0 ? `Buy ${money(price)}` : 'Not for sale'}
      </button>
    </div>
  );
}

export function ItemCard({
  id,
  price,
  onBuy,
  label,
}: {
  id: string;
  price: number;
  onBuy: () => void;
  label?: string;
}) {
  const d = ITEM_BY_ID[id]!;
  const sim = game.sim!;
  const owned = d.gearSlot && (sim.state.gear[d.gearSlot] === id || sim.inventory.count(id) > 0);
  return (
    <div class={'card' + (owned ? ' owned' : '')}>
      <h4>
        {iconOf(id)} {d.name}
      </h4>
      <div class="desc">{d.desc}</div>
      <button class="btn small" disabled={sim.state.money < price || !!owned} onClick={onBuy}>
        {owned ? 'Owned' : (label ?? `Buy ${money(price)}`)}
      </button>
    </div>
  );
}

export function ToolShop() {
  useGame();
  const sim = game.sim!;
  const [tab, setTab] = useState('axes');
  const stock = sim.shop.axeStock('shop');
  return (
    <Panel title="Gus & Sons — Tools" wide>
      <div class="tabs">
        {['axes', 'supplies'].map((t) => (
          <div class={'tab' + (tab === t ? ' on' : '')} onClick={() => setTab(t)}>
            {t}
          </div>
        ))}
      </div>
      <div class="body">
        <div style="margin-bottom:8px">
          You have <span class="money">{money(sim.state.money)}</span>
        </div>
        <div class="grid">
          {tab === 'axes' &&
            stock.map((e) => (
              <AxeCard
                key={e.id}
                id={e.id}
                price={e.price}
                owned={e.owned}
                locked={e.locked}
                onBuy={() => {
                  sim.shop.buyAxe(e.id);
                  game.bump(true);
                }}
              />
            ))}
          {tab === 'supplies' &&
            TOOL_ITEMS.map((id) => (
              <ItemCard
                key={id}
                id={id}
                price={ITEM_BY_ID[id]!.value}
                onBuy={() => {
                  sim.shop.buyItem(id, 1);
                  game.bump(true);
                }}
              />
            ))}
        </div>
      </div>
    </Panel>
  );
}

export function GearShop() {
  useGame();
  const sim = game.sim!;
  return (
    <Panel title="Rue's Outfitters — Gear" wide>
      <div class="body">
        <div style="margin-bottom:8px">
          You have <span class="money">{money(sim.state.money)}</span>
        </div>
        <div class="grid">
          {GEAR_ITEMS.map((id) => (
            <ItemCard
              key={id}
              id={id}
              price={ITEM_BY_ID[id]!.value}
              onBuy={() => {
                sim.shop.buyItem(id, 1);
                game.bump(true);
              }}
            />
          ))}
        </div>
      </div>
    </Panel>
  );
}

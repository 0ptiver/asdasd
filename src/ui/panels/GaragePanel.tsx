import { useState } from 'preact/hooks';
import { game, useGame, money } from '../hooks';
import { Panel } from '../Panel';
import { VEHICLES, VEHICLE_BY_ID, VEHICLE_UPGRADES, PAINTS, DECALS } from '../../data/vehicles';
import { hex } from '../icons';
import type { OwnedVehicle } from '../../save/schema';

const KIND_ICON: Record<string, string> = { ground: '🚚', water: '⛵', air: '✈️', rail: '🚂', special: '🛸' };
const LOCKED_PAINT = new Set([2, 4, 5, 8, 9]);
const paintOwned = (i: number) => !LOCKED_PAINT.has(i) || game.state!.cosmetics.includes('paint:' + i);
const decalOwned = (d: string) => d === 'none' || game.state!.cosmetics.includes('decal:' + d);

export function DealerGrid({ kinds, filter }: { kinds: string[]; filter?: (id: string) => boolean }) {
  const sim = game.sim!;
  const st = game.state!;
  const list = VEHICLES.filter(
    (v) => kinds.includes(v.kind) && v.price > 0 && (!filter || filter(v.id)),
  ).sort((a, b) => a.price - b.price);
  return (
    <div class="grid">
      {list.map((v) => {
        const owned = st.vehicles.some((o) => o.def === v.id);
        return (
          <div class={'card' + (owned ? ' owned' : '')} key={v.id} data-testid={'veh-' + v.id}>
            <h4>
              {KIND_ICON[v.kind]} {v.name}
            </h4>
            <div class="stats">
              <span>Top speed</span>
              <b>{Math.round(v.maxSpeed * 3.6)} km/h</b>
              <span>Capacity</span>
              <b>{v.capacity} kg</b>
              <span>Fuel</span>
              <b>{v.fuelCap}</b>
              <span>Seats</span>
              <b>{v.seats}</b>
            </div>
            <div class="desc">
              {v.desc}
              {v.trailerHitch ? ' Can tow.' : ''}
            </div>
            <button
              class="btn small"
              disabled={st.money < v.price}
              onClick={() => {
                sim.vehicles.buy(v.id);
                game.bump(true);
              }}
            >
              Buy {money(v.price)}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Owned({ o }: { o: OwnedVehicle }) {
  const sim = game.sim!;
  const d = VEHICLE_BY_ID[o.def]!;
  const [open, setOpen] = useState(false);
  const live = sim.vehicles.live.get(o.uid);
  const st = live ? sim.vehicles.stats(live) : null;
  return (
    <div class="card">
      <h4>
        {KIND_ICON[d.kind]} {d.name}
      </h4>
      <div class="bar amber" title="Fuel">
        <i style={{ width: `${(o.fuel / (st?.fuelCap ?? d.fuelCap)) * 100}%` }} />
      </div>
      <div class="bar red" title="Condition">
        <i style={{ width: `${o.hp}%` }} />
      </div>
      <div class="row">
        <button
          class="btn small"
          onClick={() => {
            game.closePanel();
            if (live) sim.vehicles.recall(live);
          }}
        >
          Recall
        </button>
        <button class="btn alt small" onClick={() => setOpen(!open)}>
          {open ? 'Hide' : 'Customize'}
        </button>
        <button
          class="btn bad small"
          onClick={() => {
            if (confirm(`Sell ${d.name} for ${money(Math.round(d.price * 0.5))}?`)) {
              sim.vehicles.sell(o.uid);
              game.bump(true);
            }
          }}
        >
          Sell
        </button>
      </div>
      {open && (
        <>
          <div class="row">
            {PAINTS.map((c, i) => (
              <span
                class="clickable"
                title={paintOwned(i) ? hex(c) : 'Unlock from a crate'}
                onClick={() => {
                  if (paintOwned(i)) {
                    o.paint = c;
                    game.bump(true);
                  }
                }}
                style={`width:22px;height:22px;border-radius:50%;border:2px solid ${o.paint === c ? '#fff' : '#000'};background:${hex(c)};cursor:pointer;opacity:${paintOwned(i) ? 1 : 0.3}`}
              />
            ))}
          </div>
          <div class="row">
            {DECALS.map((dc) => (
              <button
                class={'btn small' + (o.decal === dc ? '' : ' alt')}
                disabled={!decalOwned(dc)}
                onClick={() => {
                  o.decal = dc;
                  game.bump(true);
                }}
              >
                {dc}
              </button>
            ))}
          </div>
          {VEHICLE_UPGRADES.map((u) => (
            <div class="row" style="justify-content:space-between;font-size:0.8rem" key={u.id}>
              <span title={u.effect}>
                {u.name} {o.upg[u.id] ?? 0}/{u.max}
              </span>
              <button
                class="btn small"
                disabled={
                  (o.upg[u.id] ?? 0) >= u.max || game.state!.money < sim.vehicles.upgradeCost(o, u.id)
                }
                onClick={() => {
                  sim.vehicles.upgrade(o, u.id);
                  game.bump(true);
                }}
              >
                {(o.upg[u.id] ?? 0) >= u.max ? 'MAX' : money(sim.vehicles.upgradeCost(o, u.id))}
              </button>
            </div>
          ))}
          <button
            class="btn small"
            disabled={o.hp >= 100}
            onClick={() => {
              sim.vehicles.repair(o);
              game.bump(true);
            }}
          >
            Repair {money(sim.vehicles.repairCost(o))}
          </button>
        </>
      )}
    </div>
  );
}

export function GaragePanel() {
  useGame();
  const st = game.state!;
  const [tab, setTab] = useState<'mine' | 'dealer'>(st.vehicles.length ? 'mine' : 'dealer');
  return (
    <Panel title="Garage & Mechanic" wide>
      <div class="tabs">
        <div class={'tab' + (tab === 'mine' ? ' on' : '')} onClick={() => setTab('mine')}>
          My vehicles ({st.vehicles.length})
        </div>
        <div class={'tab' + (tab === 'dealer' ? ' on' : '')} onClick={() => setTab('dealer')}>
          Dealer
        </div>
      </div>
      <div class="body">
        <div style="margin-bottom:8px">
          You have <span class="money">{money(st.money)}</span> · Boats at the Harbor, aircraft at the
          Airfield, trains at the Station.
        </div>
        {tab === 'mine' ? (
          <div class="grid">
            {st.vehicles.map((o) => (
              <Owned key={o.uid} o={o} />
            ))}
            {!st.vehicles.length && <div class="desc">No vehicles yet. Visit the dealer tab.</div>}
          </div>
        ) : (
          <DealerGrid kinds={['ground', 'special']} />
        )}
      </div>
    </Panel>
  );
}

export function HarborPanel() {
  useGame();
  return (
    <Panel title="Harbor Master — Boats" wide>
      <div class="body">
        <DealerGrid kinds={['water']} />
      </div>
    </Panel>
  );
}
export function AirfieldPanel() {
  useGame();
  return (
    <Panel title="Airfield — Aircraft" wide>
      <div class="body">
        <DealerGrid kinds={['air']} />
      </div>
    </Panel>
  );
}
export function GasPanel() {
  useGame();
  const sim = game.sim!;
  const st = game.state!;
  return (
    <Panel title="Fuel & Repairs">
      <div class="body">
        <div style="margin-bottom:8px">
          You have <span class="money">{money(st.money)}</span> · fuel $0.80 per unit
        </div>
        <div class="row" style="margin-bottom:10px">
          <button
            class="btn small"
            onClick={() => {
              const need = Math.ceil(100 - st.player.fuel);
              if (need > 0 && sim.econ.spend(need, 'fuel')) st.player.fuel = 100;
              game.bump(true);
            }}
          >
            Refill chainsaw / jetpack fuel
          </button>
        </div>
        {st.vehicles.map((o) => {
          const d = VEHICLE_BY_ID[o.def]!;
          const live = sim.vehicles.live.get(o.uid);
          const cap = live ? sim.vehicles.stats(live).fuelCap : d.fuelCap;
          return (
            <div class="pricerow" key={o.uid} style="align-items:center">
              <span>
                {d.name} — fuel {Math.round(o.fuel)}/{Math.round(cap)} · cond {Math.round(o.hp)}%
              </span>
              <span class="row">
                <button
                  class="btn small"
                  disabled={d.fuelUse <= 0 || o.fuel >= cap - 0.5}
                  onClick={() => {
                    sim.vehicles.refuel(o);
                    game.bump(true);
                  }}
                >
                  Refuel
                </button>
                <button
                  class="btn small alt"
                  disabled={o.hp >= 100}
                  onClick={() => {
                    sim.vehicles.repair(o);
                    game.bump(true);
                  }}
                >
                  Repair {money(sim.vehicles.repairCost(o))}
                </button>
              </span>
            </div>
          );
        })}
        {!st.vehicles.length && <div class="desc">You have no vehicles.</div>}
      </div>
    </Panel>
  );
}

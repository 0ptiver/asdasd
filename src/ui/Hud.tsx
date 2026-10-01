import { game, useGame, money } from './hooks';
import { formatClock, isNight } from '../core/gameTime';
import { useEffect, useRef, useState } from 'preact/hooks';
import { CONFIG } from '../config';
import { AXE_BY_ID } from '../data/axes';
import { ITEM_BY_ID } from '../data/items';
import { WOOD_BY_ID } from '../data/woods';
import { iconOf } from './icons';
import { itemName } from '../systems/itemValue';
import { Minimap } from './Minimap';

interface Toast {
  id: number;
  text: string;
  kind: string;
}
let toastId = 0;

export function Toasts() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => {
    return game.bus.on('notify', (n) => {
      const t = { id: ++toastId, text: n.text, kind: n.kind ?? 'info' };
      setList((l) => [...l.slice(-4), t]);
      setTimeout(() => setList((l) => l.filter((x) => x.id !== t.id)), 3400);
    });
  }, []);
  return (
    <div class="toast-wrap">
      {list.map((t) => (
        <div key={t.id} class={'toast ' + t.kind}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

const WEATHER_ICON: Record<string, string> = {
  clear: '☀️',
  rain: '🌧️',
  snow: '❄️',
  fog: '🌫️',
  blizzard: '🌨️',
  sandstorm: '🏜️',
  ash: '🌋',
  storm: '⛈️',
};

export function Hud() {
  useGame();
  const s = game.state;
  const sim = game.sim;
  if (!s || !sim) return null;
  const axe = sim.inventory.equipped();
  const axeDef = axe ? AXE_BY_ID[axe.def] : null;
  const prompt = sim.hub.nearest;
  const target = sim.chopping.target;
  const held = sim.grab.held;
  const tracker = sim.quests.tracker();
  const night = isNight(s.time);
  const biome = sim.biome.current;
  const inVehicle = sim.player.mode === 'vehicle';
  return (
    <div class="hud-layer" data-testid="hud">
      <div class="hud-tl">
        <div class="hud-chip money" data-testid="money">
          {money(s.money)}
        </div>
        <div class="hud-chip" style="font-size:0.85rem">
          {night ? '🌙' : (WEATHER_ICON[s.weather.kind] ?? '☀️')} {formatClock(s.time)} · Day{' '}
          {Math.floor(s.time) + 1} · {s.weather.kind}
        </div>
        <div class="hud-chip" style="font-size:0.85rem">
          📍 {biome.name}
        </div>
        <div class="bar blue" title="Stamina">
          <i style={{ width: `${(s.player.stamina / CONFIG.player.maxStamina) * 100}%` }} />
        </div>
        <div class="bar red" title="Health">
          <i style={{ width: `${s.player.hp}%` }} />
        </div>
        {sim.biome.hazardText && (
          <div class="hud-chip" style="color:var(--bad);font-size:0.85rem">
            ⚠ {sim.biome.hazardText}
          </div>
        )}
      </div>
      <div class="hud-tr">
        <Minimap />
        {tracker.length > 0 && (
          <div class="hud-chip" style="max-width:260px;font-size:0.82rem" data-testid="tracker">
            {tracker.map((t) => (
              <div>
                <b>{t.title}</b>: {t.text} <span style="color:var(--amber-2)">{t.progress}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div class="crosshair" style={held ? 'border-color:var(--leaf)' : ''} />
      {prompt && !game.panel && <div class="prompt">[E] {prompt.label}</div>}
      {target && !game.panel && axe && !inVehicle && (
        <div class="treehp">
          <div style="font-size:0.85rem;font-weight:700;text-shadow:0 1px 3px #000">
            {WOOD_BY_ID[target.wood]?.name}
            {target.mut ? ` (${target.mut})` : ''}
          </div>
          <div class="bar red">
            <i style={{ width: `${Math.max(0, (target.hp / target.maxHp) * 100)}%` }} />
          </div>
        </div>
      )}
      {held && (
        <div class="prompt" style="top:62%">
          Holding {WOOD_BY_ID[held.wood]?.name} log · {held.mass.toFixed(0)} kg · [RMB] throw · [wheel]
          distance
        </div>
      )}
      <div class="hud-bc">
        {s.inv.hotbar.map((h, i) => {
          let label = '';
          let ic = '';
          let sel = false;
          if (h?.startsWith('axe:')) {
            const a = sim.inventory.axeByUid(h.slice(4));
            if (a) {
              label = AXE_BY_ID[a.def]!.name;
              ic = '🪓';
              sel = s.equipped === a.uid;
            }
          } else if (h?.startsWith('item:')) {
            const id = h.slice(5);
            const n = sim.inventory.count(id);
            label = `${itemName(id)} ×${n}`;
            ic = iconOf(id);
          }
          return (
            <div
              class={'hotslot clickable' + (sel ? ' sel' : '')}
              key={i}
              onClick={() => {
                if (h?.startsWith('item:')) sim.itemUse.use(h.slice(5));
                else sim.inventory.selectHotbar(i);
              }}
              title={label}
            >
              <span class="k">{i + 1}</span>
              <div>
                {ic}
                <div style="font-size:0.55rem;line-height:0.7rem;max-height:1.4rem;overflow:hidden">
                  {label}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {axe && axeDef && (
        <div class="hud-bl">
          <div class="hud-chip" style="font-size:0.85rem">
            🪓 {axeDef.name}
            {axe.up ? ` +${axe.up}` : ''}
            <div class="bar amber" style="margin-top:4px">
              <i style={{ width: `${(axe.dur / axeDef.durability) * 100}%` }} />
            </div>
            {axeDef.ability === 'fuel' && (
              <div class="bar" style="margin-top:3px">
                <i style={{ width: `${s.player.fuel}%` }} />
              </div>
            )}
          </div>
        </div>
      )}
      {sim.vehicles.current && (
        <div class="hud-bl" style="bottom:90px;width:260px" data-testid="veh-hud">
          <div class="hud-chip">
            <div style="font-size:1.6rem;font-weight:900">
              {Math.abs(Math.round(sim.vehicles.current.speed * 3.6))}{' '}
              <span style="font-size:0.8rem">km/h</span>
            </div>
            <div style="font-size:0.78rem">
              ⛽{' '}
              <span style="display:inline-block;width:150px;vertical-align:middle" class="bar amber">
                <i
                  style={{
                    width: `${(sim.vehicles.current.owned.fuel / Math.max(1, sim.vehicles.stats(sim.vehicles.current).fuelCap)) * 100}%`,
                  }}
                />
              </span>
            </div>
            <div style="font-size:0.78rem">
              🔧{' '}
              <span style="display:inline-block;width:150px;vertical-align:middle" class="bar red">
                <i style={{ width: `${sim.vehicles.current.owned.hp}%` }} />
              </span>
            </div>
            <div style="font-size:0.72rem;color:var(--parch-dim)">
              {sim.vehicles.current.trailer ? '🔗 trailer hitched · ' : ''}[R] hitch · [V] camera · [E] exit
            </div>
          </div>
        </div>
      )}
      <Toasts />
      <TouchControls />
      <div class="hud-br">
        <div class="hud-chip" style="font-size:0.75rem;opacity:0.8">
          FPS {game.loop.fps.toFixed(0)} · [I] inventory · [J] quests · [M] map · [B] build · [G] garage
        </div>
      </div>
    </div>
  );
}

function TouchControls() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const h = () => setOn(true);
    window.addEventListener('touchstart', h, { once: true, passive: true });
    return () => window.removeEventListener('touchstart', h);
  }, []);
  if (!on) return null;
  const btn = (name: string, label: string, cls = '') => (
    <div
      class={'tbtn clickable ' + cls}
      onTouchStart={(e) => {
        e.preventDefault();
        game.input.setTouchButton(name, true);
      }}
      onTouchEnd={() => game.input.setTouchButton(name, false)}
    >
      {label}
    </div>
  );
  return (
    <div class="touch-btns" style="pointer-events:auto">
      {btn('act', '🪓', 'big')}
      {btn('jump', '⤒')}
      {btn('interact', 'E')}
      {btn('sprint', '🏃')}
      <div class="tbtn clickable" onTouchStart={() => game.openPanel('inventory')}>
        🎒
      </div>
      <div class="tbtn clickable" onTouchStart={() => game.openPanel('pause')}>
        ☰
      </div>
    </div>
  );
}
void ITEM_BY_ID;
void useRef;

import { game, useGame, money } from './hooks';
import { formatClock } from '../core/gameTime';
import { useEffect, useState } from 'preact/hooks';
import { CONFIG } from '../config';

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

export function Hud() {
  useGame();
  const s = game.state;
  if (!s) return null;
  const sim = game.sim!;
  return (
    <div class="hud-layer" data-testid="hud">
      <div class="hud-tl">
        <div class="hud-chip money" data-testid="money">
          {money(s.money)}
        </div>
        <div class="hud-chip">
          {formatClock(s.time)} · Day {Math.floor(s.time) + 1}
        </div>
        <div class="bar blue">
          <i style={{ width: `${(s.player.stamina / CONFIG.player.maxStamina) * 100}%` }} />
        </div>
        <div class="bar red">
          <i style={{ width: `${s.player.hp}%` }} />
        </div>
      </div>
      <div class="crosshair" />
      <Toasts />
      <div class="hud-br">
        <div class="hud-chip" style="font-size:0.8rem">
          FPS {game.loop.fps.toFixed(0)} · tick {sim.tickCount}
        </div>
      </div>
    </div>
  );
}

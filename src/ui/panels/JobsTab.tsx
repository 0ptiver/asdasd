import { game, useGame, money } from '../hooks';
import { TOWNS } from '../../systems/jobs';
import { WOOD_BY_ID } from '../../data/woods';
import { formatClock } from '../../core/gameTime';

export function JobsTab() {
  useGame();
  const sim = game.sim!;
  const st = game.state!;
  const left = (t: number) => {
    const sec = Math.max(0, (t - st.time) * 960);
    return `${Math.floor(sec / 60)}m ${Math.floor(sec % 60)}s`;
  };
  return (
    <div>
      <div class="row" style="margin-bottom:8px;font-size:0.85rem">
        {TOWNS.map((t) => (
          <span class="hud-chip" key={t.id}>
            {t.name}: rep {Math.floor(st.rep[t.id] ?? 0)} (+{Math.round(sim.jobs.repBonus(t.id) * 100)}% pay)
          </span>
        ))}
      </div>
      <div class="grid">
        {st.jobs.map((j) => (
          <div class={'card' + (j.taken ? ' owned' : '')} key={j.id}>
            <h4>📦 {TOWNS.find((t) => t.id === j.town)?.name}</h4>
            <div>
              Deliver <b>{sim.jobs.describe(j)}</b>
              {j.kind === 'logs' ? ' (sell the logs at the counter)' : ''}
            </div>
            <div style="font-size:0.85rem">
              Reward <span class="money">{money(j.reward)}</span> ·{' '}
              {st.time <= j.bonusBy ? (
                <span class="up">time bonus +50% for {left(j.bonusBy)}</span>
              ) : (
                'no time bonus'
              )}
            </div>
            <div style="font-size:0.8rem;color:var(--parch-dim)">
              Expires in {left(j.expires)} · {WOOD_BY_ID[j.wood]?.name}
              {j.kind === 'logs' && j.taken ? ` · ${j.delivered.toFixed(1)}/${j.units}` : ''}
            </div>
            {!j.taken ? (
              <button
                class="btn small"
                onClick={() => {
                  sim.jobs.accept(j.id);
                  game.bump(true);
                }}
              >
                Accept
              </button>
            ) : j.kind !== 'logs' ? (
              <button
                class="btn small good"
                onClick={() => {
                  sim.jobs.deliver(j.id);
                  game.bump(true);
                }}
              >
                Deliver now
              </button>
            ) : (
              <div class="desc">Sell matching logs to progress.</div>
            )}
          </div>
        ))}
        {!st.jobs.length && <div class="desc">No jobs posted. Check back soon.</div>}
      </div>
    </div>
  );
}
void formatClock;

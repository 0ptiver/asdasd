import { useState } from 'preact/hooks';
import { game, useGame, money } from '../hooks';
import { Panel } from '../Panel';
import { STORY } from '../../data/quests';

export function QuestPanel() {
  useGame();
  const sim = game.sim!;
  const st = game.state!;
  const [tab, setTab] = useState<'story' | 'daily' | 'jobs'>('story');
  return (
    <Panel title="Quests & Jobs" wide>
      <div class="tabs">
        {(['story', 'daily', 'jobs'] as const).map((t) => (
          <div class={'tab' + (tab === t ? ' on' : '')} onClick={() => setTab(t)}>
            {t === 'daily' ? 'Daily / Weekly' : t[0]!.toUpperCase() + t.slice(1)}
          </div>
        ))}
      </div>
      <div class="body">
        {tab === 'story' && (
          <div class="grid">
            {STORY.map((q) => {
              const a = st.quests.active.find((x) => x.id === q.id);
              const done = st.quests.done.includes(q.id);
              const avail = !a && !done && (!q.requires || st.quests.done.includes(q.requires));
              return (
                <div class={'card' + (done ? ' owned' : !a && !avail ? ' locked' : '')} key={q.id}>
                  <h4>
                    {done ? '✅' : a ? '▶' : avail ? '❗' : '🔒'} {q.name}
                  </h4>
                  <div class="desc">{q.intro}</div>
                  {a && (
                    <div style="font-size:0.85rem">
                      Now: <b>{q.stages[a.stage]?.text}</b>{' '}
                      {q.stages[a.stage]!.count > 1
                        ? `(${Math.floor(a.progress)}/${q.stages[a.stage]!.count})`
                        : ''}
                    </div>
                  )}
                  <div style="font-size:0.78rem;color:var(--parch-dim)">
                    Giver: {q.giver} · Reward: {q.reward.money ? money(q.reward.money) : ''}
                    {q.reward.axe ? ' + axe' : ''}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {tab === 'daily' && (
          <div class="grid">
            {st.quests.active
              .filter((a) => a.type === 'daily' || a.type === 'weekly')
              .map((a) => (
                <div class={'card' + (a.done ? ' owned' : '')} key={a.id}>
                  <h4>
                    {a.type === 'weekly' ? '📅' : '☀️'} {a.name}
                  </h4>
                  <div>{a.text}</div>
                  <div class="bar">
                    <i style={{ width: `${Math.min(100, (a.progress / (a.need ?? 1)) * 100)}%` }} />
                  </div>
                  <div style="font-size:0.8rem">
                    {a.done ? 'Complete!' : `${Math.floor(a.progress)}/${a.need}`} · Reward{' '}
                    <span class="money">{money(a.reward ?? 0)}</span>
                  </div>
                </div>
              ))}
          </div>
        )}
        {tab === 'jobs' &&
          (sim.jobs ? sim.jobs.render() : <div class="desc">The job board is empty today.</div>)}
      </div>
    </Panel>
  );
}

import { game, useGame, money } from '../hooks';
import { Panel } from '../Panel';
import { PLOTS } from '../../data/plots';
import { BIOME_BY_ID } from '../../data/biomes';

export function LandPanel() {
  useGame();
  const sim = game.sim!;
  const st = game.state!;
  const sorted = [...PLOTS].sort((a, b) => a.price - b.price);
  return (
    <Panel title="Marla's Land Office" wide>
      <div class="body">
        <div style="margin-bottom:8px">
          You have <span class="money">{money(st.money)}</span> · {Object.keys(st.plots).length}/
          {PLOTS.length} plots owned. Walk to a plot to see its boundary; build with [B].
        </div>
        <div class="grid">
          {sorted.map((p) => {
            const owned = st.plots[p.id];
            const biome = BIOME_BY_ID[p.biome];
            return (
              <div class={'card' + (owned ? ' owned' : '')} key={p.id}>
                <h4>
                  {p.name} <span style="font-weight:400;font-size:0.8rem">· {biome.name}</span>
                </h4>
                <div class="desc">
                  {p.size[0]}×{p.size[1]} m ·{' '}
                  {owned
                    ? `${owned.sections}/${p.maxSections} sections · ${owned.parts.length}/${sim.plots.partCap(p.id)} parts`
                    : `Max ${p.maxSections} sections`}
                </div>
                {owned ? (
                  <div class="row">
                    <button
                      class="btn small"
                      disabled={owned.sections >= p.maxSections || st.money < sim.plots.expandCost(p.id)}
                      onClick={() => {
                        sim.plots.expand(p.id);
                        game.bump(true);
                      }}
                    >
                      {owned.sections >= p.maxSections
                        ? 'Max size'
                        : `Expand ${money(sim.plots.expandCost(p.id))}`}
                    </button>
                    <button
                      class="btn alt small"
                      onClick={() => {
                        sim.player.teleport(
                          p.center[0],
                          p.center[1] + p.size[1] / 2 + 3,
                          p.biome === 'sky' ? 230 : undefined,
                        );
                        game.closePanel();
                      }}
                    >
                      Go there
                    </button>
                  </div>
                ) : (
                  <button
                    class="btn small"
                    disabled={st.money < p.price}
                    onClick={() => {
                      sim.plots.buy(p.id);
                      game.bump(true);
                    }}
                    data-testid={'buy-' + p.id}
                  >
                    Buy {money(p.price)}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

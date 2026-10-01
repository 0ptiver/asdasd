import { game, useGame, money } from '../hooks';
import { Panel } from '../Panel';
import { itemName } from '../../systems/itemValue';
import { colorOf, iconOf } from '../icons';

export function SellPanel() {
  useGame();
  const sim = game.sim!;
  const st = game.state!;
  const totals = new Map<string, number>();
  for (const s of st.inv.slots) if (s) totals.set(s.id, (totals.get(s.id) ?? 0) + s.n);
  const rows = [...totals.entries()]
    .filter(([id]) => sim.market.itemPrice(id) > 0)
    .sort((a, b) => sim.market.itemPrice(b[0]) * b[1] - sim.market.itemPrice(a[0]) * a[1]);
  const all = rows.reduce((s, [id, n]) => s + sim.market.itemPrice(id) * n, 0);
  return (
    <Panel title="Sell Counter">
      <div class="body">
        <div class="row" style="justify-content:space-between;margin-bottom:8px">
          <span>Drop logs on the counter pad to sell them. Sell inventory goods here.</span>
          <button
            class="btn good"
            data-testid="sell-all"
            disabled={!all}
            onClick={() => {
              for (const [id, n] of rows) sim.sell.sellItem(id, n);
              game.bump(true);
            }}
          >
            Sell all ({money(all)})
          </button>
        </div>
        {rows.length === 0 && <div class="desc">Nothing to sell. Collect planks from the sawmill!</div>}
        {rows.map(([id, n]) => (
          <div class="pricerow" key={id} style="align-items:center">
            <span>
              <span style={`color:${colorOf(id)}`}>{iconOf(id)}</span> {itemName(id)} ×{n}
            </span>
            <span class="row">
              <span class="money">{money(sim.market.itemPrice(id))} ea</span>
              <button
                class="btn small"
                onClick={() => {
                  sim.sell.sellItem(id, 1);
                  game.bump(true);
                }}
              >
                Sell 1
              </button>
              <button
                class="btn small good"
                onClick={() => {
                  sim.sell.sellItem(id, n);
                  game.bump(true);
                }}
              >
                Sell all
              </button>
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

import { game, useGame } from '../hooks';
import { Panel } from '../Panel';
import { itemName } from '../../systems/itemValue';
import { colorOf, iconOf } from '../icons';

export function ChestPanel({ id }: { id: string }) {
  useGame();
  const sim = game.sim!;
  const chest = sim.building.chestOf(Number(id));
  if (!chest) return null;
  const inv = game.state!.inv.slots;
  const slotBtn = (s: { id: string; n: number }, onClick: () => void) => (
    <div class="hotslot clickable" style={{ width: '62px', height: '62px', background: colorOf(s.id) + '55' }} title={itemName(s.id)} onClick={onClick}>
      <div style="font-size:1.5rem">{iconOf(s.id)}</div><div style="position:absolute;right:3px;bottom:1px;font-size:0.72rem;font-weight:800">{s.n}</div>
    </div>
  );
  const moveToChest = (i: number) => {
    const s = inv[i];
    if (!s) return;
    if (chest.length >= 40 && !chest.find((c) => c.id === s.id)) return;
    const ex = chest.find((c) => c.id === s.id);
    if (ex) ex.n += s.n;
    else chest.push({ id: s.id, n: s.n });
    inv[i] = null;
    game.bump(true);
  };
  const takeFromChest = (i: number) => {
    const s = chest[i]!;
    const left = sim.inventory.add(s.id, s.n);
    if (left === 0) chest.splice(i, 1);
    else s.n = left;
    game.bump(true);
  };
  return (
    <Panel title="Storage Chest" wide>
      <div class="body" style="display:flex;gap:16px;flex-wrap:wrap">
        <div style="flex:1;min-width:260px"><h4>Chest ({chest.length}/40)</h4><div class="row">{chest.map((s, i) => slotBtn(s, () => takeFromChest(i)))}</div></div>
        <div style="flex:1;min-width:260px"><h4>Your items (click to store)</h4><div class="row">{inv.map((s, i) => (s ? slotBtn(s, () => moveToChest(i)) : null))}</div></div>
      </div>
    </Panel>
  );
}

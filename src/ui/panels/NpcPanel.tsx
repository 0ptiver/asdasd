import { useState } from 'preact/hooks';
import { game } from '../hooks';
import { Panel } from '../Panel';
import { NPC_BY_ID } from '../../data/npcs';
import { hex } from '../icons';

const BUTTONS: Record<string, [string, string, string?][]> = {
  tools: [['Browse tools', 'shop', 'tools']],
  gear: [['Browse gear', 'shop', 'gear']],
  smith: [['Smith services', 'smith']],
  mechanic: [
    ['Garage', 'garage'],
    ['Fuel & repairs', 'gas'],
  ],
  land: [['Land for sale', 'land']],
  market: [
    ['Price board', 'market'],
    ['Exchange & auctions', 'exchange'],
  ],
  harbor: [['Boats & ferry', 'shop', 'harbor']],
  traveler: [['Strange wares', 'traveler']],
};

const EXTRA: Record<string, [string, string, string?][]> = {
  ivy: [
    ['Hire loggers', 'workers'],
    ['Achievements & prestige', 'achievements'],
  ],
  gus: [['Crafting info', 'craft']],
};

export function NpcPanel({ id }: { id: string }) {
  const npc = NPC_BY_ID[id];
  const [line] = useState(() => (npc ? npc.lines[Math.floor(Math.random() * npc.lines.length)] : ''));
  if (!npc) return null;
  const sim = game.sim!;
  const quests = sim.quests?.availableFrom(id) ?? [];
  const turnIn = sim.quests?.turnInsFor(id) ?? [];
  return (
    <Panel title={`${npc.name} — ${npc.role}`}>
      <div class="body">
        <div class="row" style="align-items:flex-start;gap:16px">
          <div
            style={`width:70px;height:90px;border-radius:10px;background:${hex(npc.color)};display:flex;align-items:flex-end;justify-content:center;font-size:2.4rem`}
          >
            🙂
          </div>
          <div style="flex:1">
            <div style="font-size:1.05rem;font-style:italic">“{line}”</div>
          </div>
        </div>
        <div class="row" style="margin-top:14px">
          {(npc.shop && BUTTONS[npc.shop] ? BUTTONS[npc.shop]! : []).map(([label, panel, arg]) => (
            <button class="btn" onClick={() => game.openPanel(panel, arg)}>
              {label}
            </button>
          ))}
          {(EXTRA[id] ?? []).map(([label, panel, arg]) => (
            <button class="btn alt" onClick={() => game.openPanel(panel, arg)}>
              {label}
            </button>
          ))}
          {turnIn.map((q) => (
            <button
              class="btn good"
              onClick={() => {
                sim.quests!.talkTo(id);
                game.bump(true);
              }}
            >
              Quest: {q.name}
            </button>
          ))}
          {quests.map((q) => (
            <button
              class="btn good"
              onClick={() => {
                sim.quests!.accept(q.id);
                game.bump(true);
              }}
            >
              New quest: {q.name}
            </button>
          ))}
          <button class="btn alt" onClick={() => game.closePanel()}>
            Goodbye
          </button>
        </div>
      </div>
    </Panel>
  );
}

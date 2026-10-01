import { useEffect, useState } from 'preact/hooks';
import { game, useGame } from './hooks';
import { CONFIG } from '../config';
import type { SaveMeta } from '../save/schema';
import { deleteSlot, parseImport, saveSlot, loadSlot, exportSave } from '../save/slots';
import { SettingsPanel } from './Settings';

const fmtTime = (s: number) => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;

export function MainMenu() {
  useGame();
  const [slots, setSlots] = useState<(SaveMeta | null)[]>([]);
  const [naming, setNaming] = useState<number | null>(null);
  const [name, setName] = useState('Lumberjack');
  const [showSettings, setShowSettings] = useState(false);
  const [err, setErr] = useState('');
  const refresh = () => game.listSlots().then(setSlots);
  useEffect(() => void refresh(), []);

  const doImport = async (slot: number) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = async () => {
      try {
        const text = await inp.files![0]!.text();
        await saveSlot(slot, parseImport(text));
        setErr('');
        refresh();
      } catch (e) {
        setErr('Import failed: ' + (e as Error).message);
      }
    };
    inp.click();
  };
  const doExport = async (slot: number) => {
    const s = await loadSlot(slot);
    if (!s) return;
    const blob = new Blob([exportSave(s)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `timber-empire-${s.name}-slot${slot + 1}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  if (showSettings)
    return (
      <div class="menu">
        <div class="menu-card">
          <SettingsPanel onClose={() => setShowSettings(false)} embedded />
        </div>
      </div>
    );

  return (
    <div class="menu" data-testid="main-menu">
      <div class="menu-card">
        <h1>{CONFIG.title.toUpperCase()}</h1>
        <div class="sub">Chop. Haul. Build. Rule the forest. v{CONFIG.version}</div>
        {Array.from({ length: CONFIG.saveSlots }, (_, i) => {
          const m = slots[i] ?? null;
          return (
            <div class={'slot' + (m ? '' : ' empty')} key={i} data-testid={`slot-${i}`}>
              <div class="info">
                <div class="name">{m ? m.name : `Slot ${i + 1} — empty`}</div>
                {m && (
                  <div class="meta">
                    ${Math.floor(m.money).toLocaleString()} · {fmtTime(m.playedSec)} ·{' '}
                    {new Date(m.savedAt).toLocaleString()}
                    {m.prestige ? ` · Prestige ${m.prestige}` : ''}
                  </div>
                )}
              </div>
              {m ? (
                <div class="row">
                  <button class="btn good" data-testid={`continue-${i}`} onClick={() => game.continueGame(i)}>
                    Continue
                  </button>
                  <button class="btn alt small" onClick={() => doExport(i)}>
                    Export
                  </button>
                  <button
                    class="btn bad small"
                    onClick={async () => {
                      if (confirm('Delete this save?')) {
                        await deleteSlot(i);
                        refresh();
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              ) : naming === i ? (
                <div class="row">
                  <input
                    class="txt"
                    data-testid="name-input"
                    value={name}
                    maxLength={18}
                    onInput={(e) => setName((e.target as HTMLInputElement).value)}
                  />
                  <button class="btn" data-testid="start-new" onClick={() => game.newGame(i, name)}>
                    Start
                  </button>
                </div>
              ) : (
                <div class="row">
                  <button class="btn" data-testid={`new-${i}`} onClick={() => setNaming(i)}>
                    New Game
                  </button>
                  <button class="btn alt small" onClick={() => doImport(i)}>
                    Import
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {err && <div style="color:var(--bad)">{err}</div>}
        <div class="row" style="margin-top:12px">
          <button class="btn alt" onClick={() => setShowSettings(true)}>
            Settings
          </button>
        </div>
      </div>
    </div>
  );
}

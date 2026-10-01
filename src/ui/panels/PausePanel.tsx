import { useState } from 'preact/hooks';
import { game } from '../hooks';
import { Panel } from '../Panel';
import { SettingsPanel } from '../Settings';
import { exportSave } from '../../save/slots';

export function PausePanel() {
  const [settings, setSettings] = useState(false);
  if (settings) return <SettingsPanel onClose={() => setSettings(false)} />;
  return (
    <Panel title="Paused">
      <div class="body" style="display:flex;flex-direction:column;gap:10px;align-items:stretch">
        <button class="btn good" onClick={() => game.closePanel()}>
          Resume
        </button>
        <button class="btn" onClick={() => game.save(false)}>
          Save game
        </button>
        <button class="btn alt" onClick={() => setSettings(true)}>
          Settings
        </button>
        <button class="btn alt" onClick={() => game.openPanel('net')}>
          Multiplayer {game.net.online ? '(online)' : ''}
        </button>
        <button class="btn alt" onClick={() => game.openPanel('workers')}>
          Lumberjack crew
        </button>
        <button class="btn alt" onClick={() => game.openPanel('market')}>
          Price board
        </button>
        <button class="btn alt" onClick={() => game.openPanel('achievements')}>
          Achievements
        </button>
        <button
          class="btn alt"
          onClick={() => {
            const blob = new Blob([exportSave(game.state!)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `timber-empire-${game.state!.name}.json`;
            a.click();
          }}
        >
          Export save to file
        </button>
        <button
          class="btn bad"
          onClick={() => {
            game.closePanel();
            game.quit(true);
          }}
        >
          Save & quit to menu
        </button>
      </div>
    </Panel>
  );
}

import { game, useGame } from './hooks';
import { MainMenu } from './MainMenu';
import { Hud } from './Hud';
import { InventoryPanel } from './panels/InventoryPanel';
import { ToolShop, GearShop } from './panels/ShopPanel';
import { SellPanel } from './panels/SellPanel';
import { NpcPanel } from './panels/NpcPanel';
import { PausePanel } from './panels/PausePanel';
import { SettingsPanel } from './Settings';
import { PANELS } from './panelRegistry';
import { ConsolePanel } from './panels/ConsolePanel';
import { QuestPanel } from './panels/QuestPanel';
import { MapPanel } from './panels/MapPanel';

export function App() {
  useGame();
  if (game.screen === 'menu') return <MainMenu />;
  if (game.screen !== 'game' || !game.sim) return null;
  const p = game.panel;
  let panel = null;
  if (p) {
    switch (p.name) {
      case 'inventory':
        panel = <InventoryPanel />;
        break;
      case 'shop':
        panel =
          p.arg === 'tools' ? (
            <ToolShop />
          ) : p.arg === 'gear' ? (
            <GearShop />
          ) : (
            (PANELS['shop:' + p.arg] ?? (() => null))()
          );
        break;
      case 'sell':
        panel = <SellPanel />;
        break;
      case 'npc':
        panel = <NpcPanel id={p.arg ?? ''} />;
        break;
      case 'pause':
        panel = <PausePanel />;
        break;
      case 'console':
        panel = <ConsolePanel />;
        break;
      case 'quests':
        panel = <QuestPanel />;
        break;
      case 'map':
        panel = <MapPanel />;
        break;
      case 'settings':
        panel = <SettingsPanel onClose={() => game.closePanel()} />;
        break;
      default: {
        const f = PANELS[p.name];
        panel = f ? f(p.arg) : null;
      }
    }
  }
  return (
    <>
      <Hud />
      {panel}
    </>
  );
}

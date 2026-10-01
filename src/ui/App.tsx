import { game, useGame } from './hooks';
import { MainMenu } from './MainMenu';
import { Hud } from './Hud';

export function App() {
  useGame();
  if (game.screen === 'menu') return <MainMenu />;
  if (game.screen === 'game') return <Hud />;
  return null;
}

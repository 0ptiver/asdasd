import { render, h } from 'preact';
import './ui/theme.css';
import { Game } from './core/game';
import { App } from './ui/App';
import { setGame } from './ui/hooks';

const game = new Game();
setGame(game);
(window as any).__game = game; // used by the debug console and e2e tests

const fill = document.getElementById('ld-fill')!;
const text = document.getElementById('ld-text')!;
const loading = document.getElementById('loading')!;

render(h(App, {}), document.getElementById('ui')!);

game
  .init(document.getElementById('game') as HTMLCanvasElement, (p, t) => {
    fill.style.width = `${Math.round(p * 100)}%`;
    text.textContent = t;
  })
  .then(() => {
    loading.classList.add('done');
    setTimeout(() => loading.remove(), 600);
  })
  .catch((e) => {
    console.error(e);
    text.textContent = 'Failed to start: ' + (e as Error).message;
  });

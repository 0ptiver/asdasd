import { useEffect, useState } from 'preact/hooks';
import type { Game } from '../core/game';

export let game: Game;
export const setGame = (g: Game) => (game = g);

/** Re-render the calling component whenever game.bump() fires. */
export function useGame(): Game {
  const [, set] = useState(0);
  useEffect(() => game.subscribe(() => set((n) => n + 1)), []);
  return game;
}

export const fmt = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  return Math.floor(n).toLocaleString();
};
export const money = (n: number): string => '$' + fmt(n);

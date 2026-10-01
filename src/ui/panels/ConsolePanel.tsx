import { useEffect, useRef, useState } from 'preact/hooks';
import { game } from '../hooks';
import { runCommand } from '../../core/debug';

export function ConsolePanel() {
  const [out, setOut] = useState<string[]>(['Debug console — type "help"']);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div class="console" data-testid="console">
      <div class="out">{out.slice(-8).join('\n')}</div>
      <input
        ref={ref}
        placeholder="command…"
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            const v = (e.target as HTMLInputElement).value;
            (e.target as HTMLInputElement).value = '';
            setOut((o) => [...o, '> ' + v, runCommand(game, v)]);
            game.bump(true);
          } else if (e.key === 'Escape' || e.key === '`') {
            e.preventDefault();
            game.closePanel();
          }
        }}
      />
    </div>
  );
}

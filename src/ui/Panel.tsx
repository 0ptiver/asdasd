import type { ComponentChildren } from 'preact';
import { game } from './hooks';

export function Panel({
  title,
  children,
  wide,
  onClose,
}: {
  title: string;
  children: ComponentChildren;
  wide?: boolean;
  onClose?: () => void;
}) {
  return (
    <div
      class="panel"
      style={wide ? 'width:min(1100px,97vw)' : ''}
      data-testid={'panel-' + title.toLowerCase().replace(/\W+/g, '-')}
    >
      <header>
        <h2>{title}</h2>
        <button class="btn small" onClick={() => (onClose ? onClose() : game.closePanel())}>
          ✕ Close
        </button>
      </header>
      {children}
    </div>
  );
}

import { useState } from 'preact/hooks';
import { game, useGame } from './hooks';
import { DEFAULT_KEYS, type Settings } from '../save/schema';

const KEY_LABELS: Record<string, string> = {
  forward: 'Forward',
  back: 'Back',
  left: 'Left',
  right: 'Right',
  jump: 'Jump',
  sprint: 'Sprint',
  interact: 'Interact',
  inventory: 'Inventory',
  map: 'Map',
  build: 'Build mode',
  quests: 'Quests',
  garage: 'Garage',
  craft: 'Crafting',
  hotbarNext: 'Next hotbar',
  drop: 'Drop / release',
  special: 'Special (grapple / ability)',
  recall: 'Recall vehicle',
  horn: 'Horn',
  lights: 'Lights',
  console: 'Debug console',
};

export function SettingsPanel({ onClose, embedded }: { onClose: () => void; embedded?: boolean }) {
  useGame();
  const s = game.settings;
  const [tab, setTab] = useState<'gfx' | 'audio' | 'controls' | 'access'>('gfx');
  const [rebinding, setRebinding] = useState<string | null>(null);
  const set = (p: Partial<Settings>) => game.updateSettings(p);

  const startRebind = (action: string) => {
    setRebinding(action);
    const h = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      window.removeEventListener('keydown', h, true);
      if (e.code !== 'Escape') set({ keys: { ...s.keys, [action]: e.code } });
      setRebinding(null);
    };
    window.addEventListener('keydown', h, true);
  };

  const slider = (label: string, key: keyof Settings, min: number, max: number, step: number) => (
    <div class="row" style="margin:6px 0">
      <span style="width:150px">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={s[key] as number}
        onInput={(e) => set({ [key]: Number((e.target as HTMLInputElement).value) } as Partial<Settings>)}
      />
      <span>{(s[key] as number).toFixed(2)}</span>
    </div>
  );
  const toggle = (label: string, key: keyof Settings) => (
    <label class="row" style="margin:6px 0">
      <input
        type="checkbox"
        checked={s[key] as boolean}
        onChange={(e) => set({ [key]: (e.target as HTMLInputElement).checked } as Partial<Settings>)}
      />{' '}
      {label}
    </label>
  );

  const content = (
    <>
      <div class="tabs">
        {(['gfx', 'audio', 'controls', 'access'] as const).map((t) => (
          <div class={'tab' + (tab === t ? ' on' : '')} onClick={() => setTab(t)}>
            {{ gfx: 'Graphics', audio: 'Audio', controls: 'Controls', access: 'Accessibility' }[t]}
          </div>
        ))}
      </div>
      <div class="body">
        {tab === 'gfx' && (
          <>
            <div class="row" style="margin:6px 0">
              <span style="width:150px">Quality preset</span>
              <select
                class="txt"
                value={s.quality}
                onChange={(e) => {
                  const q = (e.target as HTMLSelectElement).value as Settings['quality'];
                  set({
                    quality: q,
                    shadows: q !== 'low',
                    bloom: q === 'high' || q === 'ultra',
                    ssao: q === 'ultra',
                    viewChunks: q === 'low' ? 2 : q === 'medium' ? 3 : q === 'high' ? 4 : 5,
                  });
                }}
              >
                {['low', 'medium', 'high', 'ultra'].map((q) => (
                  <option value={q}>{q}</option>
                ))}
              </select>
            </div>
            {toggle('Shadows', 'shadows')}
            {toggle('Bloom', 'bloom')}
            {toggle('SSAO', 'ssao')}
            {slider('View distance (chunks)', 'viewChunks', 2, 6, 1)}
            {slider('Field of view', 'fov', 55, 100, 1)}
          </>
        )}
        {tab === 'audio' && (
          <>
            {slider('Music', 'music', 0, 1, 0.05)}
            {slider('Effects', 'sfx', 0, 1, 0.05)}
            {slider('Ambience', 'ambience', 0, 1, 0.05)}
          </>
        )}
        {tab === 'controls' && (
          <>
            {slider('Mouse sensitivity', 'sensitivity', 0.2, 3, 0.1)}
            {toggle('Invert Y', 'invertY')}
            <div class="grid" style="margin-top:8px">
              {Object.entries(KEY_LABELS).map(([a, label]) => (
                <div class="row" key={a} style="justify-content:space-between">
                  <span>{label}</span>
                  <button class="btn alt small" onClick={() => startRebind(a)}>
                    {rebinding === a ? 'Press a key…' : (s.keys[a] ?? '').replace('Key', '')}
                  </button>
                </div>
              ))}
            </div>
            <div style="margin-top:8px">
              <button class="btn alt small" onClick={() => set({ keys: { ...DEFAULT_KEYS } })}>
                Reset keys
              </button>
            </div>
          </>
        )}
        {tab === 'access' && (
          <>
            <div class="row" style="margin:6px 0">
              <span style="width:150px">Colorblind palette</span>
              <select
                class="txt"
                value={s.colorblind}
                onChange={(e) =>
                  set({ colorblind: (e.target as HTMLSelectElement).value as Settings['colorblind'] })
                }
              >
                {['none', 'deuter', 'protan', 'tritan'].map((q) => (
                  <option value={q}>{q}</option>
                ))}
              </select>
            </div>
            {toggle('Reduced motion (no camera shake / UI animation)', 'reducedMotion')}
            {slider('Text size', 'textScale', 0.8, 1.5, 0.05)}
            {toggle('Autosave every 30s', 'autosave')}
          </>
        )}
      </div>
    </>
  );
  if (embedded)
    return (
      <div>
        <div class="row" style="justify-content:space-between">
          <h2 style="margin:0">Settings</h2>
          <button class="btn" onClick={onClose}>
            Back
          </button>
        </div>
        {content}
      </div>
    );
  return (
    <div class="panel" data-testid="settings">
      <header>
        <h2>Settings</h2>
        <button class="btn small" onClick={onClose}>
          Close
        </button>
      </header>
      {content}
    </div>
  );
}

import type { ComponentChild } from 'preact';

/** Panels registered by feature modules (garage, build, map, ...). Keeps App.tsx small. */
export const PANELS: Record<string, (arg?: string) => ComponentChild> = {};
export const registerPanel = (name: string, f: (arg?: string) => ComponentChild): void => {
  PANELS[name] = f;
};

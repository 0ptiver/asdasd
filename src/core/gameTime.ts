/** Day/night clock. `days` is a continuous float (0 = first dawn at startHour). */
import { CONFIG } from '../config';

export function hourOfDay(days: number): number {
  return (((days % 1) + 1) % 1) * 24;
}
export function dayNumber(days: number): number {
  return Math.floor(days);
}
export function advance(days: number, dt: number): number {
  return days + dt / CONFIG.dayLengthSec;
}
/** 0 = deep night, 1 = full day. Smooth dawn/dusk. */
export function daylight(days: number): number {
  const h = hourOfDay(days);
  const sun = Math.sin(((h - 6) / 24) * Math.PI * 2); // peaks at 12
  return Math.min(1, Math.max(0, sun * 1.6 + 0.35));
}
export function isNight(days: number): boolean {
  return daylight(days) < 0.25;
}
export function formatClock(days: number): string {
  const h = hourOfDay(days);
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

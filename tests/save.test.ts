import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { migrate } from '../src/save/migrations';
import { newGameState } from '../src/save/schema';
import { deleteSlot, exportSave, listSlots, loadSlot, parseImport, saveSlot } from '../src/save/slots';
import { CONFIG } from '../src/config';

describe('save system', () => {
  it('round-trips a slot through IndexedDB', async () => {
    const s = newGameState('Test', 42);
    s.money = 1234;
    s.world.chopped['t1'] = 3;
    await saveSlot(1, s);
    const l = await loadSlot(1);
    expect(l?.money).toBe(1234);
    expect(l?.world.chopped['t1']).toBe(3);
    const metas = await listSlots();
    expect(metas[1]?.name).toBe('Test');
    expect(metas[0]).toBeNull();
    await deleteSlot(1);
    expect(await loadSlot(1)).toBeNull();
  });
  it('migrates a version-0 save and fills defaults', () => {
    const old = { version: 0, name: 'Old', seed: 7, money: 55 };
    const s = migrate(old);
    expect(s.version).toBe(CONFIG.saveVersion);
    expect(s.money).toBe(55);
    expect(s.inv.slots.length).toBe(24);
    expect(s.skills.woodcutting).toBe(0);
  });
  it('rejects saves from the future', () => {
    expect(() => migrate({ version: 999 })).toThrow();
  });
  it('export/import is lossless', () => {
    const s = newGameState('X', 9);
    s.money = 777;
    const back = parseImport(exportSave(s));
    expect(back.money).toBe(777);
    expect(back.seed).toBe(9);
  });
  it('rejects garbage import', () => {
    expect(() => parseImport('[1,2,3]')).toThrow();
  });
});

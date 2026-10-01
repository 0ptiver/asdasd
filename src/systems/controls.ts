import type { Sim, System } from '../core/sim';

/** Translates key presses into gameplay actions (hotbar, interact). UI toggles are handled in Game. */
export class ControlsSystem implements System {
  readonly name = 'controls';
  constructor(private sim: Sim) {}

  update(): void {
    const sim = this.sim;
    const inp = sim.game.input;
    if (inp.uiOpen || sim.player.mode === 'vehicle') return;
    for (let i = 0; i < 8; i++) {
      if (inp.rawPressed('Digit' + (i + 1))) sim.inventory.selectHotbar(i);
    }
    if (inp.pressed('hotbarNext')) {
      const n = (sim.inventory.hotbarSel + 1) % 8;
      sim.inventory.selectHotbar(n);
    }
    if (inp.pressed('interact') || inp.rawPressed('touch:interact')) {
      const it = sim.hub.nearest;
      if (it) sim.game.interact(it);
    }
  }
}

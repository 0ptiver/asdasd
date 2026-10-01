import type { Sim, System } from '../core/sim';
import { DAILY_TEMPLATES, STORY } from '../data/quests';
import { WOODS } from '../data/woods';
import { Rng } from '../core/rng';
import type { QuestDef, QuestStage } from '../data/types';
import type { ActiveQuest } from '../save/schema';
import { itemName } from './itemValue';

type StageKind = QuestStage['kind'];

/** Story questline + generated dailies/weeklies. Progress is driven by game events. */
export class QuestSystem implements System {
  readonly name = 'quests';
  constructor(private sim: Sim) {}

  private get q() {
    return this.sim.state.quests;
  }

  init(): void {
    const b = this.sim.bus;
    b.on('tree:fell', (e) =>
      this.progress(
        'chop',
        e.wood,
        1 + (e.wood === 'cavecrawler' || e.wood === 'dragonwood' || e.wood === 'heartwood' ? 1 : 0),
      ),
    );
    b.on('log:sold', () => this.progress('sell', 'log', 1));
    b.on('item:sell', (e) => {
      if (e.item.startsWith('plank_')) this.progress('sell', 'plank', e.count);
    });
    b.on('plank:made', (e) => {
      this.progress('plank', e.wood, e.count);
      this.progress('plank', undefined, e.count);
    });
    b.on('money:change', (e) => {
      if (e.delta > 0 && e.reason !== 'quest' && e.reason !== 'respawn')
        this.progress('earn', undefined, e.delta);
    });
    b.on('biome:enter', (e) => this.progress('visit', e.biome, 1));
    b.on('boss:down', (e) => this.progress('kill', e.boss, 1));
    b.on('plot:buy', () => this.progress('buy', 'plot', 1));
    // auto-accept the first story quest
    if (!this.q.done.includes('s1') && !this.q.active.some((a) => a.id === 's1')) this.accept('s1');
    this.refreshDailies();
  }

  update(): void {
    if (this.sim.tickCount % 120 === 0) this.refreshDailies();
  }

  def(id: string): QuestDef | undefined {
    return STORY.find((s) => s.id === id);
  }

  isDone(id: string): boolean {
    return this.q.done.includes(id);
  }

  availableFrom(npc: string): QuestDef[] {
    return STORY.filter(
      (s) =>
        s.giver === npc &&
        !this.isDone(s.id) &&
        !this.q.active.some((a) => a.id === s.id) &&
        (!s.requires || this.isDone(s.requires)),
    );
  }

  /** Active quests whose current stage is "talk to this NPC". */
  turnInsFor(npc: string): QuestDef[] {
    const out: QuestDef[] = [];
    for (const a of this.q.active) {
      const d = this.def(a.id);
      const stage = d?.stages[a.stage];
      if (d && stage?.kind === 'talk' && stage.target === npc) out.push(d);
    }
    return out;
  }

  accept(id: string): void {
    const d = this.def(id);
    if (!d || this.q.active.some((a) => a.id === id) || this.isDone(id)) return;
    this.q.active.push({ id, stage: 0, progress: 0, type: 'story' });
    this.sim.bus.emit('notify', { text: `Quest started: ${d.name}`, kind: 'good' });
    this.sim.bus.emit('notify', { text: `${d.intro}`, kind: 'info' });
    // retroactive progress: if a "buy"/"visit" stage is already satisfied, advance
    this.checkRetro(this.q.active[this.q.active.length - 1]!);
  }

  private checkRetro(a: ActiveQuest): void {
    const d = this.def(a.id);
    if (!d) return;
    const st = this.sim.state;
    for (let guard = 0; guard < 5; guard++) {
      const stage = d.stages[a.stage];
      if (!stage) return;
      let met = false;
      if (stage.kind === 'visit' && stage.target && st.world.visited.includes(stage.target)) met = true;
      if (stage.kind === 'buy' && stage.target === 'axe' && st.axes.length > 0) met = true;
      if (stage.kind === 'buy' && stage.target === 'plot' && Object.keys(st.plots).length > 0) met = true;
      if (stage.kind === 'buy' && stage.target === 'vehicle' && st.vehicles.length > 0) met = true;
      if (stage.kind === 'buy' && stage.target && st.vehicles.some((v) => v.def === stage.target)) met = true;
      if (!met) return;
      this.advance(a, d);
      if (!this.q.active.includes(a)) return;
    }
  }

  talkTo(npc: string): void {
    this.progress('talk', npc, 1);
  }

  progress(kind: StageKind, target: string | undefined, n: number): void {
    for (const a of [...this.q.active]) {
      if (a.type === 'story' || !a.type) {
        const d = this.def(a.id);
        const stage = d?.stages[a.stage];
        if (!d || !stage || stage.kind !== kind) continue;
        if (stage.target && target !== undefined && stage.target !== target) continue;
        if (stage.target && target === undefined) continue;
        a.progress += n;
        this.sim.bus.emit('quest:progress', { quest: a.id, stage: a.stage });
        if (a.progress >= stage.count) this.advance(a, d);
      } else if (!a.done && a.kind === kind) {
        if (a.target && a.target !== 'plank' && target !== undefined && a.target !== target) continue;
        if (a.target === 'plank' && target !== 'plank') continue;
        if (a.target && target === undefined) continue;
        a.progress += n;
        if (a.progress >= (a.need ?? 1)) this.finishDaily(a);
      }
    }
  }

  private advance(a: ActiveQuest, d: QuestDef): void {
    a.stage++;
    a.progress = 0;
    if (a.stage >= d.stages.length) {
      this.complete(a, d);
    } else {
      this.sim.bus.emit('notify', { text: `Next: ${d.stages[a.stage]!.text}`, kind: 'info' });
      this.checkRetro(a);
    }
  }

  private complete(a: ActiveQuest, d: QuestDef): void {
    const s = this.sim;
    this.q.active = this.q.active.filter((x) => x !== a);
    this.q.done.push(d.id);
    this.giveReward(d.reward, d.name);
    s.bus.emit('quest:done', { quest: d.id });
    s.bus.emit('notify', { text: `Quest complete: ${d.name} — ${d.outro}`, kind: 'good' });
    s.bus.emit('sfx', { name: 'level' });
  }

  giveReward(r: QuestDef['reward'], _name: string): void {
    const s = this.sim;
    if (r.money) s.econ.earn(r.money, 'quest');
    if (r.xp) s.addXp('woodcutting', r.xp);
    for (const [id, n] of Object.entries(r.items ?? {})) {
      s.inventory.add(id, n);
      s.bus.emit('notify', { text: `+${n}× ${itemName(id)}`, kind: 'good' });
    }
    if (r.axe) s.inventory.giveAxe(r.axe);
    if (r.rep) s.state.rep.hub = (s.state.rep.hub ?? 0) + r.rep;
  }

  // ---------------- dailies
  refreshDailies(): void {
    const st = this.sim.state;
    const day = Math.floor(st.time);
    const week = Math.floor(day / 7);
    if (this.q.dailyDay !== day) {
      this.q.active = this.q.active.filter((a) => a.type !== 'daily');
      this.q.dailyDay = day;
      this.q.dailyDone = 0;
      const rng = new Rng(st.seed + day * 31);
      const tier = this.playerTier();
      const pool = DAILY_TEMPLATES.filter((t) => t.type === 'daily');
      const picked = new Set<string>();
      while (picked.size < 3) picked.add(rng.pick(pool).id);
      for (const id of picked)
        this.q.active.push(
          this.makeDaily(
            pool.find((p) => p.id === id)!,
            rng,
            tier,
            `d${day}:${id}`,
            'daily',
          ),
        );
    }
    if (this.q.weeklyWeek !== week) {
      this.q.active = this.q.active.filter((a) => a.type !== 'weekly');
      this.q.weeklyWeek = week;
      const rng = new Rng(st.seed + week * 977);
      const pool = DAILY_TEMPLATES.filter((t) => t.type === 'weekly');
      const t = rng.pick(pool);
      this.q.active.push(this.makeDaily(t, rng, this.playerTier(), `w${week}:${t.id}`, 'weekly'));
    }
  }

  private playerTier(): number {
    const lvl = Math.max(1, Math.min(6, this.sim.shop.maxOwnedTier()));
    return lvl;
  }

  private makeDaily(
    t: (typeof DAILY_TEMPLATES)[number],
    rng: Rng,
    tier: number,
    id: string,
    type: 'daily' | 'weekly',
  ): ActiveQuest {
    const pool = WOODS.filter(
      (w) => w.weight > 0 && !w.guardianOnly && w.minTier <= tier + 1 && w.rarity !== 'mythic',
    );
    const wood = rng.pick(pool.length ? pool : WOODS.slice(0, 3));
    const need = Math.round(t.base + t.perTier * (tier - 1) + rng.range(0, t.base * 0.3));
    const reward = Math.round(
      t.reward * (1 + (tier - 1) * 1.1) * (t.kind === 'earn' ? 1 : 1) * (1 + wood.baseValue / 400),
    );
    return {
      id,
      stage: 0,
      progress: 0,
      name: type === 'daily' ? 'Daily' : 'Weekly',
      text: t.text(need, wood.name),
      kind: t.kind,
      target: t.target(wood.id),
      need,
      reward,
      type,
      done: false,
    };
  }

  private finishDaily(a: ActiveQuest): void {
    a.done = true;
    this.sim.econ.earn(a.reward ?? 0, 'quest');
    this.sim.addXp('woodcutting', Math.round((a.reward ?? 0) / 10));
    this.sim.state.rep.hub = (this.sim.state.rep.hub ?? 0) + 1;
    this.q.dailyDone++;
    this.sim.bus.emit('notify', { text: `${a.name} done: ${a.text}  +$${a.reward}`, kind: 'money' });
    this.sim.bus.emit('quest:done', { quest: a.id });
  }

  /** Text for the HUD tracker. */
  tracker(): { title: string; text: string; progress: string }[] {
    const out: { title: string; text: string; progress: string }[] = [];
    for (const a of this.q.active) {
      if (a.type === 'story') {
        const d = this.def(a.id);
        const stage = d?.stages[a.stage];
        if (d && stage)
          out.push({
            title: d.name,
            text: stage.text,
            progress: stage.count > 1 ? `${Math.min(a.progress, stage.count)}/${stage.count}` : '',
          });
      }
    }
    for (const a of this.q.active)
      if ((a.type === 'daily' || a.type === 'weekly') && !a.done && out.length < 3)
        out.push({
          title: a.name ?? '',
          text: a.text ?? '',
          progress: `${Math.floor(a.progress)}/${a.need}`,
        });
    return out;
  }
}

// FRONTLINE 롤식 라인전 — 시뮬레이션. 화면·입력과 무관하게 순수 데이터만 다룹니다(20틱/초).
import { TICK } from '../config';
import { Pather } from '../path';
import {
  CHAMPS, ITEMS, LANES, MAX_ITEMS, MAX_LEVEL, MONSTERS, NEXUS, SIZE, WAVE_EVERY, WAVE_FIRST, lanePath, turretSpots, xpNeed,
  type ChampId, type ItemId, type Lane, type MonsterKind, type Pt, type SkillDef,
} from './config';
import { buildMobaMap, type MobaMap } from './map';

export type EntKind = 'hero' | 'melee' | 'caster' | 'siege' | 'turret' | 'nexus' | 'monster';
export type OrderT = 'idle' | 'move' | 'attack' | 'amove';
export interface Hero {
  champ: ChampId; level: number; xp: number; gold: number; mp: number; maxmp: number; ready: number[]; items: ItemId[];
  kills: number; deaths: number; assists: number; cs: number; dead: boolean; respawnAt: number; recall: number; bot: boolean; lane: Lane;
  o: { t: OrderT; x: number; y: number; target: number }; steal: number; haste: number; castAt: number; castIdx: number;
  slowUntil: number; slow: number; stunUntil: number; shield: number; shieldUntil: number; aspdUntil: number; aspd: number; speedUntil: number; speedUp: number; name: string;
}
export interface Ent {
  id: number; kind: EntKind; team: number; x: number; y: number; hp: number; maxhp: number; dmg: number; range: number; cd: number; cdMax: number; speed: number; def: number; radius: number;
  lane: Lane | ''; wp: number; home: Pt; target: number; path: number[]; pi: number; repath: number; fx: number; fy: number; hurt: number; fired: number; sub: string; spawnAt: number;
  slowUntil: number; slow: number; stunUntil: number; hero: Hero | null; tier: number; camp: string; lastHit: Map<number, number>; threat: number;
}
export interface Team { kills: number; towers: number; drakes: number; baronUntil: number; gold: number }
export type Cmd =
  | { k: 'move'; x: number; y: number } | { k: 'amove'; x: number; y: number } | { k: 'attack'; target: number } | { k: 'stop' }
  | { k: 'cast'; i: number; x: number; y: number } | { k: 'buy'; item: ItemId } | { k: 'recall' } | { k: 'surrender' };
export type SimEvent =
  | { t: 'shot'; from: number; x0: number; y0: number; x1: number; y1: number; team: number; ranged: boolean }
  | { t: 'bolt'; x0: number; y0: number; x1: number; y1: number; team: number; wide: number }
  | { t: 'blast'; x: number; y: number; r: number; team: number }
  | { t: 'dash'; x0: number; y0: number; x1: number; y1: number; team: number }
  | { t: 'buff'; id: number; team: number }
  | { t: 'dmg'; id: number; x: number; y: number; amt: number; team: number }
  | { t: 'die'; kind: EntKind; team: number; x: number; y: number; id: number }
  | { t: 'kill'; killer: number; victim: number; team: number }
  | { t: 'level'; id: number }
  | { t: 'recall'; id: number }
  | { t: 'announce'; text: string; team: number };

const sq = (v: number): number => v * v;
const idleOrder = (): Hero['o'] => ({ t: 'idle', x: 0, y: 0, target: 0 });
const BASE_RADIUS = 8;

export class MobaSim {
  tick = 0; winner = -1; nextId = 1; readonly map: MobaMap; readonly grid: Uint8Array; readonly pather: Pather;
  ents: Ent[] = []; index = new Map<number, Ent>(); teams: Team[] = [0, 1].map(() => ({ kills: 0, towers: 0, drakes: 0, baronUntil: 0, gold: 0 }));
  events: SimEvent[] = []; record = true; private wave = 0; private camps = new Map<string, { at: Pt; due: number; ids: number[]; defs: Array<{ k: MonsterKind; dx: number; dy: number }> }>();
  readonly heroIds: number[] = [];

  constructor(readonly setup: { player: ChampId; lane: Lane; allies: Array<{ champ: ChampId; lane: Lane }>; foes: Array<{ champ: ChampId; lane: Lane }>; goldMul?: number } = { player: 'blade', lane: 'mid', allies: [{ champ: 'arcana', lane: 'top' }, { champ: 'ranger', lane: 'bot' }], foes: [{ champ: 'blade', lane: 'top' }, { champ: 'arcana', lane: 'mid' }, { champ: 'ranger', lane: 'bot' }] }) {
    this.map = buildMobaMap(); this.grid = new Uint8Array(this.map.terrain); this.pather = new Pather(SIZE, this.grid);
    for (let t = 0; t < 2; t++) {
      const nx = this.add('nexus', t, NEXUS[t].x, NEXUS[t].y); nx.sub = 'nexus';
      for (const lane of LANES) turretSpots(lane, t).forEach((p, i) => { const e = this.add('turret', t, p.x, p.y); e.lane = lane; e.tier = i; e.sub = `${lane}${i}`; });
    }
    // 첫 번째 영웅(heroIds[0])이 내가 조종하는 챔피언이고 나머지는 봇입니다.
    this.addHero(0, this.setup.player, this.setup.lane, false, 0);
    this.setup.allies.forEach((r, i) => this.addHero(0, r.champ, r.lane, true, i + 1)); this.setup.foes.forEach((r, i) => this.addHero(1, r.champ, r.lane, true, i));
    for (const c of this.map.camps) this.camps.set(c.id, { at: c.at, due: this.tick, ids: [], defs: c.mobs });
    for (const [id, c] of this.camps) { const first = Math.min(...c.defs.map(d => MONSTERS[d.k].first)); c.due = Math.round(first * TICK); void id; }
    this.recount();
  }

  // ---------- 조회 ----------
  get(id: number): Ent | undefined { return this.index.get(id); }
  me(): Ent { return this.ents.find(e => e.id === this.heroIds[0])!; }
  dist(a: { x: number; y: number }, b: { x: number; y: number }): number { return Math.hypot(a.x - b.x, a.y - b.y); }
  emit(e: SimEvent): void { if (this.record) { this.events.push(e); if (this.events.length > 1200) this.events.splice(0, 400); } }
  drain(): SimEvent[] { const e = this.events; this.events = []; return e; }
  heroes(team?: number): Ent[] { return this.ents.filter(e => e.hero && (team === undefined || e.team === team)); }
  private recount(): void { for (let t = 0; t < 2; t++) this.teams[t].towers = this.ents.filter(e => e.team === t && e.kind === 'turret' && e.hp > 0).length; }

  // ---------- 생성 ----------
  private add(kind: EntKind, team: number, x: number, y: number): Ent {
    const S: Record<string, Partial<Ent>> = {
      nexus: { maxhp: 4500, radius: 2.4, def: 20 }, turret: { maxhp: 2200, dmg: 95, range: 8.6, cdMax: 24, radius: 1.1, def: 25 },
      melee: { maxhp: 470, dmg: 14, range: 1.4, cdMax: 20, speed: 2.9, radius: 0.45, def: 0 }, caster: { maxhp: 340, dmg: 22, range: 5.2, cdMax: 26, speed: 2.9, radius: 0.4, def: 0 },
      siege: { maxhp: 880, dmg: 40, range: 6.2, cdMax: 34, speed: 2.6, radius: 0.6, def: 10 }, hero: { radius: 0.6 }, monster: { radius: 0.6 },
    };
    const b = S[kind] ?? {};
    const e: Ent = { id: this.nextId++, kind, team, x, y, hp: b.maxhp ?? 1, maxhp: b.maxhp ?? 1, dmg: b.dmg ?? 0, range: b.range ?? 0, cd: 0, cdMax: b.cdMax ?? 20, speed: b.speed ?? 0, def: b.def ?? 0, radius: b.radius ?? 0.5, lane: '', wp: 0, home: { x, y }, target: 0, path: [], pi: 0, repath: 0, fx: team === 0 ? 1 : -1, fy: 0, hurt: -99, fired: -99, sub: '', spawnAt: 0, slowUntil: 0, slow: 0, stunUntil: 0, hero: null, tier: 0, camp: '', lastHit: new Map(), threat: 0 };
    this.ents.push(e); this.index.set(e.id, e); return e;
  }
  private addHero(team: number, champ: ChampId, lane: Lane, bot: boolean, slot: number): Ent {
    const d = CHAMPS[champ], n = NEXUS[team], e = this.add('hero', team, n.x + (team === 0 ? 3 : -3) + slot * 0.6, n.y + (team === 0 ? -3 : 3));
    e.sub = champ; e.lane = lane;
    e.hero = { champ, level: 1, xp: 0, gold: 500, mp: d.mp, maxmp: d.mp, ready: [0, 0, 0, 0], items: [], kills: 0, deaths: 0, assists: 0, cs: 0, dead: false, respawnAt: 0, recall: 0, bot, lane, o: idleOrder(), steal: 0, haste: 0, castAt: -99, castIdx: -1, slowUntil: 0, slow: 0, stunUntil: 0, shield: 0, shieldUntil: 0, aspdUntil: 0, aspd: 0, speedUntil: 0, speedUp: 0, name: d.name };
    this.heroIds.push(e.id); this.recalc(e, true); return e;
  }
  /** 레벨·아이템에 따른 능력치를 다시 계산합니다. */
  recalc(e: Ent, fill = false): void {
    const h = e.hero!, d = CHAMPS[h.champ], L = h.level - 1; let ad = d.ad + d.adUp * L, def = d.def + d.defUp * L, hp = d.hp + d.hpUp * L, mp = d.mp + d.mpUp * L, sp = d.speed; h.steal = 0; h.haste = 0;
    for (const id of h.items) { const it = ITEMS[id]; ad += it.ad ?? 0; def += it.def ?? 0; hp += it.hp ?? 0; mp += it.mp ?? 0; sp += it.speed ?? 0; h.steal += it.steal ?? 0; h.haste += it.haste ?? 0; }
    const ratio = e.maxhp > 0 && !fill ? e.hp / e.maxhp : 1; e.maxhp = Math.round(hp); e.hp = Math.round(e.maxhp * ratio); e.dmg = ad; e.def = def; e.speed = sp; e.range = d.range; e.cdMax = d.cd; h.maxmp = Math.round(mp); h.mp = fill ? h.maxmp : Math.min(h.mp, h.maxmp);
  }

  // ---------- 규칙 ----------
  skill(e: Ent, i: number): SkillDef { return CHAMPS[e.hero!.champ].skills[i]; }
  fountain(team: number): Pt { return NEXUS[team]; }
  inBase(e: Ent): boolean { return this.dist(e, NEXUS[e.team]) < BASE_RADIUS; }
  canBuy(e: Ent, item: ItemId): boolean { const h = e.hero; return !!h && (this.inBase(e) || h.dead) && h.items.length < MAX_ITEMS && h.gold >= ITEMS[item].cost; }
  /** 이 대상을 지금 때릴 수 있는가(안쪽 포탑·넥서스는 바깥 포탑이 무너져야 열립니다). */
  vulnerable(t: Ent): boolean {
    if (t.hp <= 0) return false;
    if (t.kind === 'turret') return t.tier === 0 || !this.ents.some(o => o.kind === 'turret' && o.team === t.team && o.lane === t.lane && o.tier === t.tier - 1 && o.hp > 0);
    if (t.kind === 'nexus') return LANES.some(l => !this.ents.some(o => o.kind === 'turret' && o.team === t.team && o.lane === l && o.tier === 2 && o.hp > 0));
    if (t.hero?.dead) return false;
    return true;
  }
  foe(a: Ent, t: Ent): boolean { return t.hp > 0 && t.team !== a.team && !(t.hero?.dead) ; }
  private stunned(e: Ent): boolean { return this.tick < (e.hero ? e.hero.stunUntil : e.stunUntil); }
  speedOf(e: Ent): number {
    const h = e.hero; let k = 1;
    const slow = h ? (this.tick < h.slowUntil ? h.slow : 0) : (this.tick < e.slowUntil ? e.slow : 0); k -= slow;
    if (h && this.tick < h.speedUntil) k += h.speedUp; return e.speed * Math.max(0.3, k);
  }
  cdOf(e: Ent): number { const h = e.hero; if (!h) return e.cdMax; return Math.max(6, Math.round(e.cdMax / (1 + h.haste + (this.tick < h.aspdUntil ? h.aspd : 0)))); }
  private baron(team: number): boolean { return this.tick < this.teams[team].baronUntil; }

  // ---------- 명령 ----------
  apply(heroId: number, c: Cmd): boolean {
    const e = this.get(heroId), h = e?.hero; if (!e || !h || this.winner !== -1 || typeof c !== 'object' || c === null) return false;
    if (c.k === 'surrender') { this.finish(1 - e.team); return true; }
    if (h.dead) { if (c.k === 'buy') return this.buy(e, c.item); return false; }
    const clamp = (v: number): number => Math.min(Math.max(v, 1.5), SIZE - 1.5);
    switch (c.k) {
      case 'move': case 'amove': if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) return false; this.cancelRecall(e); h.o = { t: c.k, x: clamp(c.x), y: clamp(c.y), target: 0 }; e.path = []; e.pi = 0; return true;
      case 'attack': { const t = this.get(c.target); if (!t || !this.foe(e, t)) return false; this.cancelRecall(e); h.o = { t: 'attack', x: 0, y: 0, target: t.id }; e.path = []; return true; }
      case 'stop': h.o = idleOrder(); e.path = []; return true;
      case 'cast': return this.cast(e, c.i, c.x, c.y);
      case 'buy': return this.buy(e, c.item);
      case 'recall': if (h.recall > 0) { this.cancelRecall(e); return true; } if (this.inBase(e)) return false; h.recall = TICK * 4; h.o = idleOrder(); e.path = []; this.emit({ t: 'recall', id: e.id }); return true;
    }
    return false;
  }
  private cancelRecall(e: Ent): void { if (e.hero) e.hero.recall = 0; }
  private buy(e: Ent, item: ItemId): boolean {
    const h = e.hero!; if (!ITEMS[item] || !this.canBuy(e, item)) return false;
    h.gold -= ITEMS[item].cost; h.items.push(item); this.recalc(e); return true;
  }

  // ---------- 스킬 ----------
  private cast(e: Ent, i: number, tx: number, ty: number): boolean {
    const h = e.hero!; if (!Number.isInteger(i) || i < 0 || i > 3 || !Number.isFinite(tx) || !Number.isFinite(ty) || this.stunned(e)) return false;
    const k = this.skill(e, i); if (h.level < k.level || this.tick < h.ready[i] || h.mp < k.mana) return false;
    let dx = tx - e.x, dy = ty - e.y; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    h.mp -= k.mana; h.ready[i] = this.tick + k.cd; h.castAt = this.tick; h.castIdx = i; this.cancelRecall(e); e.fx = dx; e.fy = dy;
    const power = (k.dmg ?? 0) + (k.ratio ?? 0) * e.dmg + h.level * 4;
    const mult = this.baron(e.team) ? 1.2 : 1 + 0.08 * Math.min(4, this.teams[e.team].drakes);
    const strike = (cx: number, cy: number, r: number): void => {
      for (const t of this.ents) {
        if (!this.foe(e, t) || !this.vulnerable(t)) continue;
        if (Math.hypot(t.x - cx, t.y - cy) > r + t.radius) continue;
        if (k.dmg) this.hurt(e, t, power * mult);
        if (k.slow) this.slowEnt(t, k.slow, k.dur ?? TICK * 2); if (k.stun) this.stunEnt(t, k.stun);
      }
    };
    if (k.kind === 'shot') {
      const reach = k.range, wid = k.width ?? 1; let best: Ent | null = null, bt = Infinity;
      for (const t of this.ents) {
        if (!this.foe(e, t) || !this.vulnerable(t)) continue;
        const px = t.x - e.x, py = t.y - e.y, along = px * dx + py * dy; if (along < 0 || along > reach + t.radius) continue;
        if (Math.abs(px * dy - py * dx) > wid + t.radius) continue; if (along < bt) { bt = along; best = t; }
      }
      const end = best ? { x: best.x, y: best.y } : { x: e.x + dx * reach, y: e.y + dy * reach };
      this.emit({ t: 'bolt', x0: e.x, y0: e.y, x1: end.x, y1: end.y, team: e.team, wide: wid }); if (best) { this.hurt(e, best, power * mult); if (k.slow) this.slowEnt(best, k.slow, k.dur ?? TICK * 2); }
    } else if (k.kind === 'aoe') {
      const d = Math.min(k.range, dl), cx = k.range === 0 ? e.x : e.x + dx * d, cy = k.range === 0 ? e.y : e.y + dy * d;
      this.emit({ t: 'blast', x: cx, y: cy, r: k.radius ?? 3, team: e.team }); strike(cx, cy, k.radius ?? 3);
    } else if (k.kind === 'dash') {
      const want = Math.min(k.range, dl); let d = 0; const step = 0.4;
      for (; d < want; d += step) { if (!this.pather.freeAt(e.x + dx * (d + step), e.y + dy * (d + step))) break; }
      const nx = e.x + dx * d, ny = e.y + dy * d; this.emit({ t: 'dash', x0: e.x, y0: e.y, x1: nx, y1: ny, team: e.team }); e.x = nx; e.y = ny; e.path = []; h.o = idleOrder();
      if (k.radius) { this.emit({ t: 'blast', x: nx, y: ny, r: k.radius, team: e.team }); strike(nx, ny, k.radius); }
    } else {
      if (k.shield) { h.shield = k.shield + (k.ratio ?? 0) * e.dmg; h.shieldUntil = this.tick + (k.dur ?? TICK * 3); }
      if (k.aspd) { h.aspd = k.aspd; h.aspdUntil = this.tick + (k.dur ?? TICK * 3); }
      if (k.speed) { h.speedUp = k.speed; h.speedUntil = this.tick + (k.dur ?? TICK * 3); }
      this.emit({ t: 'buff', id: e.id, team: e.team });
    }
    return true;
  }
  private slowEnt(t: Ent, k: number, dur: number): void { if (t.hero) { t.hero.slow = Math.max(this.tick < t.hero.slowUntil ? t.hero.slow : 0, k); t.hero.slowUntil = this.tick + dur; } else { t.slow = k; t.slowUntil = this.tick + dur; } }
  private stunEnt(t: Ent, dur: number): void { if (t.hero) t.hero.stunUntil = Math.max(t.hero.stunUntil, this.tick + dur); else t.stunUntil = Math.max(t.stunUntil, this.tick + dur); }

  // ---------- 피해·보상 ----------
  hurt(src: Ent | null, t: Ent, raw: number): void {
    if (t.hp <= 0 || !this.vulnerable(t)) return;
    let amt = raw * 100 / (100 + t.def); const h = t.hero;
    if (h && h.shield > 0 && this.tick < h.shieldUntil) { const take = Math.min(h.shield, amt); h.shield -= take; amt -= take; }
    amt = Math.max(0, Math.round(amt)); t.hp -= amt; t.hurt = this.tick; if (src) t.lastHit.set(src.id, this.tick);
    if (amt > 0) this.emit({ t: 'dmg', id: t.id, x: t.x, y: t.y, amt, team: t.team });
    if (src?.hero && src.hero.steal > 0 && amt > 0) src.hp = Math.min(src.maxhp, src.hp + amt * src.hero.steal);
    // 챔피언을 때린 챔피언은 포탑·미니언의 우선 표적이 됩니다.
    if (src?.hero && h) { t.threat = this.tick; }
    if (t.hp <= 0) this.die(t, src);
  }
  private die(t: Ent, src: Ent | null): void {
    t.hp = 0; this.emit({ t: 'die', kind: t.kind, team: t.team, x: t.x, y: t.y, id: t.id });
    if (t.kind === 'nexus') { this.finish(1 - t.team); return; }
    const foe = 1 - t.team, killerTeam = src && src.team !== t.team && src.team < 2 ? src.team : t.team === 2 ? -1 : foe;
    const near = (r: number, team: number): Ent[] => this.ents.filter(e => e.hero && e.team === team && !e.hero.dead && this.dist(e, t) < r);
    if (t.hero) {
      const h = t.hero; h.dead = true; h.deaths++; h.recall = 0; h.o = idleOrder(); h.respawnAt = this.tick + Math.min(50, 8 + 2.6 * h.level) * TICK;
      if (src) { const killer = src.hero ? src : this.ents.find(e => e.hero && t.lastHit.has(e.id) && this.tick - (t.lastHit.get(e.id) ?? -999) < 5 * TICK && e.team === foe) ?? null;
        const gold = 300 + 25 * h.level; if (killer?.hero) { killer.hero.kills++; killer.hero.gold += gold; this.addXp(killer, 100 + 25 * h.level); }
        for (const [id, at] of t.lastHit) { const a = this.get(id); if (a?.hero && a !== killer && a.team === foe && this.tick - at < 8 * TICK) { a.hero.assists++; a.hero.gold += 120; this.addXp(a, 50); } }
        this.teams[foe].kills++; this.emit({ t: 'kill', killer: killer?.id ?? src.id, victim: t.id, team: foe });
      }
      return;
    }
    if (t.kind === 'turret') {
      for (const a of near(60, foe)) a.hero!.gold += 130; this.recount(); this.emit({ t: 'announce', text: `${foe === 0 ? '청군' : '적군'}이 포탑을 파괴했습니다`, team: foe });
      if (src?.hero) src.hero.gold += 120; return;
    }
    const finisher = src?.hero ? src : this.ents.find(e => e.hero && e.team === killerTeam && t.lastHit.has(e.id) && this.tick - (t.lastHit.get(e.id) ?? -999) < 4 * TICK) ?? null;
    if (t.kind === 'monster') {
      const d = MONSTERS[t.sub as MonsterKind]; if (!d) return;
      const who = finisher;
      if (who?.hero) { who.hero.gold += d.gold; this.addXp(who, d.xp); who.hero.cs++; }
      if (t.sub === 'drake' && who) { this.teams[who.team].drakes++; this.emit({ t: 'announce', text: `${who.team === 0 ? '청군' : '적군'}이 화염 드래곤을 처치했습니다 (공격력 +8%)`, team: who.team }); }
      if (t.sub === 'baron' && who) { this.teams[who.team].baronUntil = this.tick + 120 * TICK; this.emit({ t: 'announce', text: `${who.team === 0 ? '청군' : '적군'}이 심연의 군주를 처치했습니다 (2분간 강화)`, team: who.team }); }
      const c = this.camps.get(t.camp); if (c) c.ids = c.ids.filter(i => i !== t.id); if (c && !c.ids.length) c.due = this.tick + Math.round(Math.max(...c.defs.map(m => MONSTERS[m.k].respawn)) * TICK);
      return;
    }
    // 미니언
    const gold = t.kind === 'siege' ? 55 : t.kind === 'caster' ? 17 : 21, xp = t.kind === 'siege' ? 70 : t.kind === 'caster' ? 32 : 58;
    if (finisher?.hero) { finisher.hero.gold += gold; finisher.hero.cs++; }
    const share = near(14, foe); for (const a of share) this.addXp(a, Math.round(xp * (share.length > 1 ? 1.2 : 1) / share.length));
  }
  addXp(e: Ent, amt: number): void {
    const h = e.hero; if (!h || h.level >= MAX_LEVEL) return; h.xp += amt;
    while (h.level < MAX_LEVEL && h.xp >= xpNeed(h.level)) { h.xp -= xpNeed(h.level); h.level++; this.recalc(e); e.hp = Math.min(e.maxhp, e.hp + CHAMPS[h.champ].hpUp); this.emit({ t: 'level', id: e.id }); }
  }
  private finish(w: number): void { this.winner = w; }

  // ---------- 틱 ----------
  step(): void {
    if (this.winner !== -1) return;
    this.tick++;
    this.spawnWaves(); this.spawnCamps();
    for (const e of this.ents) { if (e.hp <= 0 && !e.hero) continue; if (e.cd > 0) e.cd--; if (e.repath > 0) e.repath--; this.update(e); }
    this.separate();
    const dead = this.ents.filter(e => e.hp <= 0 && !e.hero && e.kind !== 'nexus');
    if (dead.length) { for (const e of dead) { this.index.delete(e.id); } this.ents = this.ents.filter(e => !dead.includes(e)); }
    if (this.tick % TICK === 0) this.perSecond();
  }
  private perSecond(): void {
    for (const e of this.ents) {
      const h = e.hero; if (!h || h.dead) continue; h.gold += 2.2; const inb = this.inBase(e);
      if (e.hp < e.maxhp) e.hp = Math.min(e.maxhp, e.hp + (inb ? e.maxhp * 0.09 : 1.5 + e.maxhp * 0.004 + (this.baron(e.team) ? e.maxhp * 0.01 : 0)));
      if (h.mp < h.maxmp) h.mp = Math.min(h.maxmp, h.mp + (inb ? h.maxmp * 0.12 : 2 + h.maxmp * 0.01));
    }
  }
  private spawnWaves(): void {
    if (this.tick < WAVE_FIRST || (this.tick - WAVE_FIRST) % WAVE_EVERY !== 0) return;
    const n = this.wave++;
    for (let team = 0; team < 2; team++) for (const lane of LANES) {
      const comp: Array<'melee' | 'caster' | 'siege'> = ['melee', 'melee', 'melee', 'caster', 'caster']; if (n % 3 === 2 && n >= 2) comp.push('siege');
      const path = lanePath(lane, team);
      comp.forEach((k, i) => {
        const e = this.add(k, team, path[0].x, path[0].y); e.lane = lane; e.wp = 1; e.spawnAt = this.tick + i * 10; e.sub = k;
        const grow = 1 + 0.035 * n, b = this.baron(team) ? 1.3 : 1; e.maxhp = Math.round(e.maxhp * grow * b); e.hp = e.maxhp; e.dmg = Math.round(e.dmg * (1 + 0.03 * n)); e.x += (e.id % 3 - 1) * 0.5; e.y += (e.id % 2 - 0.5) * 0.5;
      });
    }
  }
  private spawnCamps(): void {
    for (const [id, c] of this.camps) {
      if (c.ids.length || this.tick < c.due) continue;
      for (const m of c.defs) { const d = MONSTERS[m.k], e = this.add('monster', 2, c.at.x + m.dx, c.at.y + m.dy); e.sub = m.k; e.camp = id; e.maxhp = d.hp; e.hp = d.hp; e.dmg = d.dmg; e.range = d.range; e.cdMax = d.cd; e.speed = d.speed; e.radius = d.radius; c.ids.push(e.id); }
    }
  }

  private update(e: Ent): void {
    switch (e.kind) {
      case 'hero': this.updateHero(e); break;
      case 'turret': this.updateTurret(e); break;
      case 'nexus': this.updateNexus(e); break;
      case 'monster': this.updateMonster(e); break;
      default: this.updateMinion(e);
    }
  }

  /** 적 후보 중 가장 알맞은 표적. 미니언 → 포탑 → 챔피언 순으로 값을 매깁니다. */
  private pick(e: Ent, range: number, pref: 'minion' | 'hero' | 'any' = 'minion'): Ent | null {
    let best: Ent | null = null, bs = Infinity;
    for (const t of this.ents) {
      if (t.team === e.team || t.hp <= 0 || t.team === 2 && e.team === 2 || t.hero?.dead || !this.vulnerable(t)) continue;
      if (e.team !== 2 && t.team === 2 && !(e.hero)) continue;
      const d = this.dist(e, t) - t.radius; if (d > range) continue;
      let s = d; const isMin = t.kind === 'melee' || t.kind === 'caster' || t.kind === 'siege';
      if (pref === 'minion') s += isMin ? 0 : t.kind === 'hero' ? (this.tick - t.threat < 2 * TICK ? -2 : 4) : 2;
      else if (pref === 'hero') s += t.hero ? 0 : isMin ? 3 : 5; else s += t.hero ? -1 : 0;
      if (s < bs) { bs = s; best = t; }
    }
    return best;
  }
  private attack(e: Ent, t: Ent): void {
    const h = e.hero, mult = h && (this.baron(e.team) ? 1.2 : 1 + 0.08 * Math.min(4, this.teams[e.team].drakes)) || 1; e.cd = this.cdOf(e); e.fired = this.tick;
    const dx = t.x - e.x, dy = t.y - e.y, l = Math.hypot(dx, dy) || 1; e.fx = dx / l; e.fy = dy / l;
    this.emit({ t: 'shot', from: e.id, x0: e.x, y0: e.y, x1: t.x, y1: t.y, team: e.team, ranged: e.range > 2.5 });
    let d = e.dmg * mult; if (e.kind === 'turret' && t.hero) d *= 1.1; if (e.kind === 'siege' && (t.kind === 'turret')) d *= 2.2; if ((e.kind === 'melee' || e.kind === 'caster') && t.kind === 'turret') d *= 0.4;
    this.hurt(e, t, d);
  }

  private walkTo(e: Ent, gx: number, gy: number, tol: number): boolean {
    if (this.dist(e, { x: gx, y: gy }) <= tol) return true;
    if (e.path.length === 0 || e.repath <= 0) { e.path = this.pather.find(e.x, e.y, gx, gy) ?? [gx, gy]; e.pi = 0; e.repath = 16; }
    let left = this.speedOf(e) / TICK;
    while (left > 0 && e.pi * 2 < e.path.length) {
      const tx = e.path[e.pi * 2], ty = e.path[e.pi * 2 + 1], dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
      if (d <= left) { this.shift(e, dx, dy); left -= d; e.pi++; } else { this.shift(e, dx / d * left, dy / d * left); left = 0; }
      if (d > 0.001) { e.fx = dx / d; e.fy = dy / d; }
    }
    return this.dist(e, { x: gx, y: gy }) <= tol;
  }
  private shift(e: Ent, dx: number, dy: number): void { const nx = e.x + dx, ny = e.y + dy; if (this.pather.freeAt(nx, e.y)) e.x = nx; if (this.pather.freeAt(e.x, ny)) e.y = ny; }
  /** 길목 위에서는 벽을 신경 쓰지 않고 곧장 걷습니다. */
  private stride(e: Ent, gx: number, gy: number): void {
    const dx = gx - e.x, dy = gy - e.y, d = Math.hypot(dx, dy) || 1, k = Math.min(d, this.speedOf(e) / TICK); e.x += dx / d * k; e.y += dy / d * k; e.fx = dx / d; e.fy = dy / d;
  }

  private updateMinion(e: Ent): void {
    if (this.tick < e.spawnAt) return; if (this.tick < e.stunUntil) return;
    const t = this.pick(e, e.kind === 'siege' ? 7 : 6.2, 'minion');
    if (t) {
      if (this.dist(e, t) - t.radius <= e.range) { if (e.cd <= 0) this.attack(e, t); return; }
      this.stride(e, t.x, t.y); return;
    }
    const path = lanePath(e.lane as Lane, e.team); const p = path[Math.min(e.wp, path.length - 1)];
    if (this.dist(e, p) < 1.4 && e.wp < path.length - 1) e.wp++;
    const off = ((e.id % 3) - 1) * 0.7; this.stride(e, p.x + off, p.y - off);
  }
  private updateTurret(e: Ent): void {
    if (e.cd > 0) return; const t = this.pick(e, e.range, 'minion'); if (t && t.team !== 2) this.attack(e, t);
  }
  private updateNexus(e: Ent): void {
    if (this.tick % 10 !== 0) return;
    for (const h of this.ents) { if (!h.hero || h.hero.dead || this.dist(h, e) > BASE_RADIUS) continue; if (h.team !== e.team) this.hurt(e, h, 700); }
  }
  private updateMonster(e: Ent): void {
    if (this.tick < e.stunUntil) return;
    const d = MONSTERS[e.sub as MonsterKind], t = e.target ? this.get(e.target) : null;
    if (t && t.hp > 0 && !t.hero?.dead && this.dist(e, e.home) < 15 && this.dist(e, t) < 20) {
      if (this.dist(e, t) - t.radius <= e.range) { if (e.cd <= 0) { e.cd = e.cdMax; e.fired = this.tick; this.emit({ t: 'shot', from: e.id, x0: e.x, y0: e.y, x1: t.x, y1: t.y, team: 2, ranged: e.range > 2.5 }); this.hurt(e, t, e.dmg); } }
      else this.walkTo(e, t.x, t.y, e.range * 0.8); return;
    }
    e.target = 0;
    // 맞은 적이 있으면 반격합니다.
    if (this.tick - e.hurt < 40 && this.dist(e, e.home) < 14) { let best: Ent | null = null, bt = -1; for (const [id, at] of e.lastHit) { const a = this.get(id); if (a && a.hp > 0 && at > bt && !a.hero?.dead) { bt = at; best = a; } } if (best) { e.target = best.id; return; } }
    if (this.dist(e, e.home) > 0.6) { this.walkTo(e, e.home.x, e.home.y, 0.4); e.hp = Math.min(e.maxhp, e.hp + e.maxhp * 0.02); } else e.hp = Math.min(e.maxhp, e.hp + e.maxhp / TICK / 20);
    if (d && e.hp < e.maxhp && this.tick - e.hurt > 140) e.lastHit.clear();
  }

  private updateHero(e: Ent): void {
    const h = e.hero!;
    if (h.dead) { if (this.tick >= h.respawnAt) { h.dead = false; const n = NEXUS[e.team]; e.x = n.x + (e.team === 0 ? 3 : -3); e.y = n.y + (e.team === 0 ? -3 : 3); e.hp = e.maxhp; h.mp = h.maxmp; e.path = []; } return; }
    if (this.stunned(e)) return;
    if (h.recall > 0) {
      if (this.tick - e.hurt < 4) h.recall = 0;
      else if (--h.recall <= 0) { const n = NEXUS[e.team]; e.x = n.x + (e.team === 0 ? 3 : -3); e.y = n.y + (e.team === 0 ? -3 : 3); e.path = []; h.o = idleOrder(); }
      return;
    }
    const o = h.o; let t: Ent | null = null;
    if (o.t === 'attack') { t = this.get(o.target) ?? null; if (!t || t.hp <= 0 || t.hero?.dead || !this.vulnerable(t) || this.dist(e, t) > 22) { h.o = idleOrder(); t = null; } }
    else if (o.t === 'amove' || (o.t === 'idle' && !h.bot)) t = this.pick(e, o.t === 'amove' ? e.range + 3 : e.range, o.t === 'amove' ? 'any' : 'minion');
    if (t) {
      const gap = this.dist(e, t) - t.radius;
      if (gap <= e.range) { e.path = []; if (e.cd <= 0) { h.recall = 0; this.attack(e, t); } return; }
      if (o.t === 'attack' || o.t === 'amove') { this.walkTo(e, t.x, t.y, e.range * 0.9 + t.radius); return; }
    }
    if (o.t === 'move' || o.t === 'amove') { if (this.walkTo(e, o.x, o.y, 0.3)) h.o = idleOrder(); }
  }

  /** 겹친 유닛을 밀어냅니다. */
  private separate(): void {
    const us = this.ents.filter(e => e.hp > 0 && e.kind !== 'turret' && e.kind !== 'nexus' && !(e.hero?.dead)), n = us.length;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = us[i], b = us[j]; if (a.team === 2 && b.team === 2) continue; const min = a.radius + b.radius, dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy; if (d2 >= sq(min) || d2 > 100) continue;
      const d = Math.sqrt(d2) || 0.001, push = (min - d) * 0.3, nx = d2 < 1e-6 ? 1 : dx / d, ny = d2 < 1e-6 ? 0 : dy / d;
      this.shift(a, -nx * push, -ny * push); this.shift(b, nx * push, ny * push);
    }
  }
}

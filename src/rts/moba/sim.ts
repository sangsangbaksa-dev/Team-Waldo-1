// FRONTLINE 롤식 라인전 — 시뮬레이션. 화면·입력과 무관하게 순수 데이터만 다룹니다(20틱/초).
import { TICK } from '../config';
import { Pather } from '../path';
import {
  BUFF_TIME, BUSHES, CHAMPS, INHIB_RESPAWN, ITEMS, LANES, MAX_ITEMS, MAX_LEVEL, MONSTERS, NEXUS, RUNES, SIZE, SPELLS, WAVE_EVERY, WAVE_FIRST, inhibSpot, lanePath, turretSpots, xpNeed,
  type ChampId, type ItemId, type Lane, type MonsterKind, type Pt, type Role, type RuneId, type SkillDef, type SpellId,
} from './config';
import { buildMobaMap, type MobaMap } from './map';

export type EntKind = 'hero' | 'melee' | 'caster' | 'siege' | 'super' | 'turret' | 'inhib' | 'nexus' | 'monster';
export const isMinion = (k: EntKind): boolean => k === 'melee' || k === 'caster' || k === 'siege' || k === 'super';
export const isStructure = (k: EntKind): boolean => k === 'turret' || k === 'inhib' || k === 'nexus';
export type PingKind = 'danger' | 'assist' | 'retreat';
export interface Ward { id: number; team: number; x: number; y: number; until: number; owner: number }
export interface Ping { team: number; x: number; y: number; kind: PingKind; at: number; by: number }
export interface HeroSetup { champ: ChampId; lane: Role; spells?: [SpellId, SpellId]; rune?: RuneId }
const SWEEP_RANGE = 4.5, SWEEP_GOLD = 30, BUSH_REVEAL = 1.6, WARD_LIFE = 90, WARD_RANGE = 9, WARD_MAX = 2, WARD_RECHARGE = 35, SIGHT = { hero: 11, minion: 7, turret: 11, inhib: 8, nexus: 12, ward: 9 };
export type OrderT = 'idle' | 'move' | 'attack' | 'amove';
export interface Hero {
  champ: ChampId; level: number; xp: number; gold: number; mp: number; maxmp: number; ready: number[]; items: ItemId[];
  points: number; rank: number[]; kills: number; deaths: number; assists: number; cs: number; dead: boolean; respawnAt: number; recall: number; bot: boolean; lane: Role;
  spells: [SpellId, SpellId]; spellReady: [number, number]; rune: RuneId; cdr: number; wards: number; wardNext: number; blueUntil: number; redUntil: number; dealt: number; eTarget: number; eHits: number; eAt: number; eReady: number;
  o: { t: OrderT; x: number; y: number; target: number }; steal: number; haste: number; castAt: number; castIdx: number;
  slowUntil: number; slow: number; stunUntil: number; shield: number; shieldUntil: number; aspdUntil: number; aspd: number; speedUntil: number; speedUp: number; name: string;
}
export interface Ent {
  id: number; kind: EntKind; team: number; x: number; y: number; hp: number; maxhp: number; dmg: number; range: number; cd: number; cdMax: number; speed: number; def: number; radius: number;
  lane: Lane | ''; wp: number; home: Pt; target: number; path: number[]; pi: number; repath: number; fx: number; fy: number; hurt: number; fired: number; reveal: number; sub: string; spawnAt: number;
  slowUntil: number; slow: number; stunUntil: number; hero: Hero | null; tier: number; camp: string; lastHit: Map<number, number>; threat: number;
}
export interface Team { kills: number; towers: number; drakes: number; baronUntil: number; gold: number; inhibs: number; barons: number }
export type Cmd =
  | { k: 'move'; x: number; y: number } | { k: 'amove'; x: number; y: number } | { k: 'attack'; target: number } | { k: 'stop' }
  | { k: 'cast'; i: number; x: number; y: number } | { k: 'learn'; i: number } | { k: 'buy'; item: ItemId } | { k: 'recall' } | { k: 'surrender' }
  | { k: 'spell'; i: number; x: number; y: number } | { k: 'ward'; x: number; y: number } | { k: 'ping'; x: number; y: number; kind: PingKind } | { k: 'unward'; id: number };
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
  | { t: 'ward'; x: number; y: number; team: number }
  | { t: 'unward'; x: number; y: number; team: number }
  | { t: 'spell'; id: number; spell: SpellId }
  | { t: 'ping'; x: number; y: number; team: number; kind: PingKind }
  | { t: 'announce'; text: string; team: number };

const sq = (v: number): number => v * v;
const BOT_RUNE: Record<ChampId, RuneId> = { blade: 'fortitude', arcana: 'electro', ranger: 'conqueror', shade: 'conqueror', priest: 'swift', titan: 'fortitude', ember: 'electro', lancer: 'conqueror', seer: 'swift' };
const idleOrder = (): Hero['o'] => ({ t: 'idle', x: 0, y: 0, target: 0 });
const BASE_RADIUS = 8;

export class MobaSim {
  tick = 0; winner = -1; nextId = 1; readonly map: MobaMap; readonly grid: Uint8Array; readonly pather: Pather;
  ents: Ent[] = []; index = new Map<number, Ent>(); teams: Team[] = [0, 1].map(() => ({ kills: 0, towers: 0, drakes: 0, baronUntil: 0, gold: 0, inhibs: 0, barons: 0 }));
  events: SimEvent[] = []; record = true; private wave = 0; private camps = new Map<string, { at: Pt; due: number; ids: number[]; defs: Array<{ k: MonsterKind; dx: number; dy: number }> }>();
  readonly heroIds: number[] = [];
  wards: Ward[] = []; pings: Ping[] = []; private seen: [Set<number>, Set<number>] = [new Set(), new Set()];

  constructor(readonly setup: { player: ChampId; lane: Role; allies: HeroSetup[]; foes: HeroSetup[]; goldMul?: number; kit?: { spells?: [SpellId, SpellId]; rune?: RuneId } } = { player: 'blade', lane: 'mid', allies: [{ champ: 'arcana', lane: 'top' }, { champ: 'ranger', lane: 'bot' }], foes: [{ champ: 'blade', lane: 'top' }, { champ: 'arcana', lane: 'mid' }, { champ: 'ranger', lane: 'bot' }] }) {
    this.map = buildMobaMap(); this.grid = new Uint8Array(this.map.terrain); this.pather = new Pather(SIZE, this.grid);
    for (let t = 0; t < 2; t++) {
      const nx = this.add('nexus', t, NEXUS[t].x, NEXUS[t].y); nx.sub = 'nexus';
      for (const lane of LANES) { turretSpots(lane, t).forEach((p, i) => { const e = this.add('turret', t, p.x, p.y); e.lane = lane; e.tier = i; e.sub = `${lane}${i}`; }); const ip = inhibSpot(lane, t), ib = this.add('inhib', t, ip.x, ip.y); ib.lane = lane; ib.sub = `${lane}-inhib`; }
    }
    // 첫 번째 영웅(heroIds[0])이 내가 조종하는 챔피언이고 나머지는 봇입니다.
    this.addHero(0, { champ: this.setup.player, lane: this.setup.lane, ...this.setup.kit }, false, 0);
    this.setup.allies.forEach((r, i) => this.addHero(0, r, true, i + 1)); this.setup.foes.forEach((r, i) => this.addHero(1, r, true, i));
    for (const c of this.map.camps) this.camps.set(c.id, { at: c.at, due: this.tick, ids: [], defs: c.mobs });
    for (const [id, c] of this.camps) { const first = Math.min(...c.defs.map(d => MONSTERS[d.k].first)); c.due = Math.round(first * TICK); void id; }
    this.recount(); this.updateVision();
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
      nexus: { maxhp: 4500, radius: 2.4, def: 20 }, inhib: { maxhp: 2600, radius: 1.3, def: 20 }, super: { maxhp: 1700, dmg: 68, range: 1.9, cdMax: 22, speed: 3.1, radius: 0.75, def: 18 }, turret: { maxhp: 2200, dmg: 95, range: 8.6, cdMax: 24, radius: 1.1, def: 25 },
      melee: { maxhp: 470, dmg: 14, range: 1.4, cdMax: 20, speed: 2.9, radius: 0.45, def: 0 }, caster: { maxhp: 340, dmg: 22, range: 5.2, cdMax: 26, speed: 2.9, radius: 0.4, def: 0 },
      siege: { maxhp: 880, dmg: 40, range: 6.2, cdMax: 34, speed: 2.6, radius: 0.6, def: 10 }, hero: { radius: 0.6 }, monster: { radius: 0.6 },
    };
    const b = S[kind] ?? {};
    const e: Ent = { id: this.nextId++, kind, team, x, y, hp: b.maxhp ?? 1, maxhp: b.maxhp ?? 1, dmg: b.dmg ?? 0, range: b.range ?? 0, cd: 0, cdMax: b.cdMax ?? 20, speed: b.speed ?? 0, def: b.def ?? 0, radius: b.radius ?? 0.5, lane: '', wp: 0, home: { x, y }, target: 0, path: [], pi: 0, repath: 0, fx: team === 0 ? 1 : -1, fy: 0, hurt: -99, fired: -99, reveal: -99, sub: '', spawnAt: 0, slowUntil: 0, slow: 0, stunUntil: 0, hero: null, tier: 0, camp: '', lastHit: new Map(), threat: 0 };
    this.ents.push(e); this.index.set(e.id, e); return e;
  }
  private addHero(team: number, r: HeroSetup, bot: boolean, slot: number): Ent {
    const { champ, lane } = r, d = CHAMPS[champ], n = NEXUS[team], e = this.add('hero', team, n.x + (team === 0 ? 3 : -3) + slot * 0.6, n.y + (team === 0 ? -3 : 3));
    e.sub = champ; e.lane = lane === 'jungle' ? '' : lane;
    const spells = r.spells ?? ['flash', (['heal', 'ignite', 'barrier', 'ghost'] as SpellId[])[(slot + team) % 4]] as [SpellId, SpellId], rune = r.rune ?? BOT_RUNE[champ];
    e.hero = { spells, spellReady: [0, 0], rune, cdr: 0, wards: 2, wardNext: 0, blueUntil: 0, redUntil: 0, dealt: 0, eTarget: 0, eHits: 0, eAt: 0, eReady: 0, champ, level: 1, xp: 0, gold: 500, mp: d.mp, maxmp: d.mp, ready: [0, 0, 0, 0], items: [], points: 1, rank: [0, 0, 0, 0], kills: 0, deaths: 0, assists: 0, cs: 0, dead: false, respawnAt: 0, recall: 0, bot, lane, o: idleOrder(), steal: 0, haste: 0, castAt: -99, castIdx: -1, slowUntil: 0, slow: 0, stunUntil: 0, shield: 0, shieldUntil: 0, aspdUntil: 0, aspd: 0, speedUntil: 0, speedUp: 0, name: d.name };
    this.heroIds.push(e.id); this.recalc(e, true); if (bot) this.autoLearn(e); else this.learn(e, 0); return e;
  }
  /** 레벨·아이템에 따른 능력치를 다시 계산합니다. */
  recalc(e: Ent, fill = false): void {
    const h = e.hero!, d = CHAMPS[h.champ], L = h.level - 1; let ad = d.ad + d.adUp * L, def = d.def + d.defUp * L, hp = d.hp + d.hpUp * L, mp = d.mp + d.mpUp * L, sp = d.speed; h.steal = 0; h.haste = 0; h.cdr = 0;
    for (const id of h.items) { const it = ITEMS[id]; ad += it.ad ?? 0; def += it.def ?? 0; hp += it.hp ?? 0; mp += it.mp ?? 0; sp += it.speed ?? 0; h.steal += it.steal ?? 0; h.haste += it.haste ?? 0; h.cdr += it.cdr ?? 0; }
    const ru = RUNES[h.rune]; ad += ru.ad ?? 0; def += ru.def ?? 0; hp += ru.hp ?? 0; mp += ru.mp ?? 0; sp += ru.speed ?? 0; h.cdr += ru.cdr ?? 0;
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
    if (t.kind === 'inhib') return !this.ents.some(o => o.kind === 'turret' && o.team === t.team && o.lane === t.lane && o.tier === 2 && o.hp > 0);
    if (t.kind === 'nexus') return this.ents.some(o => o.kind === 'inhib' && o.team === t.team && o.hp <= 0);
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
  /** 이 팀이 지금 그 유닛을 볼 수 있는가(건물은 한 번 보이면 계속 보입니다). */
  canSee(team: number, t: Ent): boolean { return t.team === team || isStructure(t.kind) || this.seen[team]?.has(t.id) === true; }
  seenPt(team: number, x: number, y: number, r = 0): boolean { return this.sightList(team).some(o => Math.hypot(o.x - x, o.y - y) <= o.r + r); }
  /** 팀의 시야 원 목록(화면의 안개와 미니맵이 씁니다). */
  sightOf(team: number): Array<{ x: number; y: number; r: number }> { return this.sightList(team); }
  /** 드래곤·군주 상태: 지금 살아 있는지, 아니면 몇 초 뒤에 나오는지. */
  objective(sub: 'drake' | 'baron'): { alive: boolean; secs: number } { const c = this.camps.get(sub); if (!c) return { alive: false, secs: 0 }; return c.ids.length ? { alive: true, secs: 0 } : { alive: this.tick >= c.due, secs: Math.max(0, Math.ceil((c.due - this.tick) / TICK)) }; }
  private sightList(team: number): Array<{ x: number; y: number; r: number }> {
    const out: Array<{ x: number; y: number; r: number }> = [];
    for (const e of this.ents) { if (e.team !== team || e.hp <= 0 || e.hero?.dead) continue; const r = e.hero ? SIGHT.hero : isMinion(e.kind) ? SIGHT.minion : e.kind === 'turret' ? SIGHT.turret : e.kind === 'inhib' ? SIGHT.inhib : e.kind === 'nexus' ? SIGHT.nexus : 0; if (r) out.push({ x: e.x, y: e.y, r }); }
    for (const w of this.wards) if (w.team === team) out.push({ x: w.x, y: w.y, r: SIGHT.ward });
    return out;
  }
  /** (x,y) 가 있는 수풀 번호. 없으면 -1. */
  bushAt(x: number, y: number): number { for (let i = 0; i < BUSHES.length; i++) if (Math.hypot(BUSHES[i].x - x, BUSHES[i].y - y) <= BUSHES[i].r) return i; return -1; }
  /** 수풀 안에 숨은 유닛인지: 같은 수풀에 보는 쪽 유닛·와드가 없고 막 공격하지도 않았다면 숨습니다. */
  private hiddenInBush(e: Ent, team: number): boolean {
    if (e.team === 2 || isStructure(e.kind)) return false; const b = this.bushAt(e.x, e.y); if (b < 0 || this.tick - e.reveal < BUSH_REVEAL * TICK) return false;
    for (const o of this.ents) if (o.team === team && o.hp > 0 && !o.hero?.dead && this.bushAt(o.x, o.y) === b) return false;
    for (const w of this.wards) if (w.team === team && this.bushAt(w.x, w.y) === b) return false;
    return true;
  }
  private updateVision(): void {
    for (let team = 0; team < 2; team++) { const set = new Set<number>(), obs = this.sightList(team); for (const e of this.ents) { if (e.team === team || e.hp <= 0) continue; if (obs.some(o => Math.hypot(o.x - e.x, o.y - e.y) <= o.r + e.radius) && !this.hiddenInBush(e, team)) set.add(e.id); } this.seen[team] = set; }
  }
  private baron(team: number): boolean { return this.tick < this.teams[team].baronUntil; }

  // ---------- 명령 ----------
  apply(heroId: number, c: Cmd): boolean {
    const e = this.get(heroId), h = e?.hero; if (!e || !h || this.winner !== -1 || typeof c !== 'object' || c === null) return false;
    if (c.k === 'surrender') { this.finish(1 - e.team); return true; }
    if (c.k === 'ping') return this.ping(e, c.x, c.y, c.kind);
    if (h.dead) { if (c.k === 'buy') return this.buy(e, c.item); return false; }
    const clamp = (v: number): number => Math.min(Math.max(v, 1.5), SIZE - 1.5);
    switch (c.k) {
      case 'move': case 'amove': if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) return false; this.cancelRecall(e); h.o = { t: c.k, x: clamp(c.x), y: clamp(c.y), target: 0 }; e.path = []; e.pi = 0; return true;
      case 'attack': { const t = this.get(c.target); if (!t || !this.foe(e, t) || !this.canSee(e.team, t)) return false; this.cancelRecall(e); h.o = { t: 'attack', x: 0, y: 0, target: t.id }; e.path = []; return true; }
      case 'stop': h.o = idleOrder(); e.path = []; return true;
      case 'cast': return this.cast(e, c.i, c.x, c.y);
      case 'spell': return this.spell(e, c.i, c.x, c.y);
      case 'ward': return this.placeWard(e, c.x, c.y);
      case 'unward': return this.sweepWard(e, c.id);
      case 'learn': return this.learn(e, c.i);
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

  // ---------- 핑·와드·소환사 주문 ----------
  private ping(e: Ent, x: number, y: number, kind: PingKind): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(y) || (kind !== 'danger' && kind !== 'assist' && kind !== 'retreat')) return false;
    const p: Ping = { team: e.team, x: Math.min(Math.max(x, 0), SIZE), y: Math.min(Math.max(y, 0), SIZE), kind, at: this.tick, by: e.id };
    this.pings = this.pings.filter(o => this.tick - o.at < 8 * TICK).slice(-5); this.pings.push(p); this.emit({ t: 'ping', x: p.x, y: p.y, team: p.team, kind }); return true;
  }
  /** 와드: 사거리 안에 놓으면 90초 동안 주변을 밝힙니다. 한 번에 2개까지 들고 35초마다 하나씩 채워집니다. */
  /** 와드 제거: 가까이(4.5) 있는 보이는 적 와드를 부수면 골드 30. */
  private sweepWard(e: Ent, id: number): boolean {
    const w = this.wards.find(o => o.id === id); if (!w || w.team === e.team || this.dist(e, w) > SWEEP_RANGE || !this.seenPt(e.team, w.x, w.y)) return false;
    this.wards = this.wards.filter(o => o !== w); e.hero!.gold += SWEEP_GOLD; this.emit({ t: 'unward', x: w.x, y: w.y, team: e.team }); this.updateVision(); return true;
  }
  private placeWard(e: Ent, tx: number, ty: number): boolean {
    const h = e.hero!; if (!Number.isFinite(tx) || !Number.isFinite(ty) || h.wards < 1) return false;
    let dx = tx - e.x, dy = ty - e.y; const dl = Math.hypot(dx, dy) || 1, d = Math.min(dl, WARD_RANGE); dx /= dl; dy /= dl;
    const x = Math.min(Math.max(e.x + dx * d, 1.5), SIZE - 1.5), y = Math.min(Math.max(e.y + dy * d, 1.5), SIZE - 1.5);
    const mine = this.wards.filter(w => w.owner === e.id); if (mine.length >= WARD_MAX) this.wards = this.wards.filter(w => w !== mine[0]);
    if (h.wards >= 2) h.wardNext = this.tick + WARD_RECHARGE * TICK; h.wards--;
    this.wards.push({ id: this.nextId++, team: e.team, x, y, until: this.tick + WARD_LIFE * TICK, owner: e.id }); this.emit({ t: 'ward', x, y, team: e.team }); this.updateVision(); return true;
  }
  private spell(e: Ent, i: number, tx: number, ty: number): boolean {
    const h = e.hero!; if ((i !== 0 && i !== 1) || !Number.isFinite(tx) || !Number.isFinite(ty) || this.tick < h.spellReady[i]) return false;
    const id = h.spells[i]; let dx = tx - e.x, dy = ty - e.y; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    if (id === 'flash') {
      const want = Math.min(5.5, dl); let d = 0; for (; d < want; d += 0.4) { if (!this.pather.freeAt(e.x + dx * (d + 0.4), e.y + dy * (d + 0.4))) break; }
      this.emit({ t: 'dash', x0: e.x, y0: e.y, x1: e.x + dx * d, y1: e.y + dy * d, team: e.team }); e.x += dx * d; e.y += dy * d; e.path = []; h.o = idleOrder();
    } else if (id === 'heal') {
      const amt = 90 + 22 * h.level; e.hp = Math.min(e.maxhp, e.hp + amt); this.emit({ t: 'buff', id: e.id, team: e.team });
      const ally = this.ents.filter(a => a.hero && !a.hero.dead && a !== e && a.team === e.team && this.dist(a, e) < 6).sort((a, b) => a.hp / a.maxhp - b.hp / b.maxhp)[0]; if (ally) { ally.hp = Math.min(ally.maxhp, ally.hp + amt / 2); this.emit({ t: 'buff', id: ally.id, team: ally.team }); }
      h.speedUp = 0.2; h.speedUntil = this.tick + TICK;
    } else if (id === 'ignite') {
      const foe = this.ents.filter(t => t.hero && this.foe(e, t) && this.canSee(e.team, t) && this.dist(e, t) < 7.5).sort((a, b) => Math.hypot(a.x - tx, a.y - ty) - Math.hypot(b.x - tx, b.y - ty))[0]; if (!foe) return false;
      this.emit({ t: 'bolt', x0: e.x, y0: e.y, x1: foe.x, y1: foe.y, team: e.team, wide: 0.5 }); this.hurt(e, foe, 80 + 20 * h.level);
    } else if (id === 'barrier') { h.shield = Math.max(this.tick < h.shieldUntil ? h.shield : 0, 95 + 18 * h.level); h.shieldUntil = this.tick + 2 * TICK; this.emit({ t: 'buff', id: e.id, team: e.team }); }
    else { h.speedUp = 0.45; h.speedUntil = this.tick + 6 * TICK; this.emit({ t: 'buff', id: e.id, team: e.team }); }
    h.spellReady[i] = this.tick + SPELLS[id].cd * TICK; this.cancelRecall(e); this.emit({ t: 'spell', id: e.id, spell: id }); return true;
  }

  // ---------- 스킬 ----------
  canLearn(e: Ent, i: number): boolean {
    const h = e.hero; if (!h || h.points < 1 || !Number.isInteger(i) || i < 0 || i > 3) return false; const r = h.rank[i];
    return i === 3 ? r < 3 && h.level >= this.skill(e, 3).level * (r + 1) : r < 5 && r < Math.ceil(h.level / 2);
  }
  learn(e: Ent, i: number): boolean { if (!this.canLearn(e, i)) return false; e.hero!.rank[i]++; e.hero!.points--; return true; }
  /** 봇은 궁극기를 우선하고 나머지는 고르게 올립니다. */
  autoLearn(e: Ent): void { for (let n = 0; n < 8 && e.hero!.points > 0; n++) { if (this.learn(e, 3)) continue; const order = [0, 1, 2].sort((a, b) => e.hero!.rank[a] - e.hero!.rank[b]); if (!order.some(i => this.learn(e, i))) break; } }
  private cast(e: Ent, i: number, tx: number, ty: number): boolean {
    const h = e.hero!; if (!Number.isInteger(i) || i < 0 || i > 3 || !Number.isFinite(tx) || !Number.isFinite(ty) || this.stunned(e)) return false;
    const k = this.skill(e, i), rank = h.rank[i]; if (rank < 1 || this.tick < h.ready[i] || h.mp < k.mana) return false;
    let dx = tx - e.x, dy = ty - e.y; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    h.mp -= k.mana; h.ready[i] = this.tick + Math.round(k.cd * (1 - 0.04 * (rank - 1)) * (1 - Math.min(0.4, h.cdr + (this.tick < h.blueUntil ? 0.1 : 0)))); h.castAt = this.tick; h.castIdx = i; this.cancelRecall(e); e.fx = dx; e.fy = dy;
    const power = ((k.dmg ?? 0) * (1 + 0.3 * (rank - 1)) + (k.ratio ?? 0) * e.dmg + h.level * 4);
    const mult = (this.baron(e.team) ? 1.2 : 1 + 0.08 * Math.min(4, this.teams[e.team].drakes)) * (this.tick < h.redUntil ? 1.1 : 1);
    const strike = (cx: number, cy: number, r: number): void => {
      for (const t of this.ents) {
        if (!this.foe(e, t) || !this.vulnerable(t)) continue;
        if (Math.hypot(t.x - cx, t.y - cy) > r + t.radius) continue;
        if (k.dmg) this.hurt(e, t, power * mult);
        if (k.slow) this.slowEnt(t, k.slow, k.dur ?? TICK * 2); if (k.stun) this.stunEnt(t, k.stun);
      }
    };
    if (k.kind === 'shot') {
      const reach = k.range, wid = k.width ?? 1, hits: Array<{ t: Ent; along: number }> = [];
      for (const t of this.ents) {
        if (!this.foe(e, t) || !this.vulnerable(t)) continue;
        const px = t.x - e.x, py = t.y - e.y, along = px * dx + py * dy; if (along < 0 || along > reach + t.radius) continue;
        if (Math.abs(px * dy - py * dx) > wid + t.radius) continue; hits.push({ t, along });
      }
      hits.sort((a, b) => a.along - b.along); const struck = k.pierce ? hits : hits.slice(0, 1), last = struck[struck.length - 1];
      const end = k.pierce ? { x: e.x + dx * reach, y: e.y + dy * reach } : last ? { x: last.t.x, y: last.t.y } : { x: e.x + dx * reach, y: e.y + dy * reach };
      this.emit({ t: 'bolt', x0: e.x, y0: e.y, x1: end.x, y1: end.y, team: e.team, wide: wid });
      for (const { t } of struck) { this.hurt(e, t, power * mult); if (k.slow) this.slowEnt(t, k.slow, k.dur ?? TICK * 2); if (k.stun) this.stunEnt(t, k.stun); }
    } else if (k.kind === 'aoe') {
      const d = Math.min(k.range, dl), cx = k.range === 0 ? e.x : e.x + dx * d, cy = k.range === 0 ? e.y : e.y + dy * d;
      this.emit({ t: 'blast', x: cx, y: cy, r: k.radius ?? 3, team: e.team }); strike(cx, cy, k.radius ?? 3);
    } else if (k.kind === 'dash') {
      const want = Math.min(k.range, dl); let d = 0; const step = 0.4;
      for (; d < want; d += step) { if (!this.pather.freeAt(e.x + dx * (d + step), e.y + dy * (d + step))) break; }
      const nx = e.x + dx * d, ny = e.y + dy * d; this.emit({ t: 'dash', x0: e.x, y0: e.y, x1: nx, y1: ny, team: e.team }); e.x = nx; e.y = ny; e.path = []; h.o = idleOrder();
      if (k.radius) { this.emit({ t: 'blast', x: nx, y: ny, r: k.radius, team: e.team }); strike(nx, ny, k.radius); }
      if (k.shield || k.speed || k.aspd) this.applyBuff(e, k, rank);
    } else this.applyBuff(e, k, rank);
    return true;
  }
  private applyBuff(e: Ent, k: SkillDef, rank: number): void {
    const h = e.hero!;
    if (k.heal) { for (const a of this.ents) if (a.hero && !a.hero.dead && a.team === e.team && this.dist(a, e) <= (k.radius ?? 5)) { a.hp = Math.min(a.maxhp, a.hp + (k.heal * (1 + 0.3 * (rank - 1)) + (k.ratio ?? 0) * e.dmg)); this.emit({ t: 'buff', id: a.id, team: a.team }); } }
    if (k.shield) { h.shield = k.shield + (k.ratio ?? 0) * e.dmg; h.shieldUntil = this.tick + (k.dur ?? TICK * 3); }
    if (k.aspd) { h.aspd = k.aspd; h.aspdUntil = this.tick + (k.dur ?? TICK * 3); }
    if (k.speed) { h.speedUp = k.speed; h.speedUntil = this.tick + (k.dur ?? TICK * 3); }
    this.emit({ t: 'buff', id: e.id, team: e.team });
  }
  private slowEnt(t: Ent, k: number, dur: number): void { if (t.hero) { t.hero.slow = Math.max(this.tick < t.hero.slowUntil ? t.hero.slow : 0, k); t.hero.slowUntil = this.tick + dur; } else { t.slow = k; t.slowUntil = this.tick + dur; } }
  private stunEnt(t: Ent, dur: number): void { if (t.hero) t.hero.stunUntil = Math.max(t.hero.stunUntil, this.tick + dur); else t.stunUntil = Math.max(t.stunUntil, this.tick + dur); }

  // ---------- 피해·보상 ----------
  hurt(src: Ent | null, t: Ent, raw: number): void {
    if (t.hp <= 0 || !this.vulnerable(t)) return;
    if (src && src.team < 2 && t.team !== src.team) { if (this.tick - src.reveal >= BUSH_REVEAL * TICK && this.bushAt(src.x, src.y) >= 0) { src.reveal = this.tick; this.updateVision(); } else src.reveal = this.tick; }
    const sh = src?.hero; if (sh && t.hero && sh.rune === 'conqueror') raw *= 1.08;
    let amt = raw * 100 / (100 + t.def); const h = t.hero;
    if (h && h.shield > 0 && this.tick < h.shieldUntil) { const take = Math.min(h.shield, amt); h.shield -= take; amt -= take; }
    amt = Math.max(0, Math.round(amt)); t.hp -= amt; t.hurt = this.tick; if (src) t.lastHit.set(src.id, this.tick);
    if (amt > 0) this.emit({ t: 'dmg', id: t.id, x: t.x, y: t.y, amt, team: t.team });
    if (src?.hero && src.hero.steal > 0 && amt > 0) src.hp = Math.min(src.maxhp, src.hp + amt * src.hero.steal);
    if (sh && src && t.hero && amt > 0) {
      sh.dealt += amt; if (sh.rune === 'conqueror') src.hp = Math.min(src.maxhp, src.hp + amt * 0.05);
      if (sh.rune === 'electro' && t.hp > 0) {
        if (sh.eTarget === t.id && this.tick - sh.eAt < 3 * TICK) sh.eHits++; else { sh.eTarget = t.id; sh.eHits = 1; } sh.eAt = this.tick;
        if (sh.eHits >= 3 && this.tick >= sh.eReady) { sh.eHits = 0; sh.eReady = this.tick + 20 * TICK; this.emit({ t: 'blast', x: t.x, y: t.y, r: 1.6, team: src.team }); this.hurt(src, t, 45 + 9 * sh.level + 0.3 * src.dmg); }
      }
    }
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
    if (t.kind === 'inhib') {
      t.spawnAt = this.tick + INHIB_RESPAWN * TICK; this.teams[foe].inhibs++; for (const a of near(60, foe)) a.hero!.gold += 60;
      this.emit({ t: 'announce', text: `${foe === 0 ? '청군' : '적군'}이 억제기를 파괴했습니다 — 슈퍼 미니언 등장`, team: foe }); return;
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
      if (t.sub === 'baron' && who) { this.teams[who.team].barons++; this.teams[who.team].baronUntil = this.tick + 120 * TICK; this.emit({ t: 'announce', text: `${who.team === 0 ? '청군' : '적군'}이 심연의 군주를 처치했습니다 (2분간 강화)`, team: who.team }); }
      const c = this.camps.get(t.camp); if (c) c.ids = c.ids.filter(i => i !== t.id); if (c && !c.ids.length) c.due = this.tick + Math.round(Math.max(...c.defs.map(m => MONSTERS[m.k].respawn)) * TICK);
      if (t.sub === 'crab' && who?.hero) { who.hero.speedUp = 0.3; who.hero.speedUntil = this.tick + 12 * TICK; this.wards.push({ id: this.nextId++, team: who.team, x: t.x, y: t.y, until: this.tick + 25 * TICK, owner: 0 }); this.emit({ t: 'buff', id: who.id, team: who.team }); this.updateVision(); }
      if (who?.hero) { if (t.sub === 'golem') { who.hero.blueUntil = this.tick + BUFF_TIME * TICK; this.emit({ t: 'buff', id: who.id, team: who.team }); } else if (t.sub === 'wolf' && c && !c.ids.length) { who.hero.redUntil = this.tick + BUFF_TIME * TICK; this.emit({ t: 'buff', id: who.id, team: who.team }); } }
      return;
    }
    // 미니언
    const gold = t.kind === 'super' ? 50 : t.kind === 'siege' ? 55 : t.kind === 'caster' ? 17 : 21, xp = t.kind === 'super' ? 90 : t.kind === 'siege' ? 70 : t.kind === 'caster' ? 32 : 58;
    if (finisher?.hero) { finisher.hero.gold += gold; finisher.hero.cs++; }
    const share = near(14, foe); for (const a of share) this.addXp(a, Math.round(xp * (share.length > 1 ? 1.2 : 1) / share.length));
  }
  addXp(e: Ent, amt: number): void {
    const h = e.hero; if (!h || h.level >= MAX_LEVEL) return; h.xp += amt;
    while (h.level < MAX_LEVEL && h.xp >= xpNeed(h.level)) { h.xp -= xpNeed(h.level); h.level++; h.points++; this.recalc(e); if (h.bot) this.autoLearn(e); e.hp = Math.min(e.maxhp, e.hp + CHAMPS[h.champ].hpUp); this.emit({ t: 'level', id: e.id }); }
  }
  private finish(w: number): void { this.winner = w; }

  // ---------- 틱 ----------
  step(): void {
    if (this.winner !== -1) return;
    this.tick++;
    this.spawnWaves(); this.spawnCamps();
    if (this.wards.length && this.wards.some(w => this.tick >= w.until)) { this.wards = this.wards.filter(w => this.tick < w.until); this.updateVision(); }
    for (const e of this.ents) { if (e.hp <= 0 && !e.hero) continue; if (e.cd > 0) e.cd--; if (e.repath > 0) e.repath--; this.update(e); }
    this.separate();
    for (const e of this.ents) if (e.kind === 'inhib' && e.hp <= 0 && this.tick >= e.spawnAt) { e.hp = e.maxhp; e.hurt = -99; e.lastHit.clear(); this.emit({ t: 'announce', text: `${e.team === 0 ? '청군' : '적군'} 억제기가 되살아났습니다`, team: e.team }); }
    if (this.tick % 4 === 0) this.updateVision();
    const dead = this.ents.filter(e => e.hp <= 0 && !e.hero && e.kind !== 'nexus' && e.kind !== 'inhib');
    if (dead.length) { for (const e of dead) { this.index.delete(e.id); } this.ents = this.ents.filter(e => !dead.includes(e)); }
    if (this.tick % TICK === 0) this.perSecond();
  }
  private perSecond(): void {
    for (const e of this.ents) {
      const h = e.hero; if (!h || h.dead) continue; h.gold += 2.2; const inb = this.inBase(e);
      if (e.hp < e.maxhp) e.hp = Math.min(e.maxhp, e.hp + (inb ? e.maxhp * 0.09 : 1.5 + e.maxhp * 0.004 + (this.baron(e.team) ? e.maxhp * 0.01 : 0)));
      if (h.mp < h.maxmp) h.mp = Math.min(h.maxmp, h.mp + (inb ? h.maxmp * 0.12 : (2 + h.maxmp * 0.01) * (this.tick < h.blueUntil ? 2.4 : 1)));
      if (h.wards < 2 && this.tick >= h.wardNext) { h.wards++; if (h.wards < 2) h.wardNext = this.tick + WARD_RECHARGE * TICK; }
    }
  }
  private spawnWaves(): void {
    if (this.tick < WAVE_FIRST || (this.tick - WAVE_FIRST) % WAVE_EVERY !== 0) return;
    const n = this.wave++;
    for (let team = 0; team < 2; team++) for (const lane of LANES) {
      const comp: Array<'melee' | 'caster' | 'siege' | 'super'> = ['melee', 'melee', 'melee', 'caster', 'caster']; if (n % 3 === 2 && n >= 2) comp.push('siege');
      if (this.ents.some(o => o.kind === 'inhib' && o.team === 1 - team && o.lane === lane && o.hp <= 0)) comp.unshift('super');
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
      case 'inhib': break;
      case 'monster': this.updateMonster(e); break;
      default: this.updateMinion(e);
    }
  }

  /** 적 후보 중 가장 알맞은 표적. 미니언 → 포탑 → 챔피언 순으로 값을 매깁니다. */
  private pick(e: Ent, range: number, pref: 'minion' | 'hero' | 'any' = 'minion'): Ent | null {
    let best: Ent | null = null, bs = Infinity;
    for (const t of this.ents) {
      if (t.team === e.team || t.hp <= 0 || t.team === 2 && e.team === 2 || t.hero?.dead || !this.vulnerable(t)) continue;
      if (e.team < 2 && !this.canSee(e.team, t)) continue;
      if (e.team !== 2 && t.team === 2 && !(e.hero)) continue;
      const d = this.dist(e, t) - t.radius; if (d > range) continue;
      let s = d; const isMin = isMinion(t.kind);
      if (pref === 'minion') s += isMin ? 0 : t.kind === 'hero' ? (this.tick - t.threat < 2 * TICK ? -2 : 4) : 2;
      else if (pref === 'hero') s += t.hero ? 0 : isMin ? 3 : 5; else s += t.hero ? -1 : 0;
      if (s < bs) { bs = s; best = t; }
    }
    return best;
  }
  private attack(e: Ent, t: Ent): void {
    const h = e.hero, mult = h && (this.baron(e.team) ? 1.2 : 1 + 0.08 * Math.min(4, this.teams[e.team].drakes)) * (this.tick < h.redUntil ? 1.1 : 1) || 1; e.cd = this.cdOf(e); e.fired = this.tick;
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
    if (o.t === 'attack') { t = this.get(o.target) ?? null; if (!t || t.hp <= 0 || t.hero?.dead || !this.vulnerable(t) || this.dist(e, t) > 22 || !this.canSee(e.team, t)) { h.o = idleOrder(); t = null; } }
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

// LAST CITY — 월드 상태와 핵심 규칙 (DOM 비의존: 헤드리스 테스트 가능)
import {
  ACTORS, BIZ, BIZ_LEVEL_MULT, BIZ_UPGRADE_COST, CIV, CLASSES, DIFFICULTY, FACTIONS, FACTION_COUNT, PERKS, POLICE, RESEARCH, SIZE, STRUCTS,
  SUPPLY_CAP, SUPPLY_DEPOT, SUPPLY_HQ, UNITS, WEAPONS, ZONE_DPS, ZONE_PHASES, baseMods,
  type ActorKind, type BizKind, type ClassId, type Difficulty, type Mods, type ResearchId, type StructKind, type UnitId, type WeaponId,
} from './defs';
import { addSolid, clearLine, generateCity, makeRng, navBlocked, rectFree, removeSolid, resolveCircle, type CityMap, type Rng } from './map';
import { updateActors, updateBullets, updateVehicles, updatePopulation } from './actors';
import { thinkFaction, type AiState } from './ai';
import { INTERIORS, INTERIOR_SPEED, nearCounter, nearDoor, resolveInterior, type InteriorLayout } from './interior';
import { purchase, type ShopResult } from './shop';

export const SQUAD_MAX = 5;
export interface Order { type: 'follow' | 'move' | 'amove' | 'hold' | 'mine' | 'guard' | 'hunt' | 'wander'; x: number; y: number }
export interface Actor {
  id: number; kind: ActorKind; f: number; x: number; y: number; vx: number; vy: number; r: number; hp: number; maxHp: number; ang: number;
  weapon: WeaponId; cd: number; order: Order; path: number[] | null; pathI: number; pgx: number; pgy: number; repathT: number; direct: boolean;
  tk: 0 | 1 | 2 | 3; tid: number; thinkT: number; inVeh: number; alive: boolean; sup: number; carry: number; ws: number; mineT: number; crystal: number;
  slot: number; home: number; fleeT: number; hurtT: number; hurtBy: number; runCd: number; walk: number; flash: number; temp: number; stuck: number; los: boolean; gone?: boolean;
  /** 분대 번호(1~SQUAD_MAX), 0 = 미편성 */ sq: number;
}
export interface WeaponSlot { id: WeaponId; mag: number; ammo: number }
export interface Faction {
  id: number; name: string; color: string; dark: string; player: boolean; alive: boolean; cash: number; crystal: number; supply: number; supplyMax: number;
  boss: number; hq: number; up: Record<ResearchId, number>; mods: Mods; slots: WeaponSlot[]; cur: number; medkits: number; armor: number; xp: number; level: number;
  pending: number; choices: number[]; perks: string[]; skillCd: number; buffT: number; dashCd: number; dashT: number; reloadT: number; respawnT: number;
  wanted: number; crimeT: number; kills: number; bossKills: number; earned: number; place: number; klass: ClassId; ai: AiState; income: number; combatT: number; diedAt: number; deaths: number;
}
export interface Structure {
  id: number; kind: StructKind; f: number; x: number; y: number; w: number; h: number; hp: number; maxHp: number; built: number;
  queue: { unit?: UnitId; research?: ResearchId; t: number; total: number }[]; solid: number; cd: number; hurtT: number; temp: number; ang: number; alive: boolean;
}
export interface Business { id: number; kind: BizKind; x: number; y: number; solid: number; owner: number; level: number; cap: number; capBy: number; guardT: number; pulse: number }
export interface Vehicle {
  id: number; kind: string; x: number; y: number; ang: number; vx: number; vy: number; hp: number; maxHp: number; driver: number; f: number; r: number; len: number; wid: number; color: string;
  ai: '' | 'traffic' | 'chase'; dir: number; turned: number; nextTurn: number; burn: number; stuck: number; rev: number; cd: number; alive: boolean; wx: number; wy: number; throttle: number; brake: boolean; maxSpeed: number; accel: number; idle: number; path: number[] | null; pathI: number; pathT: number;
}
export interface Loot { id: number; type: 'weapon' | 'cash' | 'armor' | 'medkit' | 'crate'; weapon?: WeaponId; amount: number; x: number; y: number; fall: number; alive: boolean }
export interface Bullet { x: number; y: number; vx: number; vy: number; life: number; dmg: number; f: number; src: number; w: WeaponId; px: number; py: number; boss: boolean; hitIds?: number[] }
export interface Fx { t: string; x: number; y: number; a?: number; b?: number; s?: string; f?: number }
export interface Crystal { id: number; x: number; y: number; amount: number; max: number }
export interface PlayerInput { mx: number; my: number; ax: number; ay: number; fire: boolean; dash: boolean; brake: boolean }
export interface WorldOptions { seed: number; difficulty: Difficulty; klass: ClassId; autoPlayer?: boolean; /** 연습 모드: 자기장·라이벌 AI·보급 투하 정지 */ tutorial?: boolean }
export interface Quest { text: string; reward: number; done: boolean; check: (w: World) => boolean }

const HC = 128, HN = Math.ceil(SIZE / HC);
export const VEHICLES: Record<string, { hp: number; max: number; accel: number; r: number; len: number; wid: number; colors: string[] }> = {
  sedan: { hp: 320, max: 430, accel: 420, r: 28, len: 85, wid: 36, colors: ['#d9d9d9', '#4b6cb7', '#a33', '#3c7a52', '#c9a227', '#444b59'] },
  sports: { hp: 260, max: 620, accel: 620, r: 28, len: 85, wid: 36, colors: ['#ff3b3b', '#ffd400', '#00d0ff', '#ff7ad9'] },
  truck: { hp: 700, max: 340, accel: 300, r: 34, len: 108, wid: 44, colors: ['#8b6f47', '#5d6d7e', '#7a8b5a'] },
  police: { hp: 420, max: 540, accel: 540, r: 28, len: 85, wid: 36, colors: ['#f4f6ff'] },
  tank: { hp: 2600, max: 235, accel: 260, r: 38, len: 90, wid: 56, colors: ['#5c6b45'] },
};

export class World {
  time = 0; rng: Rng; map: CityMap; opts: WorldOptions; factions: Faction[] = []; actors: Actor[] = []; byId = new Map<number, Actor>();
  structures: Structure[] = []; businesses: Business[] = []; vehicles: Vehicle[] = []; loot: Loot[] = []; bullets: Bullet[] = []; crystals: Crystal[] = [];
  events: Fx[] = []; feed: { text: string; t: number; color: string }[] = []; hash: Actor[][] = Array.from({ length: HN * HN }, () => []);
  zone = { x: SIZE / 2, y: SIZE / 2, r: 3900, sx: SIZE / 2, sy: SIZE / 2, sr: 3900, nx: SIZE / 2, ny: SIZE / 2, nr: 3900, phase: ZONE_PHASES.length, t: ZONE_PHASES[0][0], shrinking: false };
  price = 10; priceHistory: number[] = []; nextId = 1; over = false; winner = -1; secT = 0; dropT = 95; pathBudget = 0; quests: Quest[] = [];
  input: PlayerInput = { mx: 0, my: 0, ax: 0, ay: 0, fire: false, dash: false, brake: false };
  /** 보스가 사업체 안에 들어가 있는 동안의 상태(없으면 null). 좌표는 내부 공간 기준입니다. */
  inside: { biz: number; x: number; y: number; ang: number; walk: number } | null = null;
  planes: { x: number; y: number; vx: number; vy: number; tx: number; ty: number; dropped: boolean }[] = [];

  constructor(opts: WorldOptions) {
    this.opts = opts; this.rng = makeRng(opts.seed); this.map = generateCity(this.rng);
    this.map.crystals.forEach(c => this.crystals.push({ id: this.nextId++, x: c.x, y: c.y, amount: c.amount, max: c.amount }));
    this.map.biz.forEach(b => this.businesses.push({ id: this.nextId++, kind: b.kind, x: b.x, y: b.y, solid: b.solid, owner: -1, level: 1, cap: 0, capBy: -1, guardT: 0, pulse: 0 }));
    const order = this.map.bases.map((_, i) => i); const start = Math.floor(this.rng() * order.length);
    for (let i = 0; i < FACTION_COUNT; i++) {
      const base = this.map.bases[order[(start + i) % order.length]], player = i === 0, klass: ClassId = player ? opts.klass : (['warlord', 'tycoon', 'engineer'] as ClassId[])[Math.floor(this.rng() * 3)];
      const f: Faction = {
        id: i, name: FACTIONS[i].name, color: FACTIONS[i].color, dark: FACTIONS[i].dark, player, alive: true, cash: 500, crystal: 150, supply: 0, supplyMax: SUPPLY_HQ, boss: 0, hq: 0,
        up: { dmg: 0, armor: 0, eco: 0 }, mods: baseMods(), slots: [{ id: 'pistol', mag: 12, ammo: -1 }], cur: 0, medkits: 1, armor: 0, xp: 0, level: 1, pending: 0, choices: [], perks: [],
        skillCd: 8, buffT: 0, dashCd: 0, dashT: 0, reloadT: 0, respawnT: 0, wanted: 0, crimeT: -99, kills: 0, bossKills: 0, earned: 0, place: 0, klass, income: 0, combatT: -99, diedAt: 0, deaths: 0,
        ai: { goal: 'idle', tx: base.x, ty: base.y, biz: 0, t: this.rng(), attackT: 400 + this.rng() * 200, stuckT: 0 },
      };
      this.factions.push(f);
      if (klass === 'tycoon') { f.cash = 1600; f.mods.income += 0.3; }
      if (klass === 'engineer') f.mods.cost *= 0.8;
      if (klass === 'warlord') { f.mods.hp += 40; f.slots.push({ id: 'smg', mag: 32, ammo: -1 }); f.cur = 1; }
      const hq = this.addStructure('hq', i, base.x - 60, base.y - 60, true); f.hq = hq.id;
      const boss = this.spawnActor('boss', i, base.x, base.y + 100); f.boss = boss.id; boss.maxHp = this.bossMaxHp(f); boss.hp = boss.maxHp;
      for (let k = 0; k < (klass === 'engineer' ? 6 : 4); k++) this.spawnUnit('worker', i, base.x - 60 + k * 24, base.y - 90);
      if (klass === 'warlord') for (let k = 0; k < 2; k++) this.spawnUnit('rifle', i, base.x - 20 + k * 40, base.y + 130);
      if (klass === 'engineer') this.addStructure('turret', i, base.x + 90, base.y + 60, true);
      this.recomputeSupply(f);
    }
    // 초기 전리품
    for (const l of this.map.loot) this.spawnLootTier(l.x, l.y, l.tier);
    for (const c of this.map.cars) this.spawnVehicle(c.kind, c.x, c.y, c.ang);
    for (let i = 0; i < 40; i++) updatePopulation(this, true);
    this.quests = [
      { text: '편의점 등 사업체 1곳 매입하기 (패드 위에서 E)', reward: 200, done: false, check: w => w.businesses.some(b => b.owner === 0) },
      { text: '병영 건설하기 (Tab → 건설)', reward: 150, done: false, check: w => w.structures.some(s => s.f === 0 && s.kind === 'barracks' && s.built >= 1) },
      { text: '소총병 4명 훈련하기', reward: 250, done: false, check: w => w.actors.filter(a => a.alive && a.f === 0 && a.kind === 'rifle').length >= 4 },
      { text: '무기 줍기 또는 무기상에서 구매하기', reward: 200, done: false, check: w => w.factions[0].slots.some(x => x.id !== 'pistol' && !(x.id === 'smg' && w.opts.klass === 'warlord')) },
      { text: '사업체 3곳 보유하기', reward: 500, done: false, check: w => w.businesses.filter(b => b.owner === 0).length >= 3 },
      { text: '적 사업체 적대적 인수 (적 패드 위에서 6초 버티기)', reward: 600, done: false, check: w => w.factions[0].ai.biz === -7 },
      { text: '라이벌 조직 1곳 궤멸시키기', reward: 1500, done: false, check: w => w.factions[0].bossKills >= 1 && w.factions.filter(f => !f.alive).length >= 1 },
    ];
  }

  // ---------- 생성 ----------
  spawnActor(kind: ActorKind, f: number, x: number, y: number): Actor {
    const d = ACTORS[kind];
    const a: Actor = { id: this.nextId++, kind, f, x, y, vx: 0, vy: 0, r: d.r, hp: d.hp, maxHp: d.hp, ang: this.rng() * 6.28, weapon: d.weapon, cd: this.rng(), order: { type: 'hold', x, y }, path: null, pathI: 0, pgx: 0, pgy: 0, repathT: 0, direct: true,
      tk: 0, tid: 0, thinkT: this.rng() * 0.3, inVeh: 0, alive: true, sup: 0, carry: 0, ws: 0, mineT: 0, crystal: 0, slot: Math.floor(this.rng() * 1000), home: 0, fleeT: 0, hurtT: -99, hurtBy: -1, runCd: 0, walk: this.rng() * 6, flash: 0, temp: 0, stuck: 0, los: false, sq: 0 };
    this.actors.push(a); this.byId.set(a.id, a); return a;
  }
  spawnUnit(unit: UnitId | 'merc' | 'guard', f: number, x: number, y: number): Actor {
    const a = this.spawnActor(unit, f, x, y), fac = this.factions[f];
    a.maxHp = Math.round(a.maxHp * fac.mods.unitHp * (1 + 0.15 * fac.up.armor) * (f === 0 ? 1.9 : 1.4)); a.hp = a.maxHp;
    if (unit === 'worker') a.order = { type: 'mine', x, y };
    else if (unit === 'guard') a.order = { type: 'guard', x, y };
    else { a.order = { type: 'follow', x, y }; if (f === 0) a.sq = this.squadSel; }
    if (unit !== 'merc' && unit !== 'guard') a.sup = UNITS[unit].supply;
    return a;
  }
  addStructure(kind: StructKind, f: number, x: number, y: number, done = false, temp = 0): Structure {
    const d = STRUCTS[kind], c = FACTIONS[f];
    const solid = addSolid(this.map, { x, y, w: d.w, h: d.h, height: d.height, wall: c.dark, roof: c.color, struct: 0, alive: true });
    const s: Structure = { id: this.nextId++, kind, f, x, y, w: d.w, h: d.h, hp: done ? d.hp : d.hp * 0.1, maxHp: d.hp, built: done ? 1 : 0, queue: [], solid, cd: 0, hurtT: -99, temp, ang: 0, alive: true };
    this.map.solids[solid].struct = s.id; this.structures.push(s); return s;
  }
  spawnVehicle(kind: string, x: number, y: number, ang: number): Vehicle {
    const d = VEHICLES[kind];
    const v: Vehicle = { id: this.nextId++, kind, x, y, ang, vx: 0, vy: 0, hp: d.hp, maxHp: d.hp, driver: 0, f: -1, r: d.r, len: d.len, wid: d.wid, color: d.colors[Math.floor(this.rng() * d.colors.length)],
      ai: '', dir: 0, turned: -1, nextTurn: 0, burn: 0, stuck: 0, rev: 0, cd: 0, alive: true, wx: 0, wy: 0, throttle: 0, brake: false, maxSpeed: d.max, accel: d.accel, idle: 0, path: null, pathI: 0, pathT: 0 };
    this.vehicles.push(v); return v;
  }
  spawnLoot(type: Loot['type'], x: number, y: number, amount: number, weapon?: WeaponId, fall = 0): Loot {
    const l: Loot = { id: this.nextId++, type, weapon, amount, x, y, fall, alive: true }; this.loot.push(l); return l;
  }
  spawnLootTier(x: number, y: number, tier: number): void {
    const r = this.rng();
    if (tier >= 3) this.spawnLoot('weapon', x, y, 0, r < 0.4 ? 'rocket' : r < 0.7 ? 'sniper' : 'rifle');
    else if (tier === 2) { if (r < 0.6) this.spawnLoot('weapon', x, y, 0, r < 0.25 ? 'rifle' : r < 0.45 ? 'shotgun' : 'smg'); else this.spawnLoot(r < 0.8 ? 'armor' : 'medkit', x, y, 50); }
    else { if (r < 0.4) this.spawnLoot('weapon', x, y, 0, r < 0.2 ? 'smg' : 'shotgun'); else if (r < 0.65) this.spawnLoot('cash', x, y, 100 + Math.floor(this.rng() * 250)); else this.spawnLoot(r < 0.85 ? 'medkit' : 'armor', x, y, 35); }
  }

  // ---------- 조회 ----------
  boss(f: number): Actor | null { const a = this.byId.get(this.factions[f].boss); return a && a.alive ? a : null; }
  hq(f: number): Structure | null { const id = this.factions[f].hq; return this.structures.find(s => s.id === id && s.alive) ?? null; }
  hostile(fa: number, fb: number): boolean {
    if (fa === fb || fa === CIV || fb === CIV) return false;
    if (fa < 0 || fb < 0) return true;
    if (fa === POLICE) return fb < 8 && this.factions[fb].wanted >= 1;
    if (fb === POLICE) return fa < 8 && this.factions[fa].wanted >= 1;
    return true;
  }
  forNear(x: number, y: number, r: number, fn: (a: Actor) => void): void {
    const x0 = Math.max(0, Math.floor((x - r) / HC)), x1 = Math.min(HN - 1, Math.floor((x + r) / HC)), y0 = Math.max(0, Math.floor((y - r) / HC)), y1 = Math.min(HN - 1, Math.floor((y + r) / HC));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) { const cell = this.hash[cy * HN + cx]; for (let k = 0; k < cell.length; k++) fn(cell[k]); }
  }
  bossMaxHp(f: Faction): number { return Math.round((ACTORS.boss.hp + f.mods.hp + (f.level - 1) * 12) * (f.id === 0 ? 2.2 : 1)); }
  xpNeed(level: number): number { return Math.round(55 * Math.pow(level, 1.35)); }
  cost(f: Faction, v: number): number { return Math.round(v * f.mods.cost); }
  armyOf(f: number): Actor[] { return this.actors.filter(a => a.alive && a.f === f && a.kind !== 'worker' && a.kind !== 'boss' && a.kind !== 'guard'); }
  aliveCount(): number { return this.factions.filter(f => f.alive).length; }
  say(text: string, color = '#fff'): void { this.feed.push({ text, t: this.time, color }); if (this.feed.length > 40) this.feed.shift(); }
  fx(t: string, x: number, y: number, a?: number, s?: string, f?: number): void { if (this.events.length < 600) this.events.push({ t, x, y, a, s, f }); }
  recomputeSupply(f: Faction): void {
    let max = 0, used = 0;
    for (const s of this.structures) if (s.alive && s.f === f.id && s.built >= 1) max += s.kind === 'hq' ? SUPPLY_HQ : s.kind === 'depot' ? SUPPLY_DEPOT : 0;
    for (const a of this.actors) if (a.alive && a.f === f.id) used += a.sup;
    for (const s of this.structures) if (s.alive && s.f === f.id) for (const q of s.queue) if (q.unit) used += UNITS[q.unit].supply;
    f.supplyMax = Math.min(f.player ? SUPPLY_CAP : DIFFICULTY[this.opts.difficulty].cap, max); f.supply = used;
  }
  netWorth(f: Faction): number {
    let v = f.cash + f.crystal * 8;
    for (const b of this.businesses) if (b.owner === f.id) v += BIZ[b.kind].price * (0.6 + b.level * 0.5);
    for (const a of this.actors) if (a.alive && a.f === f.id && a.sup) v += a.sup * 70;
    return Math.round(v);
  }

  // ---------- 피해 ----------
  crime(_f: number, _amount: number): void { /* 수배 시스템 없음 */ }
  hurtActor(a: Actor, dmg: number, srcF: number, direct = true): void {
    if (!a.alive || this.hidden(a)) return;
    if (a.inVeh) { const v = this.vehicles.find(q => q.id === a.inVeh); if (v) this.hurtVehicle(v, dmg, srcF); return; }
    dmg *= 1 - ACTORS[a.kind].armor; if (a.f === 0) dmg *= 0.75;
    if (srcF < 8 && srcF >= 0 && !this.factions[srcF].player) dmg *= DIFFICULTY[this.opts.difficulty].dmg;
    if (a.kind === 'boss') {
      const f = this.factions[a.f]; dmg *= 1 - Math.min(0.6, f.mods.armor); if (f.dashT > 0) dmg *= 0.3;
      if (f.armor > 0) { const ab = Math.min(f.armor, dmg * 0.6); f.armor -= ab; dmg -= ab; }
      f.combatT = this.time;
    }
    a.hp -= dmg; a.hurtT = this.time; a.hurtBy = srcF; a.flash = 0.12;
    if (a.kind === 'boss' && a.f === 0) this.fx('phurt', a.x, a.y, dmg);
    if (a.f === CIV) { a.fleeT = 6; if (direct) this.crime(srcF, 0.25); }
    
    if (srcF >= 0 && srcF < 8) { const sf = this.factions[srcF]; if (sf.mods.steal > 0 && direct) { const b = this.boss(srcF); if (b) b.hp = Math.min(b.maxHp, b.hp + dmg * sf.mods.steal); } }
    if (a.hp <= 0) this.killActor(a, srcF);
  }
  killActor(a: Actor, srcF: number): void {
    if (!a.alive) return; a.alive = false; this.byId.delete(a.id); if (a.kind === 'boss' && a.f === 0) this.inside = null;
    this.fx(ACTORS[a.kind].mech ? 'boom' : 'death', a.x, a.y, a.r, undefined, a.f);
    const src = srcF >= 0 && srcF < 8 ? this.factions[srcF] : null;
    if (srcF === 0 && a.f !== 0) this.fx('kill', a.x, a.y, 0, a.f < 8 ? `${FACTIONS[a.f].name} ${ACTORS[a.kind].name}` : ACTORS[a.kind].name, a.f);
    if (a.inVeh) { const v = this.vehicles.find(q => q.id === a.inVeh); if (v) { v.driver = 0; v.f = -1; } a.inVeh = 0; }
    if (a.f === CIV) { if (src) { this.crime(srcF, 0.8); this.spawnLoot('cash', a.x, a.y, 20 + Math.floor(this.rng() * 60)); } return; }
    if (a.f === POLICE) { if (src) { this.crime(srcF, 0.7); this.gainXp(src, ACTORS[a.kind].xp); src.kills++; if (this.rng() < 0.3) this.spawnLoot(this.rng() < 0.5 ? 'armor' : 'medkit', a.x, a.y, 30); } return; }
    const f = this.factions[a.f];
    if (src && src !== f) { this.gainXp(src, ACTORS[a.kind].xp); src.kills++; }
    if (a.kind === 'boss') {
      f.deaths++; f.diedAt = this.time;
      const drop = Math.min(2000, Math.floor(f.cash * 0.25)); f.cash -= drop; if (drop > 20) this.spawnLoot('cash', a.x, a.y, drop);
      const best = f.slots.slice(1).sort((p, q) => WEAPONS[q.id].tier - WEAPONS[p.id].tier)[0];
      // An exhausted rare weapon must not respawn as a full-ammo pickup.
      if (best && WEAPONS[best.id].tier >= 3) {
        if (WEAPONS[best.id].ammo < 0 || best.ammo > 0) this.spawnLoot('weapon', a.x + 20, a.y, best.ammo, best.id);
        f.slots = f.slots.filter(s => s !== best); f.cur = 0;
      }
      if (src && src !== f) src.bossKills++;
      const hq = this.hq(f.id);
      this.say(`${src ? src.name : srcF === POLICE ? '경찰' : '자기장'} ▸ ${f.name} 보스 처치${hq ? '' : ' (본부 없음 → 궤멸)'}`, src ? src.color : '#c9a2ff');
      f.respawnT = hq ? 7 + Math.min(8, f.deaths * 1.5) : 0;
      if (f.player) this.fx('playerdown', a.x, a.y);
    }
    if (a.sup) f.supply -= a.sup;
  }
  hurtVehicle(v: Vehicle, dmg: number, srcF: number): void {
    if (!v.alive) return; v.hp -= dmg;
    if (v.kind === 'police' && srcF >= 0 && srcF < 8 && v.ai === 'chase') this.crime(srcF, 0.05);
    if (v.hp <= 0 && v.burn <= 0) { v.burn = 1.6; this.fx('burn', v.x, v.y); }
  }
  hurtStruct(s: Structure, dmg: number, srcF: number): void {
    if (!s.alive) return; s.hp -= dmg; s.hurtT = this.time;
    if (s.hp > 0) return;
    s.alive = false; removeSolid(this.map, s.solid); this.fx('boom', s.x + s.w / 2, s.y + s.h / 2, Math.max(s.w, s.h));
    const f = this.factions[s.f], src = srcF >= 0 && srcF < 8 ? this.factions[srcF] : null;
    for (const q of s.queue) if (q.unit) { f.crystal += UNITS[q.unit].crystal; }
    if (src && src !== f) this.gainXp(src, s.kind === 'hq' ? 200 : 40);
    if (s.kind === 'hq' && f.alive) { this.say(`${f.name} 본부 붕괴! 더 이상 부활할 수 없습니다`, f.color); this.fx('announce', 0, 0, 0, `${f.name} 본부 붕괴`); }
    this.recomputeSupply(f);
  }
  explode(x: number, y: number, r: number, dmg: number, f: number, bmul: number): void {
    this.fx('boom', x, y, r);
    this.forNear(x, y, r + 30, a => {
      if (!a.alive || a.inVeh || (a.f !== CIV && !this.hostile(f, a.f))) return;
      const d = Math.hypot(a.x - x, a.y - y) - a.r; if (d < r) this.hurtActor(a, dmg * (1 - 0.6 * Math.max(0, d) / r), f, a.f !== CIV);
    });
    for (const v of this.vehicles) if (v.alive) { const d = Math.hypot(v.x - x, v.y - y) - v.r; if (d < r && (v.f < 0 || this.hostile(f, v.f))) this.hurtVehicle(v, dmg * 1.3 * (1 - 0.5 * Math.max(0, d) / r), f); }
    for (const s of this.structures) if (s.alive && this.hostile(f, s.f)) {
      const nx = Math.max(s.x, Math.min(x, s.x + s.w)), ny = Math.max(s.y, Math.min(y, s.y + s.h)), d = Math.hypot(nx - x, ny - y);
      if (d < r) this.hurtStruct(s, dmg * bmul, f);
    }
  }
  gainXp(f: Faction, n: number): void {
    if (!f.alive) return; f.xp += n * f.mods.xp;
    while (f.xp >= this.xpNeed(f.level)) {
      f.xp -= this.xpNeed(f.level); f.level++;
      const b = this.boss(f.id); if (b) { b.maxHp = this.bossMaxHp(f); b.hp = Math.min(b.maxHp, b.hp + 40); this.fx('levelup', b.x, b.y, 0, undefined, f.id); }
      if (f.player && !this.opts.autoPlayer) { f.pending++; if (!f.choices.length) this.rollChoices(f); }
      else this.applyPerk(f, Math.floor(this.rng() * PERKS.length));
    }
  }
  rollChoices(f: Faction): void {
    const pool = PERKS.map((_, i) => i); f.choices = [];
    for (let k = 0; k < 3; k++) f.choices.push(pool.splice(Math.floor(this.rng() * pool.length), 1)[0]);
  }
  applyPerk(f: Faction, idx: number): void {
    const p = PERKS[idx]; p.apply(f.mods); f.perks.push(p.id);
    const b = this.boss(f.id); if (b) { const m = this.bossMaxHp(f); b.hp += Math.max(0, m - b.maxHp); b.maxHp = m; }
  }
  pickPerk(i: number): void {
    const f = this.factions[0]; if (f.pending <= 0 || f.choices[i] === undefined) return;
    this.applyPerk(f, f.choices[i]); f.pending--; f.choices = []; if (f.pending > 0) this.rollChoices(f);
  }

  // ---------- 플레이어/AI 공용 명령 (오류 문자열 또는 '') ----------
  train(fi: number, unit: UnitId): string {
    const f = this.factions[fi], d = UNITS[unit];
    const hosts = this.structures.filter(s => s.alive && s.f === fi && s.kind === d.from && s.built >= 1);
    if (!hosts.length) return `${STRUCTS[d.from].name}이(가) 필요합니다`;
    if (d.needLab && !this.structures.some(s => s.alive && s.f === fi && s.kind === 'lab' && s.built >= 1)) return '연구소가 필요합니다';
    const host = hosts.sort((a, b) => a.queue.length - b.queue.length)[0];
    if (host.queue.length >= 5) return '생산 대기열이 가득 찼습니다';
    this.recomputeSupply(f);
    if (f.supply + d.supply > f.supplyMax) return '인구 한도 부족 — 보급고를 지으세요';
    const c = this.cost(f, d.crystal), m = this.cost(f, d.cash);
    if (f.crystal < c) return '크리스탈이 부족합니다'; if (f.cash < m) return '자금이 부족합니다';
    f.crystal -= c; f.cash -= m; host.queue.push({ unit, t: d.time, total: d.time }); f.supply += d.supply; return '';
  }
  canBuild(fi: number, kind: StructKind, cx: number, cy: number): boolean {
    const d = STRUCTS[kind], hq = this.hq(fi);
    let near = hq ? Math.hypot(cx - (hq.x + 60), cy - (hq.y + 60)) < 720 : false;
    if (!near) near = this.businesses.some(b => b.owner === fi && Math.hypot(b.x - cx, b.y - cy) < 460);
    if (!near || !rectFree(this.map, cx - d.w / 2, cy - d.h / 2, d.w, d.h)) return false;
    for (const c of this.crystals) if (c.amount > 0 && Math.abs(c.x - cx) < d.w / 2 + 22 && Math.abs(c.y - cy) < d.h / 2 + 22) return false;
    for (const b of this.businesses) if (Math.abs(b.x - cx) < d.w / 2 + 30 && Math.abs(b.y - cy) < d.h / 2 + 30) return false;
    return true;
  }
  build(fi: number, kind: StructKind, cx: number, cy: number): string {
    const f = this.factions[fi], d = STRUCTS[kind]; if (kind === 'hq') return '불가';
    const c = this.cost(f, d.crystal), m = this.cost(f, d.cash);
    if (f.crystal < c) return '크리스탈이 부족합니다'; if (f.cash < m) return '자금이 부족합니다';
    if (!this.canBuild(fi, kind, cx, cy)) return '여기에는 지을 수 없습니다 (본부·보유 사업체 근처의 빈 땅)';
    f.crystal -= c; f.cash -= m; const s = this.addStructure(kind, fi, Math.round(cx - d.w / 2), Math.round(cy - d.h / 2));
    this.fx('build', cx, cy); this.pushOut(s); return '';
  }
  pushOut(s: Structure): void { // 새 건물 자리에 있던 유닛을 바깥으로
    this.forNear(s.x + s.w / 2, s.y + s.h / 2, Math.max(s.w, s.h), a => { if (a.x > s.x - a.r && a.x < s.x + s.w + a.r && a.y > s.y - a.r && a.y < s.y + s.h + a.r) { a.y = s.y + s.h + a.r + 2; a.path = null; } });
  }
  research(fi: number, id: ResearchId): string {
    const f = this.factions[fi], lab = this.structures.find(s => s.alive && s.f === fi && s.kind === 'lab' && s.built >= 1);
    if (!lab) return '연구소가 필요합니다';
    const queued = lab.queue.filter(q => q.research === id).length, lvl = f.up[id] + queued;
    if (lvl >= 3) return '최대 단계입니다'; if (lab.queue.length >= 3) return '연구 대기열이 가득 찼습니다';
    const c = RESEARCH[id].crystal * (lvl + 1), m = RESEARCH[id].cash * (lvl + 1);
    if (f.crystal < c) return '크리스탈이 부족합니다'; if (f.cash < m) return '자금이 부족합니다';
    f.crystal -= c; f.cash -= m; lab.queue.push({ research: id, t: 22 + lvl * 8, total: 22 + lvl * 8 }); return '';
  }
  market(fi: number, sell: boolean, amount: number): string {
    const f = this.factions[fi], quantity = Math.floor(amount);
    // The "sell all" action may pass fractional stock; trade only whole crystals.
    // Reject non-finite, zero and negative quantities before changing balances.
    if (!Number.isSafeInteger(quantity) || quantity <= 0) return '거래 수량이 올바르지 않습니다';
    if (sell) { const n = Math.min(quantity, Math.floor(f.crystal)); if (n <= 0) return '팔 크리스탈이 없습니다'; f.crystal -= n; const g = Math.floor(n * this.price * 0.92); f.cash += g; f.earned += g; this.price = Math.max(4, this.price * (1 - n / 4000)); return ''; }
    const costC = Math.ceil(quantity * this.price * 1.08); if (f.cash < costC) return '자금이 부족합니다';
    f.cash -= costC; f.crystal += quantity; this.price = Math.min(26, this.price * (1 + quantity / 4000)); return '';
  }
  bizPrice(f: Faction, b: Business): number { return Math.round(BIZ[b.kind].price * (f.klass === 'tycoon' ? 0.9 : 1)); }
  upgradePrice(b: Business): number { return Math.round(BIZ[b.kind].price * BIZ_UPGRADE_COST[b.level]); }
  buyBiz(fi: number, b: Business): string {
    const f = this.factions[fi]; if (b.owner >= 0 || b.kind === 'gunshop') return '매입할 수 없습니다';
    const p = this.bizPrice(f, b); if (f.cash < p) return `자금 부족 — $${p} 필요`;
    f.cash -= p; b.owner = fi; b.level = 1; b.cap = 0; b.pulse = 1; this.fx('cash', b.x, b.y, -p, undefined, fi);
    if (f.player) this.say(`${BIZ[b.kind].name} 매입! 초당 +$${BIZ[b.kind].income}`, f.color); return '';
  }
  upgradeBiz(fi: number, b: Business): string {
    const f = this.factions[fi]; if (b.owner !== fi) return '내 사업체가 아닙니다'; if (b.level >= 3) return '최고 등급입니다';
    const p = this.upgradePrice(b); if (f.cash < p) return `자금 부족 — $${p} 필요`;
    f.cash -= p; b.level++; b.pulse = 1; b.guardT = 0; this.fx('cash', b.x, b.y, -p, undefined, fi); return '';
  }
  /** 플레이어가 지금 명령을 내리는 분대(0 = 전체). */
  squadSel = 0;
  isSoldier(a: Actor): boolean { return a.alive && a.kind !== 'worker' && a.kind !== 'boss' && a.kind !== 'guard' && a.f < 8; }
  squadMembers(fi: number, sq: number): Actor[] { return this.actors.filter(a => a.f === fi && this.isSoldier(a) && (sq === 0 || a.sq === sq)); }
  selectSquad(n: number): void { this.squadSel = Math.max(0, Math.min(SQUAD_MAX, Math.floor(n))); }
  /** 전 병력을 병과별로 고르게 n개 분대로 나눈다(n<=1 이면 편성 해제). */
  splitSquads(fi: number, n: number): void {
    const army = this.squadMembers(fi, 0).sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.id - b.id)), c = Math.min(SQUAD_MAX, Math.max(0, Math.floor(n)));
    army.forEach((a, i) => { a.sq = c <= 1 ? 0 : (i % c) + 1; });
    if (c <= 1) this.squadSel = 0; else if (this.squadSel > c) this.squadSel = 1;
  }
  /** 모든 병력을 한 분대로 모은다. */
  assignAllTo(fi: number, sq: number): void { for (const a of this.squadMembers(fi, 0)) a.sq = sq; }
  /** 전체(0) 선택 상태에서 미편성 병력을 해당 분대로 옮긴다. */
  moveUnassigned(fi: number, sq: number): void { for (const a of this.squadMembers(fi, 0)) if (a.sq === 0) a.sq = sq; }
  order(fi: number, type: Order['type'], x: number, y: number, squad = fi === 0 ? this.squadSel : 0): void {
    let k = 0;
    for (const a of this.actors) if (a.alive && a.f === fi && a.kind !== 'worker' && a.kind !== 'boss' && a.kind !== 'guard' && (squad === 0 || a.sq === squad)) {
      const ring = Math.floor(Math.sqrt(k)), ang = k * 2.4; k++;
      a.order = type === 'follow' ? { type, x, y } : type === 'hold' ? { type, x: a.x, y: a.y } : { type, x: x + Math.cos(ang) * ring * 26, y: y + Math.sin(ang) * ring * 26 };
      a.path = null; a.tk = 0;
    }
    if (this.factions[fi].player) this.fx('order', x, y, 0, type);
  }
  giveWeapon(f: Faction, id: WeaponId, ammo?: number): void {
    const d = WEAPONS[id], have = f.slots.find(s => s.id === id), total = ammo && ammo > 0 ? ammo : d.ammo;
    if (have) {
      if (d.ammo > 0) { have.ammo += total; have.mag = Math.min(d.mag, Math.max(0, have.ammo)); }
      else have.mag = d.mag;
      return;
    }
    // A limited-ammo pickup cannot begin with more bullets loaded than it owns.
    const slot: WeaponSlot = { id, mag: d.ammo > 0 ? Math.min(d.mag, Math.max(0, total)) : d.mag, ammo: total };
    if (f.slots.length < 3) { f.slots.push(slot); f.cur = f.slots.length - 1; return; }
    const at = f.cur === 0 ? (WEAPONS[f.slots[1].id].tier <= WEAPONS[f.slots[2].id].tier ? 1 : 2) : f.cur, old = f.slots[at], b = this.boss(f.id);
    if (b) this.spawnLoot('weapon', b.x + 26, b.y + 10, old.ammo, old.id);
    f.slots[at] = slot; f.cur = at;
  }
  // ---------- 사업체 내부 ----------
  /** 지금 들어가 있는 사업체(없으면 null) */
  insideBiz(): Business | null { return this.inside ? this.businesses.find(z => z.id === this.inside!.biz) ?? null : null; }
  insideLayout(): InteriorLayout | null { const z = this.insideBiz(); return z ? INTERIORS[z.kind] : null; }
  /** 보스가 안에 있으면 적의 표적·피해에서 제외 */
  hidden(a: Actor): boolean { return !!this.inside && a.kind === 'boss' && a.f === 0; }
  enterBiz(fi: number, z: Business): string {
    const b = this.boss(fi); if (fi !== 0 || !b || b.inVeh) return '들어갈 수 없습니다';
    if (z.owner >= 0 && z.owner !== fi) return '적 사업체 — 패드 위에서 버티면 인수합니다';
    const lay = INTERIORS[z.kind]; this.inside = { biz: z.id, x: lay.spawn.x, y: lay.spawn.y, ang: lay.spawn.ang, walk: 0 };
    b.vx = b.vy = 0; this.fx('door', b.x, b.y); return '';
  }
  exitBiz(fi: number): void {
    if (fi !== 0 || !this.inside) return; const z = this.insideBiz(), b = this.boss(fi); this.inside = null;
    if (b && z) { b.x = z.x; b.y = z.y; b.vx = b.vy = 0; resolveCircle(this.map, b, b.r); this.fx('door', b.x, b.y); }
  }
  /** 내부 공간에서 걷기(보스 입력 mx,my 는 실내 좌표 기준) */
  moveInside(dt: number): void {
    const s = this.inside, lay = this.insideLayout(); if (!s || !lay) return; const inp = this.input, m = Math.hypot(inp.mx, inp.my), k = m > 1 ? 1 / m : 1;
    const p = { x: s.x + inp.mx * k * INTERIOR_SPEED * dt, y: s.y + inp.my * k * INTERIOR_SPEED * dt }; resolveInterior(lay, p);
    s.walk += Math.hypot(p.x - s.x, p.y - s.y); s.x = p.x; s.y = p.y; s.ang = Math.atan2(inp.ay - s.y, inp.ax - s.x);
  }
  nearInsideCounter(): boolean { const s = this.inside, lay = this.insideLayout(); return !!s && !!lay && nearCounter(lay, s.x, s.y); }
  nearInsideDoor(): boolean { const s = this.inside, lay = this.insideLayout(); return !!s && !!lay && nearDoor(lay, s.x, s.y); }
  /** 내부 E 키: 카운터 → 'shop', 문 → 'exit' */
  interactInside(fi: number): 'shop' | 'exit' | '' {
    if (!this.inside) return ''; if (this.nearInsideDoor()) { this.exitBiz(fi); return 'exit'; }
    return this.nearInsideCounter() ? 'shop' : '';
  }
  /** 카운터 앞에서 사업체 매입·업그레이드 */
  buyHere(fi: number): string {
    const z = this.insideBiz(); if (!z || !this.nearInsideCounter()) return '카운터 앞에서만 거래할 수 있습니다';
    return z.owner < 0 ? this.buyBiz(fi, z) : z.owner === fi ? this.upgradeBiz(fi, z) : '내 사업체가 아닙니다';
  }
  /** 카운터 앞에서 물건 구매 */
  shop(fi: number, id: string): ShopResult {
    const z = this.insideBiz(); if (!z || !this.nearInsideCounter()) return { ok: false, msg: '카운터 앞에서만 구매할 수 있습니다' };
    return purchase(this, fi, z, id);
  }
  bribe(fi: number): string {
    const f = this.factions[fi], p = Math.ceil(f.wanted) * 300; if (f.wanted < 1) return '수배 중이 아닙니다';
    if (f.cash < p) return `뇌물 $${p} 필요`; f.cash -= p; f.wanted = 0; this.say('경찰 매수 완료. 수배 해제', '#9db8ff'); return '';
  }
  hireMercs(fi: number, free = false): string {
    const f = this.factions[fi], b = this.boss(fi); if (!b) return '보스가 쓰러져 있습니다';
    if (this.actors.filter(a => a.alive && a.f === fi && a.kind === 'merc').length + 3 > 9) return '용병은 최대 9명입니다';
    if (!free) { if (f.cash < 350) return '용병 호출에 $350 필요'; f.cash -= 350; }
    for (let k = 0; k < 3; k++) { const m = this.spawnUnit('merc', fi, b.x + Math.cos(k * 2.1) * 36, b.y + Math.sin(k * 2.1) * 36); m.temp = 0; this.fx('spawn', m.x, m.y, 0, undefined, fi); }
    return '';
  }
  useMedkit(fi: number): void { const f = this.factions[fi], b = this.boss(fi); if (!b || f.medkits <= 0 || b.hp >= b.maxHp) return; f.medkits--; b.hp = Math.min(b.maxHp, b.hp + 70); this.fx('heal', b.x, b.y); }
  useSkill(fi: number): string {
    const f = this.factions[fi], b = this.boss(fi); if (!b || b.inVeh) return '지금은 사용할 수 없습니다'; if (f.skillCd > 0) return '재사용 대기 중';
    if (f.klass === 'warlord') { f.buffT = 8; this.fx('roar', b.x, b.y, 0, undefined, fi); }
    else if (f.klass === 'tycoon') { const e = this.hireMercs(fi); if (e) return e; }
    else {
      let placed = false;
      for (let k = 0; k < 10 && !placed; k++) { const x = b.x + Math.cos(b.ang + k * 0.7) * (50 + k * 6), y = b.y + Math.sin(b.ang + k * 0.7) * (50 + k * 6); if (rectFree(this.map, x - 22, y - 22, 44, 44) || !navBlocked(this.map, x, y) && k > 6) { const s = this.addStructure('turret', fi, x - 22, y - 22, true, 25); this.pushOut(s); placed = true; } }
      if (!placed) return '설치할 공간이 없습니다';
    }
    f.skillCd = CLASSES[f.klass].cd; return '';
  }
  /** 보스 주변 상호작용. UI에 알릴 코드 반환 */
  interact(fi: number): string {
    const f = this.factions[fi], b = this.boss(fi); if (!b || b.inVeh) return '';
    for (const l of this.loot) if (l.alive && l.type === 'weapon' && l.fall <= 0 && Math.hypot(l.x - b.x, l.y - b.y) < 46) { l.alive = false; this.giveWeapon(f, l.weapon!, l.amount); this.fx('pickup', l.x, l.y); return ''; }
    for (const z of this.businesses) if (Math.hypot(z.x - b.x, z.y - b.y) < 64) return this.enterBiz(fi, z) || 'enter';
    return '';
  }
  toggleVehicle(fi: number): void {
    const b = this.boss(fi); if (!b) return;
    if (b.inVeh) { const v = this.vehicles.find(q => q.id === b.inVeh); b.inVeh = 0; if (v) { v.driver = 0; v.f = -1; v.ai = ''; b.x = v.x + Math.cos(v.ang + 1.57) * (v.wid + 8); b.y = v.y + Math.sin(v.ang + 1.57) * (v.wid + 8); } return; }
    let best: Vehicle | null = null, bd = 78;
    for (const v of this.vehicles) if (v.alive && v.burn <= 0 && v.ai !== 'chase') { const d = Math.hypot(v.x - b.x, v.y - b.y) - v.r; if (d < bd) { bd = d; best = v; } }
    if (!best) return;
    if (best.driver) { const d = this.byId.get(best.driver); if (d) { if (d.kind === 'boss') return; d.inVeh = 0; d.x = best.x - Math.cos(best.ang + 1.57) * 34; d.y = best.y - Math.sin(best.ang + 1.57) * 34; d.fleeT = 8; } this.crime(fi, best.kind === 'police' ? 1 : 0.5); }
    else if (best.kind === 'police') this.crime(fi, 1);
    best.ai = ''; best.driver = b.id; best.f = fi; b.inVeh = best.id; b.vx = b.vy = 0; this.fx('door', b.x, b.y);
  }

  // ---------- 시뮬레이션 ----------
  step(dt: number): void {
    if (this.over) return; const pf = this.factions[0]; if (pf.pending > 0) return;
    this.time += dt; this.pathBudget = 10;
    for (const c of this.hash) c.length = 0;
    for (const a of this.actors) if (a.alive && !a.inVeh) this.hash[Math.min(HN - 1, Math.max(0, Math.floor(a.y / HC))) * HN + Math.min(HN - 1, Math.max(0, Math.floor(a.x / HC)))].push(a);
    for (const f of this.factions) if (f.alive) {
      f.ai.t -= dt; if (f.ai.t <= 0 && (!f.player || this.opts.autoPlayer) && !this.opts.tutorial) { f.ai.t = 0.8 + this.rng() * 0.4; thinkFaction(this, f); }
      f.skillCd = Math.max(0, f.skillCd - dt); f.buffT = Math.max(0, f.buffT - dt); f.dashCd = Math.max(0, f.dashCd - dt); f.dashT = Math.max(0, f.dashT - dt);
      if (this.time - f.crimeT > 14) f.wanted = Math.max(0, f.wanted - dt * 0.12);
      const b = this.boss(f.id);
      if (b) { if (f.mods.regen || this.time - f.combatT > 6) b.hp = Math.min(b.maxHp, b.hp + (f.mods.regen + (this.time - f.combatT > 6 ? 4 : 0)) * dt); }
      else if (f.respawnT > 0) { f.respawnT -= dt; if (f.respawnT <= 0) this.respawn(f); }
    }
    this.updateStructures(dt); updateActors(this, dt); updateVehicles(this, dt); updateBullets(this, dt);
    this.updateBusinesses(dt); this.updateZone(dt); this.updateLoot(dt);
    this.secT += dt; if (this.secT >= 1) { this.secT -= 1; this.everySecond(); }
    this.checkElimination();
    if (this.actors.length > 60 && this.actors.some(a => !a.alive)) this.actors = this.actors.filter(a => a.alive);
    this.vehicles = this.vehicles.filter(v => v.alive); this.loot = this.loot.filter(l => l.alive); this.structures = this.structures.filter(s => s.alive);
  }
  respawn(f: Faction): void {
    const hq = this.hq(f.id); if (!hq) return;
    const b = this.spawnActor('boss', f.id, hq.x + 60, hq.y + 150); f.boss = b.id; b.maxHp = this.bossMaxHp(f); b.hp = b.maxHp; f.armor = 0; f.dashT = 2.5;
    this.fx('spawn', b.x, b.y, 0, undefined, f.id); if (f.player) this.say('본부에서 부활했습니다', f.color);
  }
  updateStructures(dt: number): void {
    for (const s of this.structures) {
      if (!s.alive) continue; const d = STRUCTS[s.kind], f = this.factions[s.f];
      if (s.temp > 0) { s.temp -= dt; if (s.temp <= 0) { s.alive = false; removeSolid(this.map, s.solid); this.fx('poof', s.x + s.w / 2, s.y + s.h / 2); continue; } }
      if (s.built < 1) { s.built = Math.min(1, s.built + dt / d.time); s.hp = Math.min(s.maxHp, s.hp + s.maxHp * 0.9 * dt / d.time); if (s.built >= 1) { this.recomputeSupply(f); this.fx('built', s.x + s.w / 2, s.y + s.h / 2, 0, d.name, s.f); } continue; }
      const q = s.queue[0];
      if (q) {
        q.t -= dt;
        if (q.t <= 0) {
          s.queue.shift();
          if (q.research) { f.up[q.research]++; if (f.player) this.say(`연구 완료: ${RESEARCH[q.research].name} ${f.up[q.research]}단계`, f.color); }
          else if (q.unit) {
            const cx = s.x + s.w / 2, cy = s.y + s.h / 2; let px = cx, py = s.y + s.h + 22;
            for (let k = 0; k < 12; k++) { const a = k * 0.55 + this.rng(), x = cx + Math.cos(a) * (s.w / 2 + 34), y = cy + Math.sin(a) * (s.h / 2 + 34); if (!navBlocked(this.map, x, y)) { px = x; py = y; break; } }
            const u = this.spawnUnit(q.unit, s.f, px, py); f.supply -= UNITS[q.unit].supply; this.recomputeSupply(f); this.fx('spawn', u.x, u.y, 0, undefined, s.f);
          }
        }
      }
      if (s.kind === 'hq') { const b = this.boss(s.f); if (b && Math.hypot(b.x - s.x - 60, b.y - s.y - 60) < 190 && this.time - f.combatT > 3) b.hp = Math.min(b.maxHp, b.hp + 10 * dt); }
      if (s.kind === 'turret' || s.kind === 'hq') {
        s.cd -= dt; if (s.cd > 0) continue;
        const w = WEAPONS.u_turret, cx = s.x + s.w / 2, cy = s.y + s.h / 2; let best: { x: number; y: number } | null = null, bd = w.range * (s.kind === 'hq' ? 0.85 : 1);
        this.forNear(cx, cy, bd, a => { if (!a.alive || !this.hostile(s.f, a.f)) return; const dd = Math.hypot(a.x - cx, a.y - cy); if (dd < bd) { bd = dd; best = a; } });
        for (const v of this.vehicles) if (v.alive && v.driver && this.hostile(s.f, v.f)) { const dd = Math.hypot(v.x - cx, v.y - cy); if (dd < bd) { bd = dd; best = v; } }
        if (!best) { s.cd = 0.25; continue; }
        const t = best as { x: number; y: number }; s.ang = Math.atan2(t.y - cy, t.x - cx); s.cd = 1 / w.rate;
        this.shoot(cx + Math.cos(s.ang) * (s.w / 2 + 6), cy + Math.sin(s.ang) * (s.h / 2 + 6), s.ang, 'u_turret', s.f, 0, 1 + 0.15 * f.up.dmg, false);
      }
    }
  }
  shoot(x: number, y: number, ang: number, wid: WeaponId, f: number, src: number, mul: number, boss: boolean): void {
    const w = WEAPONS[wid];
    for (let p = 0; p < w.pellets; p++) {
      const a = ang + (this.rng() - 0.5) * 2 * w.spread, sp = w.speed * (0.94 + this.rng() * 0.12);
      this.bullets.push({ x, y, px: x, py: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: w.range / w.speed, dmg: w.dmg * mul, f, src, w: wid, boss });
    }
    this.fx('shot', x, y, ang, w.snd, f);
  }
  updateBusinesses(dt: number): void {
    for (const z of this.businesses) {
      z.pulse = Math.max(0, z.pulse - dt); if (z.kind === 'gunshop') continue;
      let capper = -1, contested = false;
      this.forNear(z.x, z.y, 150, a => {
        if (!a.alive || a.f >= 8) return; const d = Math.hypot(a.x - z.x, a.y - z.y);
        if (a.kind === 'boss' && d < 58 && a.f !== z.owner) capper = a.f;
        if (a.f === z.owner && d < 150 && a.kind !== 'worker') contested = true;
      });
      if (capper >= 0 && z.owner >= 0) {
        if (z.capBy !== capper) { z.capBy = capper; z.cap = 0; }
        if (!contested) z.cap += dt;
        if (z.cap >= 6) {
          const old = this.factions[z.owner], nf = this.factions[capper];
          this.say(`${nf.name} ▸ ${old.name}의 ${BIZ[z.kind].name} 적대적 인수!`, nf.color);
          z.owner = capper; z.level = Math.max(1, z.level - 1); z.cap = 0; z.pulse = 1; this.gainXp(nf, 30); this.fx('capture', z.x, z.y, 0, undefined, capper);
          if (nf.player) nf.ai.biz = -7;
          for (const a of this.actors) if (a.alive && a.kind === 'guard' && a.home === z.id) this.killActor(a, -1);
        }
      } else if (capper >= 0 && z.owner < 0) {
        const nf = this.factions[capper]; if (!nf.player || this.opts.autoPlayer) this.buyBiz(capper, z);
      } else { z.cap = Math.max(0, z.cap - dt * 2); }
      if (z.owner >= 0 && z.level > 1) {
        z.guardT -= dt;
        if (z.guardT <= 0) {
          z.guardT = 30; const n = this.actors.filter(a => a.alive && a.kind === 'guard' && a.home === z.id).length, hq = this.hq(z.owner);
          // 경비병은 주인의 본부 문 앞에서 나와 사업체까지 걸어갑니다(본부가 없으면 보내지 못함)
          if (n < z.level - 1) {
            if (!hq) z.guardT = 5;
            else { const g = this.spawnUnit('guard', z.owner, hq.x + hq.w / 2 + (this.rng() - 0.5) * 50, hq.y + hq.h + 16); g.home = z.id; g.order = { type: 'guard', x: z.x + (this.rng() - 0.5) * 50, y: z.y + (this.rng() - 0.5) * 24 }; z.guardT = 2; }
          }
        }
      }
    }
  }
  everySecond(): void {
    const diff = DIFFICULTY[this.opts.difficulty];
    for (const f of this.factions) {
      if (!f.alive) continue; let inc = 0, cr = 0;
      for (const z of this.businesses) if (z.owner === f.id) { inc += BIZ[z.kind].income * BIZ_LEVEL_MULT[z.level]; cr += BIZ[z.kind].crystal * z.level; }
      inc *= f.mods.income * (1 + 0.12 * f.up.eco) * (f.player ? 1 : diff.income); inc += 2;
      f.cash += inc; f.earned += inc; f.crystal += cr * (f.player ? 1 : diff.income); f.income = inc;
    }
    // 시세
    this.price += (this.rng() - 0.5) * 0.8 + (10 - this.price) * 0.03;
    if (this.rng() < 0.012) { const up = this.rng() < 0.5; this.price *= up ? 1.5 : 0.62; this.say(up ? '📈 크리스탈 시세 급등! 지금 팔면 이득' : '📉 크리스탈 시세 폭락! 사재기 기회', up ? '#7dffb0' : '#ff9d9d'); }
    this.price = Math.max(4, Math.min(26, this.price)); this.priceHistory.push(this.price); if (this.priceHistory.length > 80) this.priceHistory.shift();
    // 자기장 피해 (1초 단위)
    const dps = ZONE_DPS[Math.min(ZONE_DPS.length - 1, this.zone.phase)], z = this.zone;
    for (const a of this.actors) if (a.alive && Math.hypot(a.x - z.x, a.y - z.y) > z.r) { if (a.f >= 8) { a.alive = false; a.gone = true; this.byId.delete(a.id); } else if (!a.inVeh) this.hurtActor(a, dps * (a.kind === 'boss' ? 1 : 1.6), -1, false); else { const v = this.vehicles.find(q => q.id === a.inVeh); if (v) this.hurtVehicle(v, dps * 4, -1); a.hp -= dps * 0.5; if (a.hp <= 0) { a.inVeh = 0; if (v) { v.driver = 0; v.f = -1; } this.killActor(a, -1); } } }
    for (const s of this.structures) if (s.alive && Math.hypot(s.x + s.w / 2 - z.x, s.y + s.h / 2 - z.y) > z.r) this.hurtStruct(s, s.maxHp * 0.035 + dps * 2, -1);
    for (const b of this.businesses) if (b.owner >= 0 && Math.hypot(b.x - z.x, b.y - z.y) > z.r + 60) { b.owner = -1; b.level = 1; }
    // 보급 투하
    this.dropT -= 1;
    if (this.dropT <= 0 && z.nr > 100 && !this.opts.tutorial) {
      this.dropT = 70 + this.rng() * 25;
      for (let k = 0; k < 30; k++) { const a = this.rng() * 6.28, d = this.rng() * z.nr * 0.75, x = z.nx + Math.cos(a) * d, y = z.ny + Math.sin(a) * d; if (x > 60 && y > 60 && x < SIZE - 60 && y < SIZE - 60 && !navBlocked(this.map, x, y)) { const ang = this.rng() * 6.28; this.planes.push({ x: x - Math.cos(ang) * 2600, y: y - Math.sin(ang) * 2600, vx: Math.cos(ang) * 520, vy: Math.sin(ang) * 520, tx: x, ty: y, dropped: false }); this.say('✈️ 보급 수송기 접근 — 전설 무기 투하 예정', '#ffe27a'); this.fx('announce', 0, 0, 0, '보급 투하'); break; } }
    }
    if (!this.opts.tutorial) for (const q of this.quests) if (!q.done && q.check(this)) { q.done = true; this.factions[0].cash += q.reward; this.fx('quest', 0, 0, q.reward, q.text); }
    updatePopulation(this, false);
  }
  updateZone(dt: number): void {
    if (this.opts.tutorial) return;
    const z = this.zone; for (const p of this.planes) { p.x += p.vx * dt; p.y += p.vy * dt; if (!p.dropped && (p.tx - p.x) * p.vx + (p.ty - p.y) * p.vy <= 0) { p.dropped = true; this.spawnLoot('crate', p.tx, p.ty, 0, undefined, 5); } }
    this.planes = this.planes.filter(p => p.x > -3000 && p.y > -3000 && p.x < SIZE + 3000 && p.y < SIZE + 3000);
    if (z.phase >= ZONE_PHASES.length) return;
    z.t -= dt; const ph = ZONE_PHASES[z.phase];
    if (!z.shrinking) {
      if (z.nr === z.r) { // 다음 원 예고
        z.nr = ph[2]; const room = Math.max(0, z.r - z.nr) * 0.75, a = this.rng() * 6.28, d = this.rng() * Math.min(room, z.phase === 0 ? 900 : 700);
        z.nx = Math.max(z.nr * 0.6 + 200, Math.min(SIZE - z.nr * 0.6 - 200, z.x + Math.cos(a) * d)); z.ny = Math.max(z.nr * 0.6 + 200, Math.min(SIZE - z.nr * 0.6 - 200, z.y + Math.sin(a) * d));
      }
      if (z.t <= 0) { z.shrinking = true; z.t = ph[1]; z.sx = z.x; z.sy = z.y; z.sr = z.r; this.say(`⚠️ 자기장 ${z.phase + 1}단계 수축 시작!`, '#c9a2ff'); this.fx('announce', 0, 0, 0, '자기장 수축'); this.fx('siren', 0, 0); }
    } else {
      const k = 1 - Math.max(0, z.t) / ph[1]; z.x = z.sx + (z.nx - z.sx) * k; z.y = z.sy + (z.ny - z.sy) * k; z.r = z.sr + (z.nr - z.sr) * k;
      if (z.t <= 0) { z.r = z.nr; z.x = z.nx; z.y = z.ny; z.shrinking = false; z.phase++; if (z.phase < ZONE_PHASES.length) z.t = ZONE_PHASES[z.phase][0]; }
    }
  }
  updateLoot(dt: number): void {
    for (const l of this.loot) {
      if (!l.alive) continue; if (l.fall > 0) { l.fall -= dt; if (l.fall <= 0) this.fx('thud', l.x, l.y); continue; }
      this.forNear(l.x, l.y, 40, a => {
        if (!l.alive || !a.alive || a.kind !== 'boss' || Math.hypot(a.x - l.x, a.y - l.y) > 32) return; const f = this.factions[a.f], auto = !f.player || this.opts.autoPlayer;
        if (l.type === 'cash') { f.cash += l.amount; f.earned += l.amount; this.fx('cash', l.x, l.y, l.amount, undefined, a.f); }
        else if (l.type === 'armor') { if (f.armor >= 100) return; f.armor = Math.min(100, f.armor + l.amount); }
        else if (l.type === 'medkit') f.medkits++;
        else if (l.type === 'crate') {
          const r = this.rng(), w: WeaponId = r < 0.4 ? 'minigun' : r < 0.75 ? 'railgun' : 'rocket'; this.giveWeapon(f, w); f.armor = 100; f.cash += 800; f.medkits++;
          if (this.rng() < 0.5) this.hireMercs(a.f, true);
          this.say(`${f.name} ▸ 보급 상자 획득: ${WEAPONS[w].name}`, f.color); this.fx('crate', l.x, l.y);
        } else if (l.type === 'weapon') { if (!auto) return; const d = WEAPONS[l.weapon!]; if (f.slots.some(s => s.id === l.weapon) || f.slots.length < 3 || f.slots.slice(1).some(s => WEAPONS[s.id].tier < d.tier)) { if (f.slots.length >= 3) f.cur = f.slots.slice(1).reduce((m, s, i) => WEAPONS[s.id].tier < WEAPONS[f.slots[m].id].tier ? i + 1 : m, 1); this.giveWeapon(f, l.weapon!, l.amount); } else return; }
        l.alive = false; this.fx('pickup', l.x, l.y);
      });
    }
  }
  checkElimination(): void {
    for (const f of this.factions) {
      if (!f.alive || this.boss(f.id) || f.respawnT > 0) continue;
      if (this.hq(f.id)) { f.respawnT = 5; continue; }
      f.place = this.aliveCount(); f.alive = false; f.diedAt = this.time;
      for (const a of this.actors) if (a.alive && a.f === f.id) { a.alive = false; this.byId.delete(a.id); this.fx('death', a.x, a.y, a.r, undefined, a.f); }
      for (const s of this.structures) if (s.alive && s.f === f.id) { s.alive = false; removeSolid(this.map, s.solid); this.fx('boom', s.x + s.w / 2, s.y + s.h / 2, 60); }
      for (const z of this.businesses) if (z.owner === f.id) { z.owner = -1; z.level = 1; }
      this.say(`☠️ ${f.name} 궤멸 — 남은 조직 ${this.aliveCount()}`, f.color); this.fx('announce', 0, 0, 0, `${f.name} 궤멸 · 남은 조직 ${this.aliveCount()}`);
    }
    const alive = this.factions.filter(f => f.alive);
    if (alive.length <= 1 || (!this.factions[0].alive && !this.opts.autoPlayer)) {
      this.over = true; const w = alive.length === 1 ? alive[0] : alive.length === 0 ? [...this.factions].sort((a, b) => b.diedAt - a.diedAt)[0] : null;
      if (w && alive.length <= 1) { w.place = 1; this.winner = w.id; }
    }
  }
  /** 직선 사격 가능 여부 */
  canSee(x0: number, y0: number, x1: number, y1: number): boolean { return clearLine(this.map, x0, y0, x1, y1, true); }
}
export type { BizKind };

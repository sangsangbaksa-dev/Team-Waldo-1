// FRONTLINE — 결정적(deterministic) 실시간 전략 시뮬레이션. 화면·입력과 무관하게 순수 데이터만 다룹니다.
// 1대1 온라인은 명령만 주고받는 락스텝이므로 Math.random·sin·cos·Date 를 쓰지 않습니다(+ - * / sqrt 만 사용).
import { ABILITIES, BUILDINGS, CARRY, MINE_TICKS, MULT, NODE_AMOUNT, RESEARCH, START_MINERALS, START_WORKERS, STIM_COST, SUPPLY_MAX, TANK_SIEGE, UNITS, type BuildKind, type ResearchKind, type UnitKind } from './config';
import { buildMap, type RtsMap } from './map';
import { Pather } from './path';

export type OrderType = 'idle' | 'move' | 'amove' | 'attack' | 'gather' | 'build';
export interface Order { t: OrderType; x: number; y: number; target: number; phase: number; timer: number }
export interface Unit {
  k: 'unit'; id: number; owner: number; kind: UnitKind; x: number; y: number; hp: number; cd: number; o: Order;
  path: number[]; pi: number; repath: number; carry: number; fx: number; fy: number; fired: number; hurt: number; mine: number;
  /** 특수 능력이 이 틱까지 켜져 있음. */ ab: number; /** 이 틱부터 특수 능력을 다시 쓸 수 있음. */ abcd: number;
}
export interface Building {
  k: 'building'; id: number; owner: number; kind: BuildKind; x: number; y: number; size: number; hp: number; maxhp: number;
  /** 건설이 끝났으면 true. 아니면 progress 틱 만큼 지어진 상태. */ done: boolean; progress: number;
  queue: Array<{ u: UnitKind; left: number }>; rx: number; ry: number; rnode: number; cd: number; fired: number; hurt: number; fx: number; fy: number;
  /** 연구 중인 강화. */ research: { r: ResearchKind; left: number } | null;
  /** 건설 중인데 일꾼이 없었던 시간(틱). */ idle: number;
}
export interface ResNode { k: 'node'; id: number; x: number; y: number; amount: number; busyUntil: number; miner?: number }
export type Entity = Unit | Building | ResNode;
export interface Player { minerals: number; used: number; cap: number; mined: number; kills: number; lost: number; made: number; defeated: boolean; income: number; up: Record<ResearchKind, boolean> }

export type Cmd =
  | { k: 'move'; ids: number[]; x: number; y: number }
  | { k: 'amove'; ids: number[]; x: number; y: number }
  | { k: 'attack'; ids: number[]; target: number }
  | { k: 'gather'; ids: number[]; node: number }
  | { k: 'stop'; ids: number[] }
  | { k: 'build'; id: number; b: BuildKind; x: number; y: number; q?: boolean }
  | { k: 'ability'; ids: number[] }
  | { k: 'research'; b: number; r: ResearchKind }
  | { k: 'resume'; ids: number[]; b: number }
  | { k: 'train'; b: number; u: UnitKind }
  | { k: 'cancel'; b: number; i: number }
  | { k: 'rally'; b: number; x: number; y: number; node: number }
  | { k: 'surrender' };

export type SimEvent =
  | { t: 'shot'; w: 'bullet' | 'rocket' | 'cannon'; owner: number; x0: number; y0: number; x1: number; y1: number; splash: number }
  | { t: 'die'; kind: UnitKind | BuildKind; building: boolean; owner: number; x: number; y: number; size: number }
  | { t: 'built'; kind: BuildKind; owner: number; x: number; y: number }
  | { t: 'trained'; kind: UnitKind; owner: number; x: number; y: number }
  | { t: 'ability'; kind: UnitKind; owner: number; x: number; y: number }
  | { t: 'heal'; owner: number; x0: number; y0: number; x1: number; y1: number }
  | { t: 'alert'; owner: number; x: number; y: number }
  | { t: 'deposit'; owner: number; x: number; y: number }
  | { t: 'mined'; x: number; y: number }
  | { t: 'placed'; owner: number; x: number; y: number }
  | { t: 'researched'; owner: number; r: ResearchKind }
  | { t: 'rescued'; owner: number; kind: BuildKind; x: number; y: number }
  | { t: 'orphan'; owner: number; kind: BuildKind; x: number; y: number };

const idle = (): Order => ({ t: 'idle', x: 0, y: 0, target: 0, phase: 0, timer: 0 });
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const sq = (v: number): number => v * v;

/** scripted: 승패를 시뮬레이션이 아니라 캠페인 미션이 정합니다(건물이 모두 사라져도 끝나지 않음). */
export interface SimOptions { income?: [number, number]; scripted?: boolean }

export class RtsSim {
  tick = 0; winner = -1; nextId = 1;
  readonly map: RtsMap; readonly grid: Uint8Array; readonly pather: Pather;
  units: Unit[] = []; buildings: Building[] = []; nodes: ResNode[] = [];
  players: Player[]; readonly index = new Map<number, Entity>();
  events: SimEvent[] = []; record = true;
  private incomeMult: [number, number]; readonly scripted: boolean;
  private head: Int32Array; private nextU = new Int32Array(0); private lastAlert = [-999, -999];

  constructor(opts: SimOptions = {}) {
    this.map = buildMap(); const n = this.map.size;
    this.grid = new Uint8Array(this.map.terrain); this.pather = new Pather(n, this.grid);
    this.scripted = opts.scripted === true; this.incomeMult = opts.income ?? [1, 1]; this.head = new Int32Array(Math.ceil(n / 2) ** 2);
    this.players = [0, 1].map(() => ({ minerals: START_MINERALS, used: 0, cap: 0, mined: 0, kills: 0, lost: 0, made: 0, defeated: false, income: 0, up: { atk: false, arm: false, cannon: false, speed: false } }));
    for (const nd of this.map.nodes) if (nd.base < 2) this.addNode(nd.x, nd.y);
    for (const nd of this.map.nodes) if (nd.base >= 2) this.addNode(nd.x, nd.y);
    for (let p = 0; p < 2; p++) {
      const s = this.map.starts[p], hq = this.addBuilding(p, 'hq', s.x, s.y, true);
      const home = this.nodes.filter(nd => this.dist(nd.x + 0.5, nd.y + 0.5, hq.x + 2, hq.y + 2) < 14);
      hq.rnode = home[0]?.id ?? 0;
      for (let i = 0; i < START_WORKERS; i++) { const u = this.spawn(p, 'worker', hq); if (hq.rnode) this.order(u, { t: 'gather', target: hq.rnode, x: 0, y: 0, phase: 0, timer: 0 }); }
    }
    this.recount();
  }

  // ---------- 조회 ----------
  unit(id: number): Unit | undefined { const e = this.index.get(id); return e?.k === 'unit' ? e : undefined; }
  building(id: number): Building | undefined { const e = this.index.get(id); return e?.k === 'building' ? e : undefined; }
  node(id: number): ResNode | undefined { const e = this.index.get(id); return e?.k === 'node' ? e : undefined; }
  dist(ax: number, ay: number, bx: number, by: number): number { return Math.sqrt(sq(ax - bx) + sq(ay - by)); }
  /** 점에서 건물 사각형까지의 거리. */
  rectDist(px: number, py: number, b: { x: number; y: number; size: number }): number {
    const dx = Math.max(b.x - px, 0, px - (b.x + b.size)), dy = Math.max(b.y - py, 0, py - (b.y + b.size)); return Math.sqrt(dx * dx + dy * dy);
  }
  /** 공격자 u 가 대상 e 의 가장자리까지 떨어진 거리. */
  gap(u: { x: number; y: number }, ur: number, e: Unit | Building): number {
    return e.k === 'unit' ? this.dist(u.x, u.y, e.x, e.y) - ur - UNITS[e.kind].radius : this.rectDist(u.x, u.y, e) - ur;
  }
  center(e: Unit | Building | ResNode): { x: number; y: number } { return e.k === 'unit' ? { x: e.x, y: e.y } : e.k === 'node' ? { x: e.x + 0.5, y: e.y + 0.5 } : { x: e.x + e.size / 2, y: e.y + e.size / 2 }; }
  emit(e: SimEvent): void { if (this.record) { this.events.push(e); if (this.events.length > 1500) this.events.splice(0, 500); } }
  drain(): SimEvent[] { const e = this.events; this.events = []; return e; }

  // ---------- 생성 ----------
  addNode(x: number, y: number): ResNode {
    const nd: ResNode = { k: 'node', id: this.nextId++, x, y, amount: NODE_AMOUNT, busyUntil: 0 };
    this.nodes.push(nd); this.index.set(nd.id, nd); this.grid[y * this.map.size + x] = 3; return nd;
  }
  addBuilding(owner: number, kind: BuildKind, x: number, y: number, done: boolean): Building {
    const d = BUILDINGS[kind], b: Building = { k: 'building', id: this.nextId++, owner, kind, x, y, size: d.size, hp: done ? d.hp : Math.round(d.hp * 0.1), maxhp: d.hp, done, progress: done ? d.time : 0, queue: [], rx: 0, ry: 0, rnode: 0, cd: 0, fired: -99, hurt: -99, fx: 0, fy: 1, research: null, idle: 0 };
    this.buildings.push(b); this.index.set(b.id, b); this.mark(b, 2); return b;
  }
  private mark(b: Building, v: number): void { for (let j = 0; j < b.size; j++) for (let i = 0; i < b.size; i++) this.grid[(b.y + j) * this.map.size + b.x + i] = v; }
  spawn(owner: number, kind: UnitKind, from: Building): Unit { const at = this.spawnPoint(from); return this.spawnAt(owner, kind, at.x, at.y); }
  /** 정해진 자리에 유닛을 만듭니다(캠페인 증원·시작 병력용). 자리가 막혀 있으면 가까운 빈 칸으로 옮깁니다. */
  spawnAt(owner: number, kind: UnitKind, x: number, y: number): Unit {
    const at = this.pather.freeAt(x, y) ? { x, y } : this.pather.nearestFree(x, y) ?? { x, y }, d = UNITS[kind];
    const u: Unit = { k: 'unit', id: this.nextId++, owner, kind, x: at.x, y: at.y, hp: d.hp, cd: 0, o: idle(), path: [], pi: 0, repath: 0, carry: 0, fx: owner === 0 ? 1 : -1, fy: 0, fired: -99, hurt: -99, mine: 0, ab: 0, abcd: 0 };
    this.units.push(u); this.index.set(u.id, u); return u;
  }
  /** 건물 둘레의 빈 칸 중 집결지에 가장 가까운 곳. */
  private spawnPoint(b: Building): { x: number; y: number } {
    const tx = b.rx || this.map.size / 2, ty = b.ry || this.map.size / 2; let best = { x: b.x + b.size / 2, y: b.y + b.size + 0.5 }, bd = Infinity;
    for (let j = -1; j <= b.size; j++) for (let i = -1; i <= b.size; i++) {
      if (i >= 0 && i < b.size && j >= 0 && j < b.size) continue;
      const cx = b.x + i, cy = b.y + j; if (!this.pather.free(cx, cy)) continue;
      const d = sq(cx + 0.5 - tx) + sq(cy + 0.5 - ty); if (d < bd) { bd = d; best = { x: cx + 0.5, y: cy + 0.5 }; }
    }
    return best;
  }

  // ---------- 규칙 ----------
  /** 이 진영이 완성한 건물을 가지고 있는가. */
  has(owner: number, kind: BuildKind): boolean { return this.buildings.some(b => b.owner === owner && b.kind === kind && b.done); }
  canPlace(kind: BuildKind, x: number, y: number): boolean {
    const s = BUILDINGS[kind].size; if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) if (!this.pather.free(x + i, y + j)) return false;
    return true;
  }
  /** (ax,ay) 가까이에서 둘레가 비어 있고 광물과 떨어진 첫 자리. minD2 보다 가까운 자리는 건너뜁니다. */
  findSite(kind: BuildKind, ax: number, ay: number, minD2 = 0, range = 22): { x: number; y: number } | null {
    const size = BUILDINGS[kind].size; let best: { x: number; y: number } | null = null, bd = Infinity;
    for (let y = Math.floor(ay) - range; y <= Math.floor(ay) + range; y++) for (let x = Math.floor(ax) - range; x <= Math.floor(ax) + range; x++) {
      const d = (x + size / 2 - ax) ** 2 + (y + size / 2 - ay) ** 2; if (d >= bd || d < minD2) continue;
      if (!this.roomy(x, y, size)) continue; best = { x, y }; bd = d;
    }
    return best;
  }
  private roomy(x: number, y: number, size: number): boolean {
    for (let j = -1; j <= size; j++) for (let i = -1; i <= size; i++) if (!this.pather.free(x + i, y + j)) return false;
    for (const nd of this.nodes) if (nd.x > x - 4 && nd.x < x + size + 3 && nd.y > y - 4 && nd.y < y + size + 3) return false;
    return true;
  }
  canTrain(owner: number, kind: UnitKind): boolean { const r = UNITS[kind].req; return !r || this.has(owner, r); }
  recount(): void {
    for (const p of this.players) { p.used = 0; p.cap = 0; }
    for (const u of this.units) this.players[u.owner].used += UNITS[u.kind].supply;
    for (const b of this.buildings) {
      const p = this.players[b.owner]; if (b.done) p.cap += BUILDINGS[b.kind].supply;
      for (const q of b.queue) p.used += UNITS[q.u].supply;
    }
    for (const p of this.players) p.cap = Math.min(p.cap, SUPPLY_MAX);
  }
  supplyLeft(owner: number): number { const p = this.players[owner]; return p.cap - p.used; }

  private releaseMining(u: Unit): void {
    if (u.o.t !== 'gather' || u.o.phase !== 1) return;
    const nd = this.node(u.o.target); if (nd?.miner === u.id) { nd.busyUntil = this.tick; nd.miner = undefined; }
  }
  order(u: Unit, o: Order): void { this.releaseMining(u); u.o = o; u.path = []; u.pi = 0; u.repath = 0; }

  /** 명령 하나를 적용합니다. 규칙에 어긋나는 명령은 무시하고 false 를 돌려줍니다. */
  apply(owner: number, c: Cmd): boolean {
    if (this.winner !== -1 || (owner !== 0 && owner !== 1) || typeof c !== 'object' || c === null) return false;
    const mine = (ids: unknown): Unit[] => {
      if (!Array.isArray(ids)) return [];
      const out: Unit[] = [], seen = new Set<number>(); for (const id of ids.slice(0, 120)) { const u = num(id) ? this.unit(id) : undefined; if (u && u.owner === owner && u.hp > 0 && !seen.has(u.id)) { seen.add(u.id); out.push(u); } }
      return out;
    };
    switch (c.k) {
      case 'move': case 'amove': {
        if (!num(c.x) || !num(c.y)) return false; const us = mine(c.ids); if (!us.length) return false;
        const cols = Math.ceil(Math.sqrt(us.length)), rows = Math.ceil(us.length / cols), x = Math.min(Math.max(c.x, 1.5), this.map.size - 1.5), y = Math.min(Math.max(c.y, 1.5), this.map.size - 1.5);
        us.sort((a, b) => a.id - b.id).forEach((u, i) => {
          const gap = us.length > 1 ? 1.15 : 0, tx = x + ((i % cols) - (cols - 1) / 2) * gap, ty = y + (Math.floor(i / cols) - (rows - 1) / 2) * gap;
          this.order(u, { t: c.k, x: Math.min(this.map.size - 0.5, Math.max(0.5, tx)), y: Math.min(this.map.size - 0.5, Math.max(0.5, ty)), target: 0, phase: 0, timer: 0 });
        });
        return true;
      }
      case 'attack': {
        const t = num(c.target) ? this.index.get(c.target) : undefined; if (!t || t.k === 'node' || t.owner === owner || t.hp <= 0) return false;
        const us = mine(c.ids).filter(u => UNITS[u.kind].dmg > 0); if (!us.length) return false;
        for (const u of us) this.order(u, { t: 'attack', x: 0, y: 0, target: t.id, phase: 0, timer: 0 }); return true;
      }
      case 'gather': {
        const nd = num(c.node) ? this.node(c.node) : undefined; if (!nd) return false;
        const us = mine(c.ids).filter(u => u.kind === 'worker'); if (!us.length) return false;
        for (const u of us) this.order(u, { t: 'gather', x: 0, y: 0, target: nd.id, phase: u.carry > 0 ? 2 : 0, timer: 0 }); return true;
      }
      case 'stop': { const us = mine(c.ids); for (const u of us) { this.order(u, idle()); u.o.phase = 9; /* 일부러 세운 일꾼은 자동 복귀하지 않음 */ } return us.length > 0; }
      case 'build': {
        const w = num(c.id) ? this.unit(c.id) : undefined, d = BUILDINGS[c.b];
        if (!Object.prototype.hasOwnProperty.call(BUILDINGS, c.b) || !w || w.hp <= 0 || w.owner !== owner || w.kind !== 'worker' || !d || !num(c.x) || !num(c.y)) return false;
        const p = this.players[owner]; if (p.minerals < d.cost || (d.req && !this.has(owner, d.req)) || !this.canPlace(c.b, c.x, c.y)) return false;
        p.minerals -= d.cost; const b = this.addBuilding(owner, c.b, c.x, c.y, false); this.emit({ t: 'placed', owner, x: b.x + b.size / 2, y: b.y + b.size / 2 });
        // q: 이미 짓고 있는 건물이 있으면 그것부터 마치고(afterBuild), 새 건물은 그다음에 맡습니다.
        const busy = w.o.t === 'build' && this.building(w.o.target)?.done === false;
        if (!(c.q === true && busy)) this.order(w, { t: 'build', x: 0, y: 0, target: b.id, phase: 0, timer: 0 }); return true;
      }
      case 'resume': {
        const b = num(c.b) ? this.building(c.b) : undefined; if (!b || b.owner !== owner || b.done) return false;
        const us = mine(c.ids).filter(u => u.kind === 'worker'); for (const u of us) this.order(u, { t: 'build', x: 0, y: 0, target: b.id, phase: 0, timer: 0 }); return us.length > 0;
      }
      case 'train': {
        const b = num(c.b) ? this.building(c.b) : undefined, d = UNITS[c.u]; if (!Object.prototype.hasOwnProperty.call(UNITS, c.u) || !b || b.hp <= 0 || !d || b.owner !== owner || !b.done || d.from !== b.kind || !this.canTrain(owner, c.u)) return false;
        const p = this.players[owner]; if (b.queue.length >= 5 || p.minerals < d.cost || p.cap - p.used < d.supply) return false;
        p.minerals -= d.cost; p.used += d.supply; b.queue.push({ u: c.u, left: d.time }); return true;
      }
      case 'cancel': {
        const b = num(c.b) ? this.building(c.b) : undefined; if (!b || b.owner !== owner || !num(c.i)) return false;
        const p = this.players[owner];
        if (c.i === -2) { if (!b.research) return false; p.minerals += RESEARCH[b.research.r].cost; b.research = null; return true; }
        if (c.i < 0) { if (b.done || b.kind === 'hq' && this.buildings.filter(x => x.owner === owner && x.kind === 'hq' && x.hp > 0).length < 2) return false; p.minerals += Math.floor(BUILDINGS[b.kind].cost * 0.75); this.remove(b); this.recount(); return true; }
        const q = b.queue[c.i]; if (!q) return false; p.minerals += UNITS[q.u].cost; b.queue.splice(c.i, 1); this.recount(); return true;
      }
      case 'ability': {
        let n = 0;
        for (const u of mine(c.ids)) {
          const a = ABILITIES[u.kind]; if (!a || u.hp <= 0 || u.abcd > this.tick) continue;
          if (u.kind === 'marine') { if (u.hp <= STIM_COST + 1) continue; u.hp -= STIM_COST; u.hurt = this.tick; }
          u.ab = this.tick + (a.dur || 12); u.abcd = this.tick + a.cd; n++;
          if (u.kind === 'medic') this.burstHeal(u);
          this.emit({ t: 'ability', kind: u.kind, owner, x: u.x, y: u.y });
        }
        return n > 0;
      }
      case 'research': {
        const b = num(c.b) ? this.building(c.b) : undefined, d = RESEARCH[c.r]; if (!Object.prototype.hasOwnProperty.call(RESEARCH, c.r) || !b || b.hp <= 0 || !d || b.owner !== owner || !b.done || d.from !== b.kind || b.research) return false;
        const p = this.players[owner]; if (p.up[c.r] || p.minerals < d.cost || this.buildings.some(x => x.owner === owner && x.research?.r === c.r)) return false;
        p.minerals -= d.cost; b.research = { r: c.r, left: d.time }; return true;
      }
      case 'rally': {
        const b = num(c.b) ? this.building(c.b) : undefined; if (!b || b.owner !== owner || !num(c.x) || !num(c.y) || !BUILDINGS[b.kind].trains.length) return false;
        b.rx = Math.min(Math.max(c.x, 1), this.map.size - 1); b.ry = Math.min(Math.max(c.y, 1), this.map.size - 1); b.rnode = num(c.node) && this.node(c.node) ? c.node : 0; return true;
      }
      case 'surrender': this.players[owner].defeated = true; return true;
    }
    return false;
  }

  // ---------- 틱 ----------
  step(): void {
    if (this.winner !== -1) return;
    this.tick++;
    for (const b of this.buildings) this.updateBuilding(b);
    if (this.tick % 10 === 0) this.tendSites();
    for (const u of this.units) if (u.hp > 0) this.updateUnit(u);
    this.separate();
    this.reap();
    this.recount();
    if (this.tick % 20 === 0) for (let i = 0; i < 2; i++) this.players[i].income = this.players[i].mined;
    this.judge();
  }
  private judge(): void {
    if (this.scripted) return;
    const alive = [0, 1].map(p => !this.players[p].defeated && this.buildings.some(b => b.owner === p));
    if (!alive[0] && !alive[1]) this.winner = 2; else if (!alive[0]) this.winner = 1; else if (!alive[1]) this.winner = 0;
  }

  private updateBuilding(b: Building): void {
    if (b.hp <= 0) return;
    if (!b.done) return;
    if (b.research && --b.research.left <= 0) { this.players[b.owner].up[b.research.r] = true; this.emit({ t: 'researched', owner: b.owner, r: b.research.r }); b.research = null; }
    if (b.kind === 'tower') {
      if (b.cd > 0) b.cd--; else {
        const d = BUILDINGS.tower, t = this.pick(b.owner, b.x + b.size / 2, b.y + b.size / 2, d.range!, false);
        if (t) { const tc = this.center(t); b.fx = tc.x - (b.x + 1); b.fy = tc.y - (b.y + 1); b.cd = d.cd!; b.fired = this.tick; this.damage(b.owner, t, d.dmg!, 'bullet', 0, b.x + 1, b.y + 1); }
      }
      return;
    }
    const q = b.queue[0]; if (!q) return;
    if (--q.left > 0) return;
    b.queue.shift();
    const u = this.spawn(b.owner, q.u, b); this.players[b.owner].made++; this.emit({ t: 'trained', kind: q.u, owner: b.owner, x: u.x, y: u.y });
    if (b.rnode && this.node(b.rnode) && q.u === 'worker') this.order(u, { t: 'gather', target: b.rnode, x: 0, y: 0, phase: 0, timer: 0 });
    else if (b.rx || b.ry) this.order(u, { t: q.u === 'worker' ? 'move' : 'amove', x: b.rx, y: b.ry, target: 0, phase: 0, timer: 0 });
    else if (q.u === 'worker') { const nd = this.nearestNode(u.x, u.y, 18, false); if (nd) this.order(u, { t: 'gather', target: nd.id, x: 0, y: 0, phase: 0, timer: 0 }); }
  }

  /** 이 진영의 적 중 (x,y) 반경 안에서 가장 먼저 칠 대상. 공격할 수 있는 유닛 > 일꾼 > 건물 순으로 가중합니다. */
  pick(owner: number, x: number, y: number, range: number, extra = true): Unit | Building | null {
    let best: Unit | Building | null = null, bs = Infinity;
    for (const e of this.units) {
      if (e.owner === owner || e.hp <= 0) continue; const d = this.dist(x, y, e.x, e.y) - UNITS[e.kind].radius; if (d > range) continue;
      const s = d + (e.kind === 'worker' ? 2 : 0); if (s < bs) { bs = s; best = e; }
    }
    if (best && !extra) return best;
    for (const e of this.buildings) {
      if (e.owner === owner || e.hp <= 0) continue; const d = this.rectDist(x, y, e); if (d > range) continue;
      const s = d + (e.kind === 'tower' ? 1 : 5); if (s < bs) { bs = s; best = e; }
    }
    return best;
  }
  nearestNode(x: number, y: number, max: number, onlyFree: boolean): ResNode | null {
    let best: ResNode | null = null, bd = max * max;
    for (const nd of this.nodes) { if (onlyFree && (nd.busyUntil > this.tick || nd.miner !== undefined)) continue; const d = sq(nd.x + 0.5 - x) + sq(nd.y + 0.5 - y); if (d < bd) { bd = d; best = nd; } }
    return best;
  }
  nearestHq(owner: number, x: number, y: number): Building | null {
    let best: Building | null = null, bd = Infinity;
    for (const b of this.buildings) if (b.owner === owner && b.kind === 'hq' && b.done && b.hp > 0) { const d = this.rectDist(x, y, b); if (d < bd) { bd = d; best = b; } }
    return best;
  }

  private damage(owner: number, t: Unit | Building, dmg: number, w: 'bullet' | 'rocket' | 'cannon', splash: number, fromX: number, fromY: number): void {
    const up = this.players[owner].up; if (w === 'cannon' ? up.cannon : up.atk) { dmg *= 1.25; if (w === 'cannon') splash += 0.4; }
    const tc = this.center(t); this.emit({ t: 'shot', w, owner, x0: fromX, y0: fromY, x1: tc.x, y1: tc.y, splash });
    const hit = (e: Unit | Building, mult: number): void => {
      const armor = e.k === 'unit' ? UNITS[e.kind].armor : 'structure', amt = Math.max(1, Math.round(dmg * MULT[w][armor] * mult * (this.players[e.owner].up.arm ? 0.8 : 1)));
      e.hp -= amt; e.hurt = this.tick;
      if (this.tick - this.lastAlert[e.owner] > 120) { this.lastAlert[e.owner] = this.tick; this.emit({ t: 'alert', owner: e.owner, x: this.center(e).x, y: this.center(e).y }); }
      if (e.hp <= 0) this.players[owner].kills++;
    };
    hit(t, 1);
    if (splash > 0) {
      for (const e of this.units) if (e.owner !== owner && e !== t && e.hp > 0 && this.dist(e.x, e.y, tc.x, tc.y) <= splash) hit(e, 0.5);
      for (const e of this.buildings) if (e.owner !== owner && e !== t && e.hp > 0 && this.rectDist(tc.x, tc.y, e) <= splash) hit(e, 0.5);
    }
  }

  // ---------- 유닛 ----------
  private updateUnit(u: Unit): void {
    const d = UNITS[u.kind]; if (u.cd > 0) u.cd--; if (u.repath > 0) u.repath--;
    const o = u.o; if (d.heal) this.medic(u);
    switch (o.t) {
      case 'idle': {
        if (u.kind === 'worker') this.idleWorker(u);
        else if (d.dmg > 0 && (u.id + this.tick) % 4 === 0) { const t = this.pick(u.owner, u.x, u.y, Math.max(d.range + 1.5, 7)); if (t) { this.order(u, { t: 'attack', x: u.x, y: u.y, target: t.id, phase: 1, timer: 0 }); } }
        break;
      }
      case 'move': if (this.walk(u, o.x, o.y, this.speedOf(u), 0.25)) this.order(u, idle()); break;
      case 'amove': {
        let t = o.target ? this.unit(o.target) ?? this.building(o.target) : undefined;
        if (o.target && (!t || t.hp <= 0 || this.gap(u, d.radius, t) > d.range + 6)) { t = undefined; o.target = 0; u.path = []; u.pi = 0; u.repath = 0; }
        if (!t && d.dmg > 0 && (u.id + this.tick) % 3 === 0) { const f = this.pick(u.owner, u.x, u.y, d.range + 3.5); if (f) { t = f; o.target = f.id; u.path = []; u.pi = 0; u.repath = 0; } }
        if (t) this.engage(u, t); else if (this.walk(u, o.x, o.y, this.speedOf(u), 0.6)) this.order(u, idle());
        break;
      }
      case 'attack': {
        const t = this.unit(o.target) ?? this.building(o.target);
        // 자동으로 잡은 목표(phase 1)는 너무 멀어지면 놓아 줍니다.
        if (!t || t.hp <= 0 || (o.phase === 1 && this.dist(u.x, u.y, o.x, o.y) > 14)) { this.order(u, idle()); break; }
        this.engage(u, t); break;
      }
      case 'gather': this.gather(u); break;
      case 'build': this.construct(u); break;
    }
  }

  /** 강화(기동 훈련)와 특수 능력을 반영한 이동 속도. 일꾼은 강화의 영향을 받지 않습니다. */
  private speedOf(u: Unit): number {
    let s = UNITS[u.kind].speed; if (u.kind !== 'worker' && this.players[u.owner].up.speed) s *= 1.12;
    if (u.ab > this.tick) { if (u.kind === 'marine') s *= 1.35; else if (u.kind === 'jeep') s *= 1.8; else if (u.kind === 'tank') s = 0; }
    return s;
  }
  /** 이 유닛의 포격 태세(전차 능력)가 켜져 있는가. */
  private sieged(u: Unit): boolean { return u.kind === 'tank' && u.ab > this.tick; }
  /** 능력으로 줄어드는 쿨다운(틱). */
  private cooldownOf(u: Unit): number {
    const d = UNITS[u.kind]; if (u.ab <= this.tick) return d.cd;
    return Math.max(1, Math.round(d.cd * (u.kind === 'marine' ? 0.6 : u.kind === 'rocket' ? 0.5 : 1)));
  }
  /** 응급 처치: 주변 아군 보병·일꾼·의무병을 한 번에 고칩니다. */
  private burstHeal(m: Unit): void {
    let shown = 0;
    for (const e of this.units) {
      if (e.owner !== m.owner || e.hp <= 0 || e.kind === 'tank' || e.kind === 'jeep' || this.dist(m.x, m.y, e.x, e.y) > 5.5) continue;
      const max = UNITS[e.kind].hp; if (e.hp >= max) continue; e.hp = Math.min(max, e.hp + max * 0.4);
      if (shown++ < 8) this.emit({ t: 'heal', owner: m.owner, x0: m.x, y0: m.y, x1: e.x, y1: e.y });
    }
  }

  /** 의무병: 가까이에서 가장 많이 다친 아군을 고칩니다. 가만히 있으면 다친 아군 쪽으로 다가갑니다. */
  private medic(u: Unit): void {
    const d = UNITS[u.kind], heal = d.heal ?? 0; let best: Unit | null = null, bs = Infinity, far: Unit | null = null, fd = 9;
    for (const e of this.units) {
      if (e.owner !== u.owner || e === u || e.hp <= 0 || e.kind === 'tank' || e.kind === 'jeep') continue;
      const m = UNITS[e.kind].hp; if (e.hp >= m) continue;
      const dd = this.dist(u.x, u.y, e.x, e.y);
      if (dd <= d.range) { const r = e.hp / m; if (r < bs) { bs = r; best = e; } } else if (dd < fd) { fd = dd; far = e; }
    }
    if (best) {
      if (u.cd <= 0) { u.cd = 5; best.hp = Math.min(UNITS[best.kind].hp, best.hp + heal / 4); u.fired = this.tick; this.emit({ t: 'heal', owner: u.owner, x0: u.x, y0: u.y, x1: best.x, y1: best.y }); }
      u.fx = best.x - u.x; const l = Math.sqrt(sq(best.x - u.x) + sq(best.y - u.y)) || 1; u.fx /= l; u.fy = (best.y - u.y) / l;
    }
    if (u.o.t !== 'idle' || u.o.phase === 9) return;
    if (best || !far) {
      u.o.target = 0;
      u.path = [];
      return;
    }
    if (u.o.target !== far.id || u.repath <= 0) {
      u.o.target = far.id;
      u.path = this.pather.find(u.x, u.y, far.x, far.y) ?? [];
      u.pi = 0;
      u.repath = 5;
    }
    this.follow(u, this.speedOf(u));
  }

  /** 사정거리 안이면 쏘고, 아니면 다가갑니다. */
  private engage(u: Unit, t: Unit | Building): void {
    const d = UNITS[u.kind], gap = this.gap(u, d.radius, t), tc = this.center(t), siege = this.sieged(u);
    if (gap <= d.range + (siege ? TANK_SIEGE.range : 0)) {
      u.path = []; const dx = tc.x - u.x, dy = tc.y - u.y, l = Math.sqrt(dx * dx + dy * dy) || 1; u.fx = dx / l; u.fy = dy / l;
      if (u.cd <= 0) { u.cd = this.cooldownOf(u); u.fired = this.tick; this.damage(u.owner, t, d.dmg * (siege ? TANK_SIEGE.dmg : 1), d.weapon, d.splash + (siege ? TANK_SIEGE.splash : 0), u.x, u.y); }
      return;
    }
    if (siege) return;
    if (u.repath <= 0) {
      const goal = t.k === 'unit' ? { x: t.x, y: t.y } : this.approach(t, u.x, u.y);
      u.path = this.pather.find(u.x, u.y, goal.x, goal.y) ?? []; u.pi = 0; u.repath = 14;
    }
    this.follow(u, this.speedOf(u));
  }
  /** 건물 둘레에서 u 와 가장 가까운 빈 칸. */
  approach(b: Building, ux: number, uy: number): { x: number; y: number } {
    let best = { x: b.x + b.size / 2, y: b.y + b.size / 2 }, bd = Infinity;
    for (let j = -1; j <= b.size; j++) for (let i = -1; i <= b.size; i++) {
      if (i >= 0 && i < b.size && j >= 0 && j < b.size) continue;
      const cx = b.x + i, cy = b.y + j; if (!this.pather.free(cx, cy)) continue; const dd = sq(cx + 0.5 - ux) + sq(cy + 0.5 - uy); if (dd < bd) { bd = dd; best = { x: cx + 0.5, y: cy + 0.5 }; }
    }
    return best;
  }
  private approachNode(nd: ResNode, ux: number, uy: number): { x: number; y: number } {
    let best = { x: nd.x + 0.5, y: nd.y + 0.5 }, bd = Infinity;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      if (!i && !j) continue; const cx = nd.x + i, cy = nd.y + j; if (!this.pather.free(cx, cy)) continue; const dd = sq(cx + 0.5 - ux) + sq(cy + 0.5 - uy); if (dd < bd) { bd = dd; best = { x: cx + 0.5, y: cy + 0.5 }; }
    }
    return best;
  }

  /** 목적지까지 길을 찾아 걷습니다. 도착하면 true. */
  private walk(u: Unit, gx: number, gy: number, speed: number, tol: number): boolean {
    const goal = this.pather.freeAt(gx, gy) ? { x: gx, y: gy } : this.pather.nearestFree(gx, gy);
    if (!goal) return false;
    if (this.dist(u.x, u.y, goal.x, goal.y) <= tol) return true;
    if (speed <= 0) return false;
    if (u.pi * 2 >= u.path.length) {
      if (u.repath > 0) return false;
      u.path = this.pather.find(u.x, u.y, goal.x, goal.y) ?? []; u.pi = 0; u.repath = 14;
      if (!u.path.length) return false;
    }
    return this.follow(u, speed) && this.dist(u.x, u.y, goal.x, goal.y) <= tol;
  }
  /** 경로를 따라 한 틱 이동. 경로 끝에 닿았으면 true. */
  private follow(u: Unit, speed: number): boolean {
    let left = speed / 20;
    while (left > 0 && u.pi * 2 < u.path.length) {
      const tx = u.path[u.pi * 2], ty = u.path[u.pi * 2 + 1], dx = tx - u.x, dy = ty - u.y, d = Math.sqrt(dx * dx + dy * dy);
      const travel = Math.min(d, left), x0 = u.x, y0 = u.y;
      if (d > 0) this.shift(u, dx / d * travel, dy / d * travel);
      if (this.dist(u.x, u.y, tx, ty) < 0.001) { left -= travel; u.pi++; }
      else { left = 0; if (this.dist(x0, y0, u.x, u.y) < 0.0001 || d <= travel) { u.path = []; u.pi = 0; } }
      if (d > 0.001) { u.fx = dx / d; u.fy = dy / d; }
    }
    return u.pi * 2 >= u.path.length;
  }
  private shift(u: Unit, dx: number, dy: number): void {
    const nx = u.x + dx, ny = u.y + dy;
    if (this.pather.freeAt(nx, u.y)) u.x = nx; if (this.pather.freeAt(u.x, ny)) u.y = ny;
  }

  private gather(u: Unit): void {
    const o = u.o, hq = this.nearestHq(u.owner, u.x, u.y);
    if (u.kind !== 'worker') { this.order(u, idle()); return; }
    if (o.phase !== 2) {
      let nd = this.node(o.target);
      if (!nd) { nd = this.nearestNode(hq ? hq.x + hq.size / 2 : u.x, hq ? hq.y + hq.size / 2 : u.y, 22, false) ?? undefined; if (!nd) { this.order(u, idle()); return; } o.target = nd.id; o.phase = 0; o.timer = 0; u.path = []; u.pi = 0; u.repath = 0; }
      if (o.phase === 0) {
        if (this.dist(u.x, u.y, nd.x + 0.5, nd.y + 0.5) <= 1.7) {
          if (nd.busyUntil > this.tick || nd.miner !== undefined && nd.miner !== u.id) {
            // 다른 일꾼이 캐는 중이면 비어 있는 이웃 광물로 옮기거나 잠깐 기다립니다.
            const alt = this.nearestNode(u.x, u.y, 9, true); if (alt && alt !== nd) { o.target = alt.id; u.path = []; u.pi = 0; u.repath = 0; }
          } else { nd.busyUntil = this.tick + MINE_TICKS; nd.miner = u.id; o.phase = 1; o.timer = MINE_TICKS; u.path = []; }
        } else {
          if (u.repath <= 0) { const g = this.approachNode(nd, u.x, u.y); u.path = this.pather.find(u.x, u.y, g.x, g.y) ?? []; u.pi = 0; u.repath = 40; }
          this.follow(u, this.speedOf(u));
        }
      } else if (this.dist(u.x, u.y, nd.x + 0.5, nd.y + 0.5) > 1.7) {
        this.releaseMining(u); o.phase = 0; o.timer = 0; u.path = []; u.pi = 0; u.repath = 0;
      } else if (--o.timer <= 0) {
        this.releaseMining(u); const take = Math.min(CARRY, nd.amount); nd.amount -= take; u.carry = take; this.emit({ t: 'mined', x: nd.x + 0.5, y: nd.y + 0.5 });
        if (nd.amount <= 0) { this.nodes.splice(this.nodes.indexOf(nd), 1); this.index.delete(nd.id); this.grid[nd.y * this.map.size + nd.x] = 0; }
        o.phase = 2; u.path = []; u.pi = 0; u.repath = 0;
      }
      return;
    }
    if (!hq) { this.order(u, idle()); return; }
    if (this.rectDist(u.x, u.y, hq) <= 1.3) {
      const mult = this.incomeMult[u.owner], p = this.players[u.owner], amt = Math.round(u.carry * mult);
      p.minerals += amt; p.mined += amt; u.carry = 0; this.emit({ t: 'deposit', owner: u.owner, x: u.x, y: u.y });
      o.phase = 0; u.path = []; u.pi = 0; u.repath = 0; return;
    }
    if (u.repath <= 0) { const g = this.approach(hq, u.x, u.y); u.path = this.pather.find(u.x, u.y, g.x, g.y) ?? []; u.pi = 0; u.repath = 40; }
    this.follow(u, this.speedOf(u));
  }

  private construct(u: Unit): void {
    const b = this.building(u.o.target);
    if (!b || b.hp <= 0 || b.done || u.kind !== 'worker') { this.afterBuild(u); return; }
    if (this.rectDist(u.x, u.y, b) > 1.35) {
      if (u.repath <= 0) { const g = this.approach(b, u.x, u.y); u.path = this.pather.find(u.x, u.y, g.x, g.y) ?? []; u.pi = 0; u.repath = 30; }
      this.follow(u, this.speedOf(u)); return;
    }
    u.path = []; u.fx = b.x + b.size / 2 - u.x; u.fy = b.y + b.size / 2 - u.y; u.mine = this.tick;
    const total = BUILDINGS[b.kind].time, before = Math.round(b.maxhp * (0.1 + 0.9 * b.progress / total)); b.progress++; const after = Math.round(b.maxhp * (0.1 + 0.9 * Math.min(1, b.progress / total))); b.hp = Math.min(b.maxhp, b.hp + Math.max(0, after - before));
    if (b.progress >= total) { b.done = true; b.hp = Math.max(b.hp, 1); this.emit({ t: 'built', kind: b.kind, owner: b.owner, x: b.x + b.size / 2, y: b.y + b.size / 2 }); this.afterBuild(u); }
  }
  /** 이 건물을 짓고 있는(또는 지으러 가는) 일꾼이 있는가. */
  /** 이동 명령 뒤 4초 이상 쉬는 일꾼은 가까운 미완성 건물을 이어 짓거나, 없으면 가까운 광물 채취로 복귀합니다('정지'로 세운 일꾼은 제외). */
  private idleWorker(u: Unit): void {
    const o = u.o; if (o.phase === 9) return;
    if (++o.timer < 80) return;
    let site: Building | null = null, sd = sq(30);
    for (const b of this.buildings) { if (b.owner !== u.owner || b.done || b.hp <= 0 || this.hasBuilder(b)) continue; const d = sq(b.x + b.size / 2 - u.x) + sq(b.y + b.size / 2 - u.y); if (d < sd) { sd = d; site = b; } }
    if (site) { this.order(u, { t: 'build', x: 0, y: 0, target: site.id, phase: 0, timer: 0 }); this.emit({ t: 'rescued', owner: u.owner, kind: site.kind, x: site.x + site.size / 2, y: site.y + site.size / 2 }); return; }
    const nd = this.nearestNode(u.x, u.y, 18, false);
    if (nd) this.order(u, { t: 'gather', target: nd.id, x: 0, y: 0, phase: u.carry > 0 ? 2 : 0, timer: 0 }); else o.phase = 9;
  }
  private hasBuilder(b: Building): boolean { return this.units.some(u => u.hp > 0 && u.o.t === 'build' && u.o.target === b.id); }
  /** 일꾼이 없는 건설 현장을 3초 뒤에 가까운 일꾼에게 넘깁니다(일꾼이 죽거나 다른 명령을 받아도 건물이 버려지지 않게). */
  private tendSites(): void {
    for (const b of this.buildings) {
      if (b.done || b.hp <= 0) { b.idle = 0; continue; }
      if (this.hasBuilder(b)) { b.idle = 0; continue; }
      b.idle += 10; if (b.idle < 60) continue;
      const w = this.spareWorker(b);
      if (w) { this.order(w, { t: 'build', x: 0, y: 0, target: b.id, phase: 0, timer: 0 }); b.idle = 0; this.emit({ t: 'rescued', owner: b.owner, kind: b.kind, x: b.x + b.size / 2, y: b.y + b.size / 2 }); }
      else if (b.idle === 60) this.emit({ t: 'orphan', owner: b.owner, kind: b.kind, x: b.x + b.size / 2, y: b.y + b.size / 2 });
    }
  }
  /** b 에서 가장 가까운, 채취 중이거나 쉬는 일꾼. */
  spareWorker(b: Building): Unit | null {
    let best: Unit | null = null, bd = sq(60); const c = this.center(b);
    for (const u of this.units) {
      if (u.hp <= 0 || u.owner !== b.owner || u.kind !== 'worker' || (u.o.t !== 'gather' && u.o.t !== 'idle') || (u.o.t === 'idle' && u.o.phase === 9)) continue;
      const d = sq(u.x - c.x) + sq(u.y - c.y) + (u.carry > 0 ? 100 : 0); if (d < bd) { bd = d; best = u; }
    }
    return best;
  }
  private afterBuild(u: Unit): void {
    let site: Building | null = null, sd = sq(30);
    for (const b of this.buildings) { if (b.owner !== u.owner || b.done || b.hp <= 0 || this.hasBuilder(b)) continue; const d = sq(b.x + b.size / 2 - u.x) + sq(b.y + b.size / 2 - u.y); if (d < sd) { sd = d; site = b; } }
    if (site) { this.order(u, { t: 'build', x: 0, y: 0, target: site.id, phase: 0, timer: 0 }); return; }
    const nd = this.nearestNode(u.x, u.y, 24, false);
    if (nd || u.carry > 0 && this.nearestHq(u.owner, u.x, u.y)) this.order(u, { t: 'gather', target: nd?.id ?? 0, x: 0, y: 0, phase: u.carry > 0 ? 2 : 0, timer: 0 }); else this.order(u, idle());
  }

  /** 겹친 유닛을 밀어냅니다. 움직이는 쪽은 덜, 서 있는 쪽은 더 밀립니다. 채취 중인 일꾼끼리는 통과합니다. */
  private separate(): void {
    const n = Math.ceil(this.map.size / 2), us = this.units, m = us.length;
    if (this.nextU.length < m) this.nextU = new Int32Array(m + 64);
    this.head.fill(-1);
    for (let i = 0; i < m; i++) { const u = us[i]; if (u.hp <= 0) continue; const c = Math.min(n - 1, Math.max(0, Math.floor(u.x / 2))) + Math.min(n - 1, Math.max(0, Math.floor(u.y / 2))) * n; this.nextU[i] = this.head[c]; this.head[c] = i; }
    for (let i = 0; i < m; i++) {
      const a = us[i]; if (a.hp <= 0) continue; const ar = UNITS[a.kind].radius, ax = Math.floor(a.x / 2), ay = Math.floor(a.y / 2);
      for (let cy = Math.max(0, ay - 1); cy <= Math.min(n - 1, ay + 1); cy++) for (let cx = Math.max(0, ax - 1); cx <= Math.min(n - 1, ax + 1); cx++) {
        for (let j = this.head[cx + cy * n]; j !== -1; j = this.nextU[j]) {
          if (j <= i) continue; const b = us[j]; const min = ar + UNITS[b.kind].radius;
          const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy; if (d2 >= min * min) continue;
          if (a.kind === 'worker' && b.kind === 'worker' && (a.o.t === 'gather' || a.o.t === 'build') && (b.o.t === 'gather' || b.o.t === 'build')) continue;
          const d = Math.sqrt(d2) || 0.001, push = (min - d), nx = d2 < 1e-6 ? 1 : dx / d, ny = d2 < 1e-6 ? 0 : dy / d;
          const am = a.o.t === 'idle' ? 0.8 : 0.35, bm = b.o.t === 'idle' ? 0.8 : 0.35, tot = am + bm;
          this.shift(a, -nx * push * bm / tot, -ny * push * bm / tot); this.shift(b, nx * push * am / tot, ny * push * am / tot);
        }
      }
    }
    // 건물이 올라선 자리에 있던 유닛은 가까운 빈 칸으로 비킵니다.
    for (const u of this.units) if (u.hp > 0 && !this.pather.freeAt(u.x, u.y)) { const f = this.pather.nearestFree(u.x, u.y, 8); if (f) { u.x = f.x; u.y = f.y; u.path = []; } }
  }

  private remove(b: Building): void {
    this.mark(b, 0); const i = this.buildings.indexOf(b); if (i >= 0) this.buildings.splice(i, 1); this.index.delete(b.id);
    // 지워진 자리를 다시 막는 지형이 있으면 복원합니다.
    for (let j = 0; j < b.size; j++) for (let i2 = 0; i2 < b.size; i2++) { const c = (b.y + j) * this.map.size + b.x + i2; if (this.map.terrain[c]) this.grid[c] = 1; }
    for (const nd of this.nodes) this.grid[nd.y * this.map.size + nd.x] = 3;
  }
  private reap(): void {
    for (const b of this.buildings.filter(x => x.hp <= 0)) {
      this.players[b.owner].lost++; this.emit({ t: 'die', kind: b.kind, building: true, owner: b.owner, x: b.x + b.size / 2, y: b.y + b.size / 2, size: b.size });
      this.remove(b);
    }
    if (this.units.some(u => u.hp <= 0)) {
      for (const u of this.units) if (u.hp <= 0) { this.releaseMining(u); this.players[u.owner].lost++; this.index.delete(u.id); this.emit({ t: 'die', kind: u.kind, building: false, owner: u.owner, x: u.x, y: u.y, size: 1 }); }
      this.units = this.units.filter(u => u.hp > 0);
    }
  }

  /** 동기화 확인용 요약값. 두 쪽의 상태가 같으면 같은 값이 나옵니다. */
  hash(): number {
    let h = this.tick | 0;
    const mix = (v: number): void => { h = (Math.imul(h ^ (Math.round(v * 64) | 0), 0x9e3779b1) + 0x7f4a7c15) | 0; h ^= h >>> 15; };
    for (const u of this.units) { mix(u.id); mix(u.x); mix(u.y); mix(u.hp); mix(u.ab); mix(u.abcd); }
    for (const b of this.buildings) { mix(b.id); mix(b.hp); mix(b.progress); mix(b.queue.length); mix(b.research?.left ?? -1); }
    for (const p of this.players) { mix(p.minerals); mix(p.mined); mix(+p.up.atk + 2 * +p.up.arm + 4 * +p.up.cannon + 8 * +p.up.speed); }
    return h >>> 0;
  }
}

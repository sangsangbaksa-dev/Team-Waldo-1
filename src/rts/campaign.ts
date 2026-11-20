// FRONTLINE — 캠페인 미션. 같은 시뮬레이션 위에 "목표"(점령·방어·호송·파괴)를 얹고, 정해진 시간에 증원을 보내는 스크립트입니다.
// 화면·입력과 무관합니다. 시뮬레이션은 scripted 로 만들어 승패를 이 모듈이 정합니다(락스텝 대전과는 별개).
import { RtsAi } from './ai';
import { TICK, UNITS, type BuildKind, type Difficulty, type UnitKind } from './config';
import type { Building, RtsSim, Unit } from './sim';

export interface Pt { x: number; y: number }
export interface Objective { id: string; text: string; done: boolean; failed: boolean; bonus: boolean; note: string }
/** 화면에 그리는 목표 표시(점령 지점·도착지·파괴 대상). */
export interface Marker { id: string; kind: 'point' | 'goal' | 'target'; x: number; y: number; r: number; label: string; /** 0 = 적 · 1 = 아군 · 2 = 중립 */ side: 0 | 1 | 2; /** 점령 진행도 0~1 */ progress: number }
export type CampEvent =
  | { t: 'objective'; id: string; text: string; bonus: boolean }
  | { t: 'wave'; text: string; x: number; y: number }
  | { t: 'capture'; label: string; mine: boolean }
  | { t: 'hint'; text: string }
  | { t: 'start'; text: string }
  | { t: 'end'; win: boolean };

export interface MissionDef {
  id: number; title: string; tag: string; blurb: string; brief: string[];
  /** 목표 시간(초). 이 안에 끝내면 별 하나를 더 받습니다. */ par: number;
  /** 보너스 목표 설명(별 하나). */ bonus: string;
  /** 적 AI 난이도. null 이면 스크립트로만 움직입니다. */ ai: Difficulty | null;
  /** 적 채취량 배율(기본 1). */ income?: number;
  setup(c: Campaign): void;
}

interface CapPoint { id: string; label: string; x: number; y: number; r: number; progress: number; owner: 0 | 1 | -1 }
interface Wave { at: number; kinds: Array<[UnitKind, number]>; from: Pt; to: Pt | null; warn: string; ids: number[]; spawned: boolean; warned: boolean }

const CAP_SECONDS = 6;
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

export class Campaign {
  readonly objectives: Objective[] = []; readonly points: CapPoint[] = []; readonly waves: Wave[] = [];
  readonly ai: RtsAi | null; events: CampEvent[] = [];
  result: 'win' | 'lose' | null = null; reason = '';
  rally: Pt = { x: 0, y: 0 };
  /** 미션이 켜 둔 상태값(타이머·단계 등). */
  readonly flag: Record<string, number> = {};
  private hooks: Array<() => void> = []; private markers: Marker[] = [];
  private vipId = 0; private vipMaxHp = 0; private targets: number[] = []; private lastHint = -999;

  constructor(readonly def: MissionDef, readonly sim: RtsSim) {
    this.ai = def.ai ? new RtsAi(1, def.ai) : null;
    def.setup(this); sim.recount();
    this.events.push({ t: 'start', text: def.title });
  }

  // ---------- 미션이 쓰는 도구 ----------
  get hq(): Building | undefined { return this.sim.buildings.find(b => b.owner === 0 && b.kind === 'hq'); }
  secs(): number { return this.sim.tick / TICK; }
  hook(fn: () => void): void { this.hooks.push(fn); }
  objective(id: string, text: string, bonus = false): void { this.objectives.push({ id, text, done: false, failed: false, bonus, note: '' }); }
  note(id: string, note: string): void { const o = this.objectives.find(x => x.id === id); if (o) o.note = note; }
  complete(id: string): void {
    const o = this.objectives.find(x => x.id === id); if (!o || o.done || o.failed) return; o.done = true; o.note = '';
    this.events.push({ t: 'objective', id, text: o.text, bonus: o.bonus });
  }
  failObjective(id: string): void { const o = this.objectives.find(x => x.id === id); if (o && !o.done) o.failed = true; }
  hint(text: string, every = 25): void { if (this.secs() - this.lastHint < every) return; this.lastHint = this.secs(); this.events.push({ t: 'hint', text }); }
  point(id: string, label: string, x: number, y: number, r = 4.2): void {
    const p = this.sim.pather.nearestFree(x, y) ?? { x, y }; this.points.push({ id, label, x: p.x, y: p.y, r, progress: 0, owner: -1 });
  }
  wave(at: number, kinds: Array<[UnitKind, number]>, from: Pt, to: Pt | null, warn: string): void { this.waves.push({ at, kinds, from, to, warn, ids: [], spawned: false, warned: false }); }
  win(reason: string): void { if (this.result) return; this.result = 'win'; this.reason = reason; this.sim.winner = 0; this.events.push({ t: 'end', win: true }); }
  lose(reason: string): void { if (this.result) return; this.result = 'lose'; this.reason = reason; this.sim.winner = 1; this.events.push({ t: 'end', win: false }); }

  /** 플레이어 기지를 꾸밉니다: 광물, 지어 둔 건물, 시작 병력. */
  base(o: { minerals: number; buildings?: BuildKind[]; army?: Array<[UnitKind, number]> }): void {
    const s = this.sim, hq = s.buildings.find(b => b.owner === 0 && b.kind === 'hq'); if (!hq) return;
    const hx = hq.x + 2, hy = hq.y + 2, dx = s.map.size / 2 - hx, dy = s.map.size / 2 - hy, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    s.players[0].minerals = o.minerals;
    for (const k of o.buildings ?? []) { const site = s.findSite(k, hx + ux * 7, hy + uy * 7, 0); if (site) s.addBuilding(0, k, site.x, site.y, true); }
    this.rally = s.pather.nearestFree(hx + ux * 12, hy + uy * 12) ?? { x: hx, y: hy };
    this.squad(0, o.army ?? [], this.rally);
  }
  /** 적 본진을 꾸밉니다: 광물과 지어 둔 건물. */
  enemy(o: { minerals: number; buildings?: BuildKind[] }): void {
    const s = this.sim, hq = s.buildings.find(b => b.owner === 1 && b.kind === 'hq'); if (!hq) return;
    const hx = hq.x + 2, hy = hq.y + 2, dx = s.map.size / 2 - hx, dy = s.map.size / 2 - hy, l = Math.hypot(dx, dy) || 1;
    s.players[1].minerals = o.minerals; for (const k of o.buildings ?? []) this.place(1, k, hx + dx / l * 7, hy + dy / l * 7);
  }
  /** 적(또는 아군)의 건물을 anchor 근처에 짓습니다. 지은 건물을 돌려줍니다. */
  place(owner: number, kind: BuildKind, ax: number, ay: number): Building | null {
    const site = this.sim.findSite(kind, ax, ay, 0, 10); return site ? this.sim.addBuilding(owner, kind, site.x, site.y, true) : null;
  }
  /** at 둘레에 부대를 줄지어 세웁니다. */
  squad(owner: number, kinds: Array<[UnitKind, number]>, at: Pt, to?: Pt | null): Unit[] {
    const out: Unit[] = []; let i = 0; const cols = 5;
    for (const [k, n] of kinds) for (let j = 0; j < n; j++, i++) {
      const u = this.sim.spawnAt(owner, k, at.x + ((i % cols) - (cols - 1) / 2) * 1.1, at.y + Math.floor(i / cols) * 1.1 - 1);
      if (to) this.sim.order(u, { t: 'amove', x: to.x, y: to.y, target: 0, phase: 0, timer: 0 });
      out.push(u);
    }
    return out;
  }
  mark(b: Building | null): void { if (b) this.targets.push(b.id); }
  /** 호송 차량을 만들어 둡니다(체력을 늘린 전차). */
  vip(at: Pt, hp: number): Unit { const u = this.sim.spawnAt(0, 'tank', at.x, at.y); u.hp = hp; this.vipId = u.id; this.vipMaxHp = hp; return u; }
  vipUnit(): Unit | undefined { return this.vipId ? this.sim.unit(this.vipId) : undefined; }
  /** 화면에 그릴 체력 기준(호송 차량은 늘어난 체력). */
  maxHp(u: Unit): number { return u.id === this.vipId ? this.vipMaxHp : UNITS[u.kind].hp; }
  isVip(id: number): boolean { return id === this.vipId; }
  alive(ids: number[]): number { let n = 0; for (const id of ids) { const u = this.sim.unit(id); if (u && u.hp > 0) n++; } return n; }
  addTarget(id: number): void { this.targets.push(id); }
  targetsLeft(): number { return this.targets.filter(id => this.sim.building(id)).length; }
  targetsTotal(): number { return this.targets.length; }
  setMarkers(m: Marker[]): void { this.markers = m; }
  /** 플레이어 병력(일꾼 제외) 중 p 가까이에 있는 수. */
  escortsNear(p: Pt, r: number): number { let n = 0; for (const u of this.sim.units) if (u.owner === 0 && u.hp > 0 && u.kind !== 'worker' && u.id !== this.vipId && dist(u, p) <= r) n++; return n; }
  foesNear(p: Pt, r: number): number { let n = 0; for (const u of this.sim.units) if (u.owner === 1 && u.hp > 0 && u.kind !== 'worker' && dist(u, p) <= r) n++; return n; }

  // ---------- 매 틱 ----------
  tick(): void {
    const s = this.sim; if (this.result) return;
    if (s.tick % 5 === 0) {
      this.updatePoints(); this.updateWaves(); for (const h of this.hooks) { if (this.result) break; h(); }
      if (!this.result) {
        if (s.players[0].defeated) this.lose('항복했습니다');
        else if (!s.buildings.some(b => b.owner === 0)) this.lose('모든 건물을 잃었습니다');
      }
    }
    if (this.ai && !this.result && s.tick % this.ai.interval === 3) this.ai.think(s);
  }

  private updatePoints(): void {
    const s = this.sim, step = 100 / (CAP_SECONDS * TICK / 5);
    for (const p of this.points) {
      let mine = 0, foe = 0;
      for (const u of s.units) { if (u.hp <= 0 || u.kind === 'worker' || dist(u, p) > p.r) continue; if (u.owner === 0) mine++; else foe++; }
      const before = p.owner;
      if (mine > 0 && foe === 0) p.progress = Math.min(100, p.progress + step * (1 + Math.min(mine, 4) * 0.25));
      else if (foe > 0 && mine === 0) p.progress = Math.max(0, p.progress - step * (1 + Math.min(foe, 4) * 0.25));
      if (p.owner !== 0 && p.progress >= 100) p.owner = 0; else if (p.owner === 0 && p.progress < 50) p.owner = -1;
      if (p.owner !== before) this.events.push({ t: 'capture', label: p.label, mine: p.owner === 0 });
    }
  }
  private updateWaves(): void {
    const s = this.sim, t = this.secs();
    for (const w of this.waves) {
      const at = w.to ?? this.hqPoint(), from = s.pather.nearestFree(w.from.x, w.from.y) ?? w.from;
      if (!w.warned && t >= w.at - 8) { w.warned = true; this.events.push({ t: 'wave', text: w.warn, x: from.x, y: from.y }); }
      if (!w.spawned && t >= w.at) { w.spawned = true; w.ids = this.squad(1, w.kinds, from, at).map(u => u.id); }
    }
  }
  private hqPoint(): Pt { const h = this.hq; return h ? { x: h.x + 2, y: h.y + 2 } : this.rally; }
  /** 아직 나타나지 않았거나 전멸하지 않은 공세 수. */
  wavesLeft(): number { return this.waves.filter(w => !w.spawned || this.alive(w.ids) > 0).length; }
  nextWaveIn(): number | null { const n = this.waves.find(w => !w.spawned); return n ? Math.max(0, Math.ceil(n.at - this.secs())) : null; }
  lostUnits(): number { return this.sim.players[0].lost; }

  // ---------- 화면용 ----------
  markerList(): Marker[] {
    const out: Marker[] = [];
    for (const p of this.points) out.push({ id: p.id, kind: 'point', x: p.x, y: p.y, r: p.r, label: p.label, side: p.owner === 0 ? 1 : p.owner === 1 ? 0 : 2, progress: p.progress / 100 });
    for (const id of this.targets) { const b = this.sim.building(id); if (b) out.push({ id: `t${id}`, kind: 'target', x: b.x + b.size / 2, y: b.y + b.size / 2, r: b.size / 2 + 1.6, label: '파괴 대상', side: 0, progress: 0 }); }
    return [...out, ...this.markers];
  }
  stars(): number {
    if (this.result !== 'win') return 0;
    let n = 1; if (this.secs() <= this.def.par) n++; if (this.objectives.some(o => o.bonus && o.done)) n++; return n;
  }
}

// ---------- 저장 ----------
export interface CampaignSave { stars: Record<number, number>; best: Record<number, number> }
export const CAMPAIGN_KEY = 'waldo.rts.campaign.v1';
export function readCampaign(): CampaignSave {
  const out: CampaignSave = { stars: {}, best: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(CAMPAIGN_KEY) ?? 'null') as Partial<CampaignSave> | null;
    for (const [k, v] of Object.entries(raw?.stars ?? {})) if (typeof v === 'number' && v >= 0 && v <= 3) out.stars[Number(k)] = Math.floor(v);
    for (const [k, v] of Object.entries(raw?.best ?? {})) if (typeof v === 'number' && v > 0 && v < 1e6) out.best[Number(k)] = Math.floor(v);
  } catch { /* 저장 불가·손상 */ }
  return out;
}
export function writeCampaign(s: CampaignSave): void { try { localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(s)); } catch { /* 저장 불가 환경 */ } }
/** 미션 결과를 저장합니다. 별과 최단 시간은 더 좋은 값만 남깁니다. */
export function recordResult(s: CampaignSave, id: number, stars: number, seconds: number): CampaignSave {
  const best = s.best[id]; return { stars: { ...s.stars, [id]: Math.max(s.stars[id] ?? 0, stars) }, best: { ...s.best, [id]: best ? Math.min(best, Math.floor(seconds)) : Math.floor(seconds) } };
}
/** 앞 미션을 한 번이라도 깼으면 열립니다. */
export const unlocked = (s: CampaignSave, id: number): boolean => id <= 1 || (s.stars[id - 1] ?? 0) > 0;

// ---------- 미션 ----------
const holdLine = (c: Campaign, key: string, sec: number): number => (c.flag[key] = Math.min(sec, (c.flag[key] ?? 0) + 5 / TICK));

export const MISSIONS: MissionDef[] = [
  {
    id: 1, title: '보급로 확보', tag: '점령', ai: 'easy', par: 8 * 60, bonus: '병력 손실 6기 이하',
    blurb: '세 곳의 거점에 병력을 세워 점령하고 10초 동안 지켜라.',
    brief: ['사막을 가로지르는 보급로를 되찾아야 합니다. 서쪽 정비소, 남쪽 급유소, 중앙 교차로 세 곳을 점령하세요.', '거점 반경 안에 아군 병력(일꾼 제외)이 있고 적이 없으면 점령 게이지가 오릅니다. 적이 들어오면 게이지가 줄어드니 지키세요.', '적 정찰대가 일정한 시간에 거점을 노립니다. 경고가 뜨면 병력을 보내세요.'],
    setup(c) {
      c.base({ minerals: 450, buildings: ['barracks', 'depot'], army: [['marine', 6], ['medic', 1]] });
      c.point('a', '서쪽 정비소', 26, 54); c.point('b', '남쪽 급유소', 46, 72); c.point('c', '중앙 교차로', 40, 40);
      c.objective('cap', '거점 3곳을 모두 점령하고 10초간 지킨다'); c.objective('frugal', '병력 손실 6기 이하로 승리', true);
      c.wave(150, [['marine', 4]], { x: 64, y: 40 }, c.points[1], '적 정찰대가 급유소로 접근 중');
      c.wave(260, [['marine', 5], ['jeep', 1]], { x: 60, y: 30 }, c.points[0], '적 증원이 서쪽 정비소로 접근 중');
      c.wave(380, [['marine', 5], ['rocket', 2]], { x: 66, y: 46 }, c.points[2], '적이 중앙 교차로를 되찾으려 합니다');
      c.hook(() => {
        const owned = c.points.filter(p => p.owner === 0).length;
        if (owned === c.points.length) { const t = holdLine(c, 'hold', 10); c.note('cap', `유지 ${Math.floor(t)}/10초`); if (t >= 10) { if (c.lostUnits() <= 6) c.complete('frugal'); c.complete('cap'); c.win('모든 거점을 점령했습니다.'); } }
        else { c.flag.hold = 0; c.note('cap', `점령 ${owned}/${c.points.length}`); }
      });
    },
  },
  {
    id: 2, title: '사막 방어선', tag: '방어', ai: null, par: 7 * 60, bonus: '사령부 체력 70% 이상 유지',
    blurb: '여섯 차례 몰려오는 적 공세에서 사령부를 지켜라.',
    brief: ['적이 사령부를 향해 여섯 차례 공세를 보냅니다. 경고가 뜨면 방어선을 점검하세요.', '미리 지어 둔 방어탑과 병영을 활용하고, 광물이 모자라면 일꾼으로 채취하세요. 의무병은 보병을 계속 고쳐 줍니다.', '공세가 갈수록 강해집니다. 전차 포격 태세(X)와 보병 자극제(X)로 고비를 넘기세요. 사령부가 무너지면 패배합니다.'],
    setup(c) {
      c.base({ minerals: 800, buildings: ['barracks', 'depot', 'depot', 'tower', 'tower'], army: [['marine', 6], ['rocket', 2], ['medic', 1]] });
      c.objective('def', '적 공세 6차례를 모두 막아낸다'); c.objective('hq', '사령부 체력 70% 이상으로 승리', true);
      const N = { x: 38, y: 48 }, E = { x: 58, y: 66 }, M = { x: 48, y: 58 };
      c.wave(50, [['marine', 6]], N, null, '1차 공세: 보병이 북쪽에서 접근 중');
      c.wave(130, [['marine', 6], ['rocket', 2]], E, null, '2차 공세: 동쪽에서 접근 중');
      c.wave(215, [['jeep', 4], ['marine', 4]], N, null, '3차 공세: 기동대가 빠르게 다가옵니다');
      c.wave(300, [['tank', 2], ['marine', 6]], M, null, '4차 공세: 전차가 포함되어 있습니다');
      c.wave(380, [['marine', 8], ['rocket', 4], ['jeep', 2]], E, null, '5차 공세: 대규모 혼성 부대');
      c.wave(470, [['tank', 3], ['rocket', 4], ['marine', 8]], M, null, '최종 공세: 적 주력이 몰려옵니다');
      c.hook(() => {
        const hq = c.hq; if (!hq) { c.lose('사령부가 무너졌습니다'); return; }
        const total = c.waves.length, left = c.wavesLeft(), next = c.nextWaveIn();
        c.note('def', `격퇴 ${total - left}/${total}${next !== null ? ` · 다음 공세 ${Math.floor(next / 60)}:${String(next % 60).padStart(2, '0')}` : ''}`);
        if (left === 0) { if (hq.hp >= hq.maxhp * 0.7) c.complete('hq'); c.complete('def'); c.win('모든 공세를 막아냈습니다.'); }
      });
    },
  },
  {
    id: 3, title: '호송 작전', tag: '호송', ai: null, par: 6 * 60, bonus: '호송 전차 체력 50% 이상으로 도착',
    blurb: '보급 전차를 북쪽 전진 기지까지 안전하게 호위하라.',
    brief: ['보급 전차(체력 300)를 북쪽 전진 기지까지 보내야 합니다. 전차는 자동으로 경로를 따라 이동합니다.', '호위 병력이 전차 가까이 있어야 움직입니다. 적이 가까이 있으면 멈추니, 앞서 나가 매복을 정리하세요.', '경로 곳곳에 매복이 있습니다. 전차가 파괴되면 패배합니다. 의무병은 전차를 고칠 수 없으니 보병을 지키세요.'],
    setup(c) {
      c.base({ minerals: 500, buildings: ['barracks', 'depot', 'depot'], army: [['marine', 8], ['rocket', 2], ['medic', 2]] });
      const start = { x: c.rally.x + 2, y: c.rally.y + 4 }; c.vip(start, 300);
      const route: Pt[] = [{ x: 24, y: 54 }, { x: 20, y: 38 }, { x: 28, y: 24 }, { x: 46, y: 16 }];
      const ambush: Array<{ leg: number; text: string; foes: Array<[UnitKind, number]>; at: Pt }> = [
        { leg: 0, text: '전방 매복! 적 보병 접근', foes: [['marine', 4]], at: { x: 34, y: 44 } },
        { leg: 1, text: '기동대 매복! 지프가 측면으로 파고듭니다', foes: [['jeep', 2], ['marine', 3]], at: { x: 32, y: 34 } },
        { leg: 2, text: '전차 매복! 로켓병으로 대응하세요', foes: [['tank', 1], ['rocket', 2], ['marine', 3]], at: { x: 40, y: 14 } },
      ];
      c.objective('conv', '보급 전차를 전진 기지까지 호송한다'); c.objective('vip', '호송 전차 체력 50% 이상으로 도착', true);
      c.flag.leg = 0; const ambushIds: number[][] = ambush.map(() => []);
      c.hook(() => {
        const v = c.vipUnit(); if (!v) { c.lose('호송 전차가 파괴되었습니다'); return; }
        const leg = c.flag.leg, goal = route[Math.min(leg, route.length - 1)];
        c.setMarkers([{ id: 'goal', kind: 'goal', x: route[route.length - 1].x, y: route[route.length - 1].y, r: 3.2, label: '전진 기지', side: 1, progress: 0 }]);
        if (dist(v, goal) < 3) {
          const ab = ambush[leg]; if (ab && !ambushIds[leg].length) { ambushIds[leg] = c.squad(1, ab.foes, ab.at, v).map(u => u.id); c.events.push({ t: 'wave', text: ab.text, x: ab.at.x, y: ab.at.y }); }
          if (!ab || c.alive(ambushIds[leg]) === 0) c.flag.leg = leg + 1;
          if (c.flag.leg >= route.length) { if (v.hp >= c.maxHp(v) * 0.5) c.complete('vip'); c.complete('conv'); c.win('전차가 전진 기지에 도착했습니다.'); return; }
        }
        const near = c.escortsNear(v, 8), foes = c.foesNear(v, 11), next = route[Math.min(c.flag.leg, route.length - 1)];
        c.note('conv', `${Math.min(c.flag.leg, route.length)}/${route.length} 지점 · 전차 체력 ${Math.ceil(v.hp / c.maxHp(v) * 100)}%`);
        if (foes > 0 || near < 2) {
          if (v.o.t === 'move') c.sim.apply(0, { k: 'stop', ids: [v.id] });
          if (foes === 0) c.hint('호송 전차가 호위를 기다립니다 — 병력을 전차 가까이 붙이세요');
        } else if (v.o.t === 'idle' || dist(v.o as Pt, next) > 1) c.sim.apply(0, { k: 'move', ids: [v.id], x: next.x, y: next.y });
      });
    },
  },
  {
    id: 4, title: '전초 기지 급습', tag: '파괴', ai: 'normal', par: 12 * 60, bonus: '병력 손실 12기 이하',
    blurb: '적이 흩어 놓은 전초 기지 세 곳의 거점 건물을 파괴하라.',
    brief: ['적이 세 곳에 전초 기지를 세웠습니다. 각 기지의 병영(파괴 대상 표시)을 부수면 됩니다.', '기지마다 방어탑이 지키고 있습니다. 전차의 포격 태세(X)로 사거리 밖에서 탑을 먼저 부수세요.', '적 본진은 활발히 병력을 뽑아 반격합니다. 사령부 방어도 신경 쓰세요.'],
    setup(c) {
      c.base({ minerals: 700, buildings: ['barracks', 'factory', 'depot', 'depot', 'depot'], army: [['marine', 8], ['rocket', 3], ['tank', 2], ['medic', 2]] });
      c.enemy({ minerals: 500, buildings: ['barracks'] });
      const sites: Array<[number, number]> = [[46, 80], [20, 22], [74, 72]];
      for (const [x, y] of sites) { c.place(1, 'tower', x - 2, y - 1); c.place(1, 'tower', x + 4, y + 1); c.mark(c.place(1, 'barracks', x, y)); }
      c.objective('out', '전초 기지 거점 3곳을 파괴한다'); c.objective('lean', '병력 손실 12기 이하로 승리', true);
      c.hook(() => {
        const left = c.targetsLeft(), total = c.targetsTotal(); c.note('out', `${total - left}/${total} 파괴`);
        if (left === 0 && total > 0) { if (c.lostUnits() <= 12) c.complete('lean'); c.complete('out'); c.win('모든 전초 기지를 무너뜨렸습니다.'); }
      });
    },
  },
  {
    id: 5, title: '최후의 전선', tag: '총공세', ai: 'hard', income: 1.25, par: 16 * 60, bonus: '증원군을 14분 안에 요청',
    blurb: '중앙 통신소를 점령해 증원군을 부르고, 적 본진을 무너뜨려라.',
    brief: ['적은 전력을 다해 싸웁니다. 먼저 중앙 통신소를 20초간 점령하면 전차·로켓병 증원군이 기지 앞에 도착합니다.', '증원군이 오기 전에 방어를 굳히고, 도착하면 곧장 적 기지로 진격하세요.', '적의 모든 건물을 파괴하면 승리, 아군 건물이 모두 사라지면 패배합니다.'],
    setup(c) {
      c.base({ minerals: 1000, buildings: ['barracks', 'factory', 'depot', 'depot', 'depot', 'depot', 'tower'], army: [['marine', 8], ['rocket', 3], ['tank', 2], ['medic', 2]] });
      c.enemy({ minerals: 700, buildings: ['barracks', 'factory', 'tower', 'tower'] });
      c.point('relay', '중앙 통신소', 44, 50, 5);
      c.objective('relay', '중앙 통신소를 20초간 점령하고 증원군을 부른다'); c.objective('final', '적의 모든 건물을 파괴한다'); c.objective('fast', '증원군을 14분 안에 요청', true);
      c.flag.called = 0;
      c.hook(() => {
        const p = c.points[0];
        if (!c.flag.called) {
          if (p.owner === 0) { const t = holdLine(c, 'relay', 20); c.note('relay', `점령 유지 ${Math.floor(t)}/20초`); if (t >= 20) {
            c.flag.called = 1; c.squad(0, [['tank', 4], ['rocket', 4], ['marine', 4]], c.rally); c.complete('relay'); if (c.secs() <= 14 * 60) c.complete('fast');
            c.events.push({ t: 'hint', text: '증원군이 기지 앞에 도착했습니다. 적 본진으로 진격하세요!' });
          } } else { c.flag.relay = 0; c.note('relay', p.progress > 0 ? `점령 ${Math.floor(p.progress)}%` : ''); }
        } else c.note('final', `적 건물 ${c.sim.buildings.filter(b => b.owner === 1).length}채 남음`);
        if (!c.sim.buildings.some(b => b.owner === 1)) { c.complete('final'); c.win('적의 모든 건물을 파괴했습니다.'); }
      });
    },
  },
  {
    id: 6, title: '야간 기습', tag: '기습', ai: null, par: 7 * 60, bonus: '병력 손실 8기 이하',
    blurb: '10분 안에 적 보급 창고 네 곳을 불태워라. 하나를 부술 때마다 적이 증원을 보낸다.',
    brief: ['소수의 기동 부대로 적 보급 창고(파괴 대상 표시) 네 곳을 부숴야 합니다. 제한 시간은 10분입니다.', '창고 하나가 무너질 때마다 적 본진이 증원을 보내 아군 기지로 몰려옵니다. 한 곳을 부수고 곧장 기지로 돌아가 막을지, 다음 창고를 칠지 정하세요.', '적은 새로 병력을 뽑지 않습니다. 증원은 창고를 부술 때만 오고, 갈수록 강해집니다. 지프 질주(X)로 빠르게 빠지고, 의무병 응급 처치(X)로 버티세요.'],
    setup(c) {
      c.base({ minerals: 350, buildings: ['barracks', 'depot', 'depot', 'tower'], army: [['jeep', 4], ['marine', 6], ['rocket', 2], ['medic', 2]] });
      c.enemy({ minerals: 0, buildings: ['barracks'] });
      const sites: Array<[number, number]> = [[46, 80], [20, 22], [74, 72], [72, 24]];
      for (const [x, y] of sites) { c.place(1, 'tower', x + 3, y - 1); c.mark(c.place(1, 'depot', x, y)); }
      c.objective('burn', '적 보급 창고 4곳을 파괴한다'); c.objective('lean', '병력 손실 8기 이하로 승리', true);
      const reinforce: Array<[UnitKind, number][]> = [[['marine', 4]], [['marine', 4], ['jeep', 2]], [['tank', 1], ['rocket', 2], ['marine', 3]], [['tank', 2], ['rocket', 3], ['marine', 4]]];
      const WARN = ['적 증원이 창고 피습에 반응해 출동했습니다', '기동대가 섞인 증원이 몰려옵니다', '전차가 포함된 증원이 출동했습니다', '적 주력이 본진에서 출동했습니다'];
      c.flag.burned = 0;
      c.hook(() => {
        const left = c.targetsLeft(), total = c.targetsTotal(), done = total - left;
        while (c.flag.burned < done) {
          const i = c.flag.burned++, hq = c.sim.buildings.find(b => b.owner === 1 && b.kind === 'hq');
          if (hq && left > 0) { const at = { x: hq.x + 2, y: hq.y + 2 }; c.squad(1, reinforce[Math.min(i, reinforce.length - 1)], at, c.rally); c.events.push({ t: 'wave', text: WARN[Math.min(i, WARN.length - 1)], x: at.x, y: at.y }); }
        }
        const rest = Math.max(0, 10 * 60 - Math.floor(c.secs()));
        c.note('burn', `${done}/${total} 파괴 · 남은 시간 ${Math.floor(rest / 60)}:${String(rest % 60).padStart(2, '0')}`);
        if (left === 0 && total > 0) { if (c.lostUnits() <= 8) c.complete('lean'); c.complete('burn'); c.win('적 보급 창고를 모두 불태웠습니다.'); }
        else if (rest === 0) c.lose('제한 시간이 지났습니다');
      });
    },
  },
  {
    id: 7, title: '철벽 수리전', tag: '방어', ai: null, par: 8 * 60, bonus: '방어탑 세 채를 모두 지켜내기',
    blurb: '전차가 앞장선 일곱 차례의 공세. 공병으로 방어탑과 전차를 계속 고치며 버텨라.',
    brief: ['적이 일곱 차례 공세를 보냅니다. 중반부터 전차가 앞장서 방어탑을 부수러 옵니다.', '공병은 광물 없이 가까이의 아군 전차와 건물을 고칩니다. 방어탑 곁에 세워 두면 맞는 만큼 고쳐 주니, 포격이 끝난 건물을 따로 챙기세요.', '공세가 갈 때마다 광물로 병력을 보충하고, 공장에서 공병과 전차를 더 뽑을 수 있습니다. 방어탑 세 채를 끝까지 지키면 별 하나를 더 받습니다.'],
    setup(c) {
      c.base({ minerals: 700, buildings: ['barracks', 'factory', 'depot', 'depot', 'tower', 'tower', 'tower'], army: [['marine', 5], ['rocket', 3], ['tank', 2], ['engineer', 3], ['medic', 1]] });
      c.flag.towers = c.sim.buildings.filter(b => b.owner === 0 && b.kind === 'tower').length;
      c.objective('def', '적 공세 7차례를 모두 막아낸다'); c.objective('towers', '방어탑을 하나도 잃지 않고 승리', true);
      const N = { x: 38, y: 48 }, E = { x: 58, y: 66 }, M = { x: 48, y: 58 };
      c.wave(60, [['marine', 6]], N, null, '1차 공세: 보병이 북쪽에서 접근 중');
      c.wave(140, [['tank', 2], ['marine', 3]], E, null, '2차 공세: 전차가 방어탑을 노립니다');
      c.wave(230, [['tank', 3], ['marine', 3]], M, null, '3차 공세: 전차 편대');
      c.wave(320, [['rocket', 4], ['jeep', 3], ['marine', 4]], N, null, '4차 공세: 기동대가 측면을 칩니다');
      c.wave(410, [['tank', 4], ['marine', 4]], E, null, '5차 공세: 전차 포격대');
      c.wave(500, [['tank', 3], ['rocket', 4], ['marine', 6]], M, null, '6차 공세: 혼성 주력');
      c.wave(590, [['tank', 5], ['rocket', 4], ['marine', 8]], E, null, '최종 공세: 적 기갑 주력이 몰려옵니다');
      c.hook(() => {
        const hq = c.hq; if (!hq) { c.lose('사령부가 무너졌습니다'); return; }
        const total = c.waves.length, left = c.wavesLeft(), next = c.nextWaveIn(), towers = c.sim.buildings.filter(b => b.owner === 0 && b.kind === 'tower').length;
        c.note('def', `격퇴 ${total - left}/${total} · 방어탑 ${towers}/${c.flag.towers}${next !== null ? ` · 다음 공세 ${Math.floor(next / 60)}:${String(next % 60).padStart(2, '0')}` : ''}`);
        if (left === 0) { if (towers >= c.flag.towers) c.complete('towers'); c.complete('def'); c.win('모든 공세를 막아냈습니다.'); }
      });
    },
  },
];

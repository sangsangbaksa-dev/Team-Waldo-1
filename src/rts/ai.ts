// FRONTLINE — 컴퓨터 상대. 사람과 같은 명령(Cmd)만 내리고, 난이도는 판단 속도·건설 규모·공격 시점으로 가릅니다.
// (가장 높은 단계만 채취량 보너스를 받으며 화면에도 그렇게 적습니다.)
import { BUILDINGS, LEVELS, RESEARCH, RESEARCH_KINDS, UNITS, type BuildKind, type Difficulty, type UnitKind } from './config';
import type { Building, Cmd, RtsSim, Unit } from './sim';

const ARMY: Array<'marine' | 'rocket' | 'tank' | 'jeep' | 'medic'> = ['marine', 'rocket', 'tank', 'jeep', 'medic'];

export class RtsAi {
  private wave = false; private phase = 0; private stagedAt = 0; private waveSupply = 0; private lastWave = 0;
  constructor(readonly me: number, readonly level: Difficulty) {}
  get interval(): number { return LEVELS[this.level].think; }

  /** 한 번 생각하고, 내릴 명령을 시뮬레이션에 바로 적용합니다. */
  think(s: RtsSim): void {
    const L = LEVELS[this.level], me = this.me, p = s.players[me];
    const hqs = s.buildings.filter(b => b.owner === me && b.kind === 'hq' && b.done);
    if (!hqs.length) return;
    const mine = s.units.filter(u => u.owner === me), workers = mine.filter(u => u.kind === 'worker'), army = mine.filter(u => u.kind !== 'worker');
    const own = (k: BuildKind): Building[] => s.buildings.filter(b => b.owner === me && b.kind === k);
    const home = hqs[0], hx = home.x + 2, hy = home.y + 2;
    // 놀고 있는 일꾼은 캐러 보냅니다.
    for (const w of workers) if (w.o.t === 'idle') { const nd = s.nearestNode(w.x, w.y, 24, false); if (nd) s.apply(me, { k: 'gather', ids: [w.id], node: nd.id }); }
    if (s.tick < L.delay) return;

    // 인구가 막히기 전에 보급소를 짓습니다.
    const queued = s.buildings.filter(b => b.owner === me).reduce((n, b) => n + b.queue.length, 0);
    const building = (k: BuildKind): number => own(k).filter(b => !b.done).length;
    const buffer = Math.min(8, 2 + Math.floor(own('barracks').length * 1.5 + own('factory').length * 2) + queued);
    if (p.cap < 100 && s.supplyLeft(me) <= buffer && building('depot') === 0) this.build(s, 'depot', workers, hx, hy);

    // 일꾼
    const want = L.workers + (own('hq').length > 1 ? 6 : 0);
    let wq = 0; for (const b of hqs) wq += b.queue.length;
    for (const b of hqs) if (b.queue.length < 2 && workers.length + wq < want && s.apply(me, { k: 'train', b: b.id, u: 'worker' })) wq++;

    // 건물: 병영 한 채 → 공장 → 병영 늘리기 → 방어탑 → 공장 늘리기 → 확장 순으로 하나씩 정합니다.
    // 다음에 지을 건물 값이 모일 때까지는 병력 생산을 잠깐 미뤄, 병영만 계속 짓다가 기술이 막히는 일이 없게 합니다.
    const nw = workers.length, nb = own('barracks').length, nf = own('factory').length, nt = own('tower').length, hasB = s.has(me, 'barracks');
    let next: BuildKind | null = null;
    if (nb < 1) next = 'barracks';
    else if (hasB && L.factory > 0 && nf < 1 && nw >= 10) next = 'factory';
    else if (nb < (nw >= 8 ? L.barracks : 1)) next = 'barracks';
    else if (hasB && nt < L.tower && nw >= 11 && nf >= Math.min(1, L.factory)) next = 'tower';
    else if (hasB && nf < L.factory && nw >= 12) next = 'factory';
    else if (L.expand && own('hq').length < 2 && nw >= 14 && nb >= 2 && p.minerals >= 400) next = 'hq';
    let saving = false;
    if (next && building(next) < (next === 'barracks' && L.barracks > 2 ? 2 : 1)) {
      if (next === 'hq') this.expand(s, workers); else this.build(s, next, workers, hx, hy);
      saving = next !== 'hq' && p.minerals < BUILDINGS[next].cost && army.reduce((n, u) => n + UNITS[u.kind].supply, 0) >= 6;
    }

    // 강화 연구: 병영·공장이 쉬는 동안 광물이 남으면 연구합니다.
    if (L.research && p.minerals >= 200) for (const b of s.buildings) if (b.owner === me && b.done && !b.research) for (const r of RESEARCH_KINDS) if (RESEARCH[r].from === b.kind && s.apply(me, { k: 'research', b: b.id, r })) break;

    // 병력 생산
    const counts: Record<string, number> = { marine: 0, rocket: 0, tank: 0, jeep: 0, medic: 0 }; for (const u of army) counts[u.kind]++;
    for (const b of s.buildings) if (b.owner === me) for (const q of b.queue) if (q.u !== 'worker') counts[q.u]++;
    // 상대 병력 구성을 보고 섞는 비율을 조정합니다: 장갑이 많으면 로켓병, 가벼운 병력이 많으면 전차·보병.
    let foeSup = 0, foeArmored = 0; for (const e of s.units) if (e.owner !== me && e.kind !== 'worker') { const d = UNITS[e.kind]; foeSup += d.supply; if (d.armor === 'armored') foeArmored += d.supply; }
    const antiArmor = foeSup >= 8 && foeArmored / foeSup > 0.35, antiLight = foeSup >= 8 && foeArmored / foeSup < 0.12;
    const weight = (k: (typeof ARMY)[number]): number => {
      let w = L.mix[k];
      if (k === 'rocket' && antiArmor) w *= 2; else if (k === 'marine' && antiArmor) w *= 0.6; else if ((k === 'tank' || k === 'jeep') && antiLight) w *= 1.4;
      if (k === 'medic' && counts.marine + counts.rocket < 5 * (counts.medic + 1)) w = 0; // 치료할 보병이 충분할 때만
      return w;
    };
    // 비싼 병력을 뽑는 공장이 먼저 광물을 받게 합니다(병영이 먼저면 전차 값이 영영 모이지 않습니다).
    let hold = 0;
    const rank = (k: BuildKind): number => (k === 'factory' ? 0 : 1);
    for (const b of [...s.buildings].sort((a, c) => rank(a.kind) - rank(c.kind) || a.id - c.id)) {
      if (b.owner !== me || !b.done || !BUILDINGS[b.kind].trains.length || b.kind === 'hq') continue;
      if (!b.rx) s.apply(me, { k: 'rally', b: b.id, x: this.rally(s, home).x, y: this.rally(s, home).y, node: 0 });
      if (saving || b.queue.length >= 2) continue;
      if (hold > 0 && b.kind !== 'factory' && p.minerals < hold + 50) continue;
      const opts = ARMY.filter(k => weight(k) > 0 && UNITS[k].from === b.kind && s.canTrain(me, k)).sort((a, c) => counts[a] / weight(a) - counts[c] / weight(c));
      const k = opts[0];
      if (k && s.apply(me, { k: 'train', b: b.id, u: k as UnitKind })) counts[k]++;
      else if (k && b.kind === 'factory' && b.queue.length === 0 && s.supplyLeft(me) >= UNITS[k].supply) hold = UNITS[k].cost; // 값이 모일 때까지 병영은 아껴 씁니다
    }
    const fighters = army.filter(u => u.kind !== 'medic');
    this.control(s, fighters, home);
    this.escort(s, army.filter(u => u.kind === 'medic'), fighters, home);
  }

  /** 의무병은 싸우는 병력의 중심에서 조금 뒤(우리 기지 쪽)에 따라다니며 치료합니다. */
  private escort(s: RtsSim, medics: Unit[], fighters: Unit[], home: Building): void {
    if (!medics.length) return;
    const hx = home.x + 2, hy = home.y + 2; let cx = hx, cy = hy;
    if (fighters.length) { cx = 0; cy = 0; for (const u of fighters) { cx += u.x; cy += u.y; } cx /= fighters.length; cy /= fighters.length; const dx = hx - cx, dy = hy - cy, l = Math.sqrt(dx * dx + dy * dy) || 1; cx += dx / l * 2.5; cy += dy / l * 2.5; }
    const ids = medics.filter(u => u.o.t === 'idle' || s.dist(u.x, u.y, cx, cy) > 6).map(u => u.id);
    if (ids.length) { const p = s.pather.nearestFree(cx, cy) ?? { x: cx, y: cy }; s.apply(this.me, { k: 'move', ids, x: p.x, y: p.y }); }
  }

  private rally(s: RtsSim, home: Building): { x: number; y: number } {
    const hx = home.x + 2, hy = home.y + 2, mid = s.map.size / 2, dx = mid - hx, dy = mid - hy, l = Math.sqrt(dx * dx + dy * dy) || 1;
    return s.pather.nearestFree(hx + dx / l * 11, hy + dy / l * 11) ?? { x: hx, y: hy };
  }

  private control(s: RtsSim, army: Unit[], home: Building): void {
    const L = LEVELS[this.level], me = this.me;
    if (!army.length) { this.wave = false; return; }
    const sup = army.reduce((n, u) => n + UNITS[u.kind].supply, 0), rally = this.rally(s, home);
    const go = (units: Unit[], x: number, y: number, force: boolean): void => {
      const ids = units.filter(u => force || u.o.t === 'idle' || (u.o.t === 'amove' && !u.o.target && s.dist(u.o.x, u.o.y, x, y) > 6)).map(u => u.id);
      if (ids.length) s.apply(me, { k: 'amove', ids, x, y });
    };
    // 방어: 우리 건물 근처에 적이 들어오면 모입니다. 공격 중에는 적이 많을 때만 돌아옵니다.
    let threat: Unit | null = null, td = Infinity, tsup = 0;
    for (const e of s.units) {
      if (e.owner === me || e.kind === 'worker' && s.tick < 2400) continue;
      for (const b of s.buildings) if (b.owner === me) { const d = s.rectDist(e.x, e.y, b); if (d < 16) { tsup += UNITS[e.kind].supply; if (d < td) { td = d; threat = e; } break; } }
    }
    if (threat && (this.phase !== 2 || tsup >= 8)) { go(army.filter(u => u.o.t !== 'attack' && !(u.o.t === 'amove' && (u.o.target || s.dist(u.o.x, u.o.y, threat!.x, threat!.y) < 3))), threat.x, threat.y, true); if (this.phase === 2) { this.phase = 0; this.wave = false; this.lastWave = s.tick; } return; }
    if (!this.wave) {
      go(army, rally.x, rally.y, false);
      if (s.tick >= L.attackAfter && sup >= L.wave && s.tick - this.lastWave > 400) { this.wave = true; this.phase = 1; this.waveSupply = sup; this.stagedAt = s.tick; }
      return;
    }
    if (L.retreat && sup < this.waveSupply * 0.35) { this.wave = false; this.phase = 0; this.lastWave = s.tick; go(army, rally.x, rally.y, true); return; }
    let cx = 0, cy = 0; for (const u of army) { cx += u.x; cy += u.y; } cx /= army.length; cy /= army.length;
    let tgt: { x: number; y: number } | null = null, bd = Infinity;
    for (const b of s.buildings) if (b.owner !== me) { const d = s.dist(cx, cy, b.x + b.size / 2, b.y + b.size / 2) - (b.kind === 'hq' ? 0 : 6); if (d < bd) { bd = d; tgt = { x: b.x + b.size / 2, y: b.y + b.size / 2 }; } }
    if (!tgt) return;
    if (this.phase === 1) {
      // 적 기지 앞 집결지에 모인 뒤에 한꺼번에 들어갑니다.
      const dx = tgt.x - cx, dy = tgt.y - cy, l = Math.sqrt(dx * dx + dy * dy) || 1, back = Math.min(l, 30);
      const f = s.pather.nearestFree(tgt.x - dx / l * back, tgt.y - dy / l * back) ?? tgt;
      go(army, f.x, f.y, this.stagedAt === s.tick);
      const near = army.filter(u => s.dist(u.x, u.y, f.x, f.y) < 9).length;
      if (near >= army.length * 0.8 || s.tick - this.stagedAt > 30 * 20) this.phase = 2;
      return;
    }
    go(army, tgt.x, tgt.y, false);
    this.waveSupply = Math.max(this.waveSupply, sup);
  }

  private pickWorker(s: RtsSim, workers: Unit[], x: number, y: number): Unit | null {
    let best: Unit | null = null, bd = Infinity;
    for (const w of workers) { if (w.o.t === 'build' || w.carry > 0) continue; const d = s.dist(w.x, w.y, x, y); if (d < bd) { bd = d; best = w; } }
    return best ?? workers.find(w => w.o.t !== 'build') ?? null;
  }

  private build(s: RtsSim, kind: BuildKind, workers: Unit[], hx: number, hy: number): void {
    if (s.players[this.me].minerals < BUILDINGS[kind].cost) return;
    const mid = s.map.size / 2, towardX = mid - hx, towardY = mid - hy, tl = Math.sqrt(towardX * towardX + towardY * towardY) || 1;
    // 방어탑은 적이 오는 쪽에, 나머지는 사령부 가까이에 놓습니다.
    const ax = kind === 'tower' ? hx + towardX / tl * 12 : hx, ay = kind === 'tower' ? hy + towardY / tl * 12 : hy;
    const best = s.findSite(kind, ax, ay, kind === 'tower' ? 0 : 36);
    if (!best) return;
    const w = this.pickWorker(s, workers, best.x, best.y); if (w) s.apply(this.me, { k: 'build', id: w.id, b: kind, x: best.x, y: best.y });
  }
  private expand(s: RtsSim, workers: Unit[]): void {
    const hq = s.buildings.find(b => b.owner === this.me && b.kind === 'hq'); if (!hq) return;
    const sites = s.map.expansions.filter(e => s.canPlace('hq', e.x, e.y)).sort((a, b) => s.dist(a.x, a.y, hq.x, hq.y) - s.dist(b.x, b.y, hq.x, hq.y));
    const site = sites[0]; if (!site) return;
    const w = this.pickWorker(s, workers, site.x, site.y); if (w) s.apply(this.me, { k: 'build', id: w.id, b: 'hq', x: site.x, y: site.y });
  }
}
export type { Cmd };

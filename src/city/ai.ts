// LAST CITY — 라이벌 조직 AI: 경제 확장, 병력 생산, 사업 인수, 자기장 대응
import { BIZ, DIFFICULTY, RESEARCH, STRUCTS, UNITS, type ResearchId, type StructKind, type UnitId } from './defs';
import type { Faction, World } from './world';

export interface AiState { goal: string; tx: number; ty: number; biz: number; t: number; attackT: number; stuckT: number }

function tryBuild(w: World, f: Faction, kind: StructKind): boolean {
  const hq = w.hq(f.id); if (!hq) return false; const d = STRUCTS[kind];
  if (f.crystal < w.cost(f, d.crystal) || f.cash < w.cost(f, d.cash)) return false;
  for (let k = 0; k < 16; k++) { const x = hq.x + 60 + (w.rng() - 0.5) * 380, y = hq.y + 60 + (w.rng() - 0.5) * 380; if (w.build(f.id, kind, x, y) === '') return true; }
  return false;
}

export function thinkFaction(w: World, f: Faction): void {
  const b = w.boss(f.id), hq = w.hq(f.id), diff = DIFFICULTY[w.opts.difficulty], ai = f.ai, t = w.time, z = w.zone;
  const mine = w.structures.filter(s => s.alive && s.f === f.id), count = (k: StructKind): number => mine.filter(s => s.kind === k).length, built = (k: StructKind): boolean => mine.some(s => s.kind === k && s.built >= 1);
  const army = w.armyOf(f.id);
  if (hq) {
    const workers = w.actors.filter(a => a.alive && a.f === f.id && a.kind === 'worker').length + hq.queue.length;
    if (workers < Math.min(9, 5 + Math.floor(t / 80))) w.train(f.id, 'worker');
    w.recomputeSupply(f);
    if (!count('barracks')) tryBuild(w, f, 'barracks');
    else if (f.supplyMax - f.supply <= 2 && f.supplyMax < diff.cap && !mine.some(s => s.kind === 'depot' && s.built < 1)) tryBuild(w, f, 'depot');
    else if (t > 110 && count('turret') < (t > 320 ? 2 : 1)) tryBuild(w, f, 'turret');
    else if (t > 160 && !count('lab')) tryBuild(w, f, 'lab');
    else if (t > 270 && !count('factory') && f.cash > 500) tryBuild(w, f, 'factory');
    else if (t > 340 && count('barracks') < 2 && f.crystal > 400) tryBuild(w, f, 'barracks');
    if (built('barracks')) {
      const queued = mine.reduce((n, s) => n + (s.kind === 'barracks' ? s.queue.length : 0), 0);
      if (queued < 2) { const r = w.rng(), medics = army.filter(a => a.kind === 'medic').length; const u: UnitId = r < 0.2 ? 'heavy' : r < 0.32 && medics < 3 ? 'medic' : r < 0.45 && built('lab') ? 'sniper' : 'rifle'; if (w.train(f.id, u) !== '' && u !== 'rifle') w.train(f.id, 'rifle'); }
    }
    if (built('factory') && f.crystal > 250) { if (built('lab') && f.cash > 900 && w.rng() < 0.5) w.train(f.id, 'tank'); else if (f.cash > 400) w.train(f.id, 'buggy'); }
    if (built('lab') && f.crystal > 420 && f.cash > 900 && w.rng() < 0.3) w.research(f.id, (Object.keys(RESEARCH) as ResearchId[])[Math.floor(w.rng() * 3)]);
    if (f.crystal > 520 && f.cash < 500) w.market(f.id, true, 150); else if (f.cash > 2600 && f.crystal < 140) w.market(f.id, false, 100);
    if (w.rng() < 0.15) { const own = w.businesses.filter(q => q.owner === f.id && q.level < 3); const q = own[Math.floor(w.rng() * own.length)]; if (q && f.cash > w.upgradePrice(q) * 2) w.upgradeBiz(f.id, q); }
  }
  for (const a of army) if (a.order.type !== 'follow') a.order = { type: 'follow', x: a.x, y: a.y };
  if (!b) return;
  const dist = (x: number, y: number): number => Math.hypot(x - b.x, y - b.y), inNext = (x: number, y: number, m = 80): boolean => Math.hypot(x - z.nx, y - z.ny) < z.nr - m;
  const final = z.nr < 500 || !hq || w.aliveCount() <= 3;
  let goal = 'idle', tx = hq ? hq.x + 60 : z.nx, ty = hq ? hq.y + 170 : z.ny, type: 'amove' | 'move' = 'amove';
  const hostileNear = b.tk !== 0;
  if (!inNext(b.x, b.y, 40) && (z.shrinking || z.t < 45 || Math.hypot(b.x - z.x, b.y - z.y) > z.r - 60)) {
    goal = 'zone'; const a = Math.atan2(b.y - z.ny, b.x - z.nx), r = Math.max(0, z.nr - 220) * 0.7; tx = z.nx + Math.cos(a) * r; ty = z.ny + Math.sin(a) * r; if (Math.hypot(b.x - z.x, b.y - z.y) > z.r) type = 'move';
  } else if (b.hp < b.maxHp * 0.33 && hq && inNext(hq.x, hq.y, -100) && f.medkits === 0) { goal = 'retreat'; type = 'move'; }
  else if (hq && t - hq.hurtT < 6 && dist(hq.x, hq.y) < 1600) { goal = 'defend'; }
  else {
    const crate = w.loot.find(l => l.alive && l.type === 'crate' && dist(l.x, l.y) < 1500 && inNext(l.x, l.y, 0));
    const gun = t < 170 && f.slots.length < 3 ? w.loot.find(l => l.alive && l.type === 'weapon' && dist(l.x, l.y) < 650) : undefined;
    if (crate) { goal = 'loot'; tx = crate.x; ty = crate.y; }
    else if (gun) { goal = 'loot'; tx = gun.x; ty = gun.y; }
    else if ((t > ai.attackT && army.length >= diff.attackArmy) || final) {
      // 공격 목표 선정
      let best = 1e9, bx = 0, by = 0, found = false;
      for (const q of w.businesses) if (q.owner >= 0 && q.owner !== f.id && inNext(q.x, q.y, 0)) { const s = dist(q.x, q.y) * (q.kind === 'bank' || q.kind === 'casino' ? 0.75 : 1); if (s < best) { best = s; bx = q.x; by = q.y; found = true; } }
      for (const s of w.structures) if (s.alive && s.kind === 'hq' && s.f !== f.id && army.length >= diff.attackArmy + 3) { const sc = dist(s.x, s.y) * 0.85; if (sc < best) { best = sc; bx = s.x + 60; by = s.y + 150; found = true; } }
      for (const o of w.factions) if (o.alive && o.id !== f.id) { const ob = w.boss(o.id); if (!ob) continue; const d = dist(ob.x, ob.y); if (d < 1100 || final) { const sc = d * (final ? 0.5 : 0.8); if (sc < best) { best = sc; bx = ob.x; by = ob.y; found = true; } } }
      if (found && (best < 2600 || final)) { goal = 'attack'; tx = bx; ty = by; if (ai.goal !== 'attack') ai.stuckT = t; if (t - ai.stuckT > 110 && !final) { ai.attackT = t + 50 + w.rng() * 60; goal = 'idle'; } }
      if (!final && army.length < 3) { ai.attackT = t + 60; goal = 'idle'; }
    }
    if (goal === 'idle') {
      let best = 1900, target: { x: number; y: number } | null = null;
      for (const q of w.businesses) if (q.owner < 0 && q.kind !== 'gunshop' && f.cash >= BIZ[q.kind].price && inNext(q.x, q.y, 60)) { const d = dist(q.x, q.y); if (d < best) { best = d; target = q; } }
      if (target) { goal = 'buy'; tx = target.x; ty = target.y; }
      else if (!hq || !inNext(hq.x, hq.y, 0)) { tx = z.nx + (w.rng() - 0.5) * z.nr * 0.5; ty = z.ny + (w.rng() - 0.5) * z.nr * 0.5; if (ai.goal === 'idle' && Math.hypot(ai.tx - z.nx, ai.ty - z.ny) < z.nr * 0.6) { tx = ai.tx; ty = ai.ty; } }
    }
  }
  ai.goal = goal; ai.tx = tx; ai.ty = ty; b.order = { type, x: tx, y: ty };
  if (f.skillCd <= 0 && hostileNear) { if (f.klass !== 'tycoon' || f.cash > 600) w.useSkill(f.id); }
  void UNITS;
}

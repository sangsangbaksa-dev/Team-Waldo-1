// LAST CITY — 라이벌 조직의 이동·교전 판단
import { BIZ, DIFFICULTY } from './defs';
import { runAiEconomy } from './ai-economy';
import type { Faction, World } from './world';

export interface AiState { goal: string; tx: number; ty: number; biz: number; t: number; attackT: number; stuckT: number }

export function thinkFaction(w: World, f: Faction): void {
  const b = w.boss(f.id), hq = w.hq(f.id), diff = DIFFICULTY[w.opts.difficulty], ai = f.ai, t = w.time, z = w.zone;
  const army = w.armyOf(f.id);
  runAiEconomy(w, f, hq, army, t);
  for (const a of army) if (a.order.type !== 'follow') a.order = { type: 'follow', x: a.x, y: a.y };
  if (!b) return;
  const dist = (x: number, y: number): number => Math.hypot(x - b.x, y - b.y), inNext = (x: number, y: number, m = 80): boolean => Math.hypot(x - z.nx, y - z.ny) < z.nr - m;
  const final = z.nr < 500 || !hq || w.aliveCount() <= 3 || w.endgame;
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
      for (const s of w.structures) if (s.alive && s.kind === 'hq' && s.f !== f.id && (final || army.length >= diff.attackArmy + 3)) { const sc = dist(s.x, s.y) * 0.85; if (sc < best) { best = sc; bx = s.x + 60; by = s.y + 150; found = true; } }
      for (const o of w.factions) if (o.alive && o.id !== f.id) { const ob = w.boss(o.id); if (!ob) continue; const d = dist(ob.x, ob.y); if (d < 1100 || final) { const sc = d * (final ? 0.5 : 0.8); if (sc < best) { best = sc; bx = ob.x; by = ob.y; found = true; } } }
      if (found && (best < 2600 || final)) { goal = 'attack'; tx = bx; ty = by; if (ai.goal !== 'attack') ai.stuckT = t; if (t - ai.stuckT > 110 && !final) { ai.attackT = t + 140 + w.rng() * 120; goal = 'idle'; } }
      if (!final && army.length < 3) { ai.attackT = t + 130; goal = 'idle'; }
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
}

// LAST CITY — 라이벌 조직의 이동·교전 판단
import { BIZ, DIFFICULTY } from './defs';
import { runAiEconomy } from './ai-economy';
import type { Actor, Faction, World } from './world';

export interface AiState { goal: string; tx: number; ty: number; biz: number; t: number; attackT: number; stuckT: number }

type RivalGoal = 'idle' | 'zone' | 'retreat' | 'defend' | 'loot' | 'attack' | 'buy';
interface Point { x: number; y: number }

function attackTarget(
  w: World, f: Faction, boss: Actor, final: boolean, armySize: number, attackArmy: number,
  inNext: (x: number, y: number, margin?: number) => boolean,
): Point | null {
  const distance = (x: number, y: number): number => Math.hypot(x - boss.x, y - boss.y);
  let best = 1e9;
  let target: Point | null = null;

  for (const biz of w.businesses) {
    if (biz.owner < 0 || biz.owner === f.id || !inNext(biz.x, biz.y, 0)) continue;
    const score = distance(biz.x, biz.y) * (biz.kind === 'bank' || biz.kind === 'casino' ? 0.75 : 1);
    if (score < best) {
      best = score;
      target = { x: biz.x, y: biz.y };
    }
  }

  for (const s of w.structures) {
    if (!s.alive || s.kind !== 'hq' || s.f === f.id || (!final && armySize < attackArmy + 3)) continue;
    const score = distance(s.x, s.y) * 0.85;
    if (score < best) {
      best = score;
      target = { x: s.x + 60, y: s.y + 150 };
    }
  }

  for (const enemy of w.factions) {
    if (!enemy.alive || enemy.id === f.id) continue;
    const otherBoss = w.boss(enemy.id);
    if (!otherBoss) continue;
    const d = distance(otherBoss.x, otherBoss.y);
    if (d >= 1100 && !final) continue;
    const score = d * (final ? 0.5 : 0.8);
    if (score < best) {
      best = score;
      target = { x: otherBoss.x, y: otherBoss.y };
    }
  }

  return (best < 2600 || final) ? target : null;
}

function unownedBusiness(
  w: World, f: Faction, boss: Actor,
  inNext: (x: number, y: number, margin?: number) => boolean,
): Point | null {
  let best = 1900;
  let target: Point | null = null;
  for (const biz of w.businesses) {
    if (biz.owner >= 0 || biz.kind === 'gunshop' || f.cash < BIZ[biz.kind].price || !inNext(biz.x, biz.y, 60)) continue;
    const d = Math.hypot(biz.x - boss.x, biz.y - boss.y);
    if (d < best) {
      best = d;
      target = biz;
    }
  }
  return target;
}

export function thinkFaction(w: World, f: Faction): void {
  const boss = w.boss(f.id);
  const hq = w.hq(f.id);
  const diff = DIFFICULTY[w.opts.difficulty];
  const ai = f.ai;
  const t = w.time;
  const zone = w.zone;
  const army = w.armyOf(f.id);

  runAiEconomy(w, f, hq, army, t);
  for (const soldier of army) {
    if (soldier.order.type !== 'follow') soldier.order = { type: 'follow', x: soldier.x, y: soldier.y };
  }
  if (!boss) return;

  const distance = (x: number, y: number): number => Math.hypot(x - boss.x, y - boss.y);
  const inNext = (x: number, y: number, margin = 80): boolean =>
    Math.hypot(x - zone.nx, y - zone.ny) < zone.nr - margin;
  const final = zone.nr < 500 || !hq || w.aliveCount() <= 3 || w.endgame;
  const hostileNear = boss.tk !== 0;
  let goal: RivalGoal = 'idle';
  let tx = hq ? hq.x + 60 : zone.nx;
  let ty = hq ? hq.y + 170 : zone.ny;
  let orderType: 'amove' | 'move' = 'amove';

  if (!inNext(boss.x, boss.y, 40) && (zone.shrinking || zone.t < 45 || Math.hypot(boss.x - zone.x, boss.y - zone.y) > zone.r - 60)) {
    goal = 'zone';
    const angle = Math.atan2(boss.y - zone.ny, boss.x - zone.nx);
    const r = Math.max(0, zone.nr - 220) * 0.7;
    tx = zone.nx + Math.cos(angle) * r;
    ty = zone.ny + Math.sin(angle) * r;
    if (Math.hypot(boss.x - zone.x, boss.y - zone.y) > zone.r) orderType = 'move';
  } else if (boss.hp < boss.maxHp * 0.33 && hq && inNext(hq.x, hq.y, -100) && f.medkits === 0) {
    goal = 'retreat';
    orderType = 'move';
  } else if (hq && t - hq.hurtT < 6 && distance(hq.x, hq.y) < 1600) {
    goal = 'defend';
  } else {
    const crate = w.loot.find(l => l.alive && l.type === 'crate' && distance(l.x, l.y) < 1500 && inNext(l.x, l.y, 0));
    const gun = t < 170 && f.slots.length < 3
      ? w.loot.find(l => l.alive && l.type === 'weapon' && distance(l.x, l.y) < 650)
      : undefined;

    if (crate || gun) {
      goal = 'loot';
      const loot = crate ?? gun!;
      tx = loot.x;
      ty = loot.y;
    } else if ((t > ai.attackT && army.length >= diff.attackArmy) || final) {
      const target = attackTarget(w, f, boss, final, army.length, diff.attackArmy, inNext);
      if (target) {
        goal = 'attack';
        tx = target.x;
        ty = target.y;
        if (ai.goal !== 'attack') ai.stuckT = t;
        if (t - ai.stuckT > 110 && !final) {
          ai.attackT = t + 140 + w.rng() * 120;
          goal = 'idle';
        }
      }
      if (!final && army.length < 3) {
        ai.attackT = t + 130;
        goal = 'idle';
      }
    }

    if (goal === 'idle') {
      const target = unownedBusiness(w, f, boss, inNext);
      if (target) {
        goal = 'buy';
        tx = target.x;
        ty = target.y;
      } else if (!hq || !inNext(hq.x, hq.y, 0)) {
        tx = zone.nx + (w.rng() - 0.5) * zone.nr * 0.5;
        ty = zone.ny + (w.rng() - 0.5) * zone.nr * 0.5;
        if (ai.goal === 'idle' && Math.hypot(ai.tx - zone.nx, ai.ty - zone.ny) < zone.nr * 0.6) {
          tx = ai.tx;
          ty = ai.ty;
        }
      }
    }
  }

  ai.goal = goal;
  ai.tx = tx;
  ai.ty = ty;
  boss.order = { type: orderType, x: tx, y: ty };
  if (f.skillCd <= 0 && hostileNear && (f.klass !== 'tycoon' || f.cash > 600)) w.useSkill(f.id);
}

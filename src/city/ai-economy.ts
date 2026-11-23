// LAST CITY — 라이벌 조직의 생산과 시설 확장
import { RESEARCH, STRUCTS, type ResearchId, type StructKind, type UnitId } from './defs';
import type { Actor, Faction, Structure, World } from './world';

interface StructureSummary {
  counts: Record<StructKind, number>;
  completed: Set<StructKind>;
  barracksQueue: number;
  unfinishedDepot: boolean;
}

// 건설과 훈련을 시작하기 전의 시설 상태를 한 번만 집계합니다.
function summarizeStructures(w: World, factionId: number): StructureSummary {
  const counts: Record<StructKind, number> = { hq: 0, barracks: 0, depot: 0, factory: 0, lab: 0, turret: 0 };
  const completed = new Set<StructKind>();
  let barracksQueue = 0;
  let unfinishedDepot = false;

  for (const s of w.structures) {
    if (!s.alive || s.f !== factionId) continue;
    counts[s.kind]++;
    if (s.built >= 1) completed.add(s.kind);
    if (s.kind === 'barracks') barracksQueue += s.queue.length;
    if (s.kind === 'depot' && s.built < 1) unfinishedDepot = true;
  }
  return { counts, completed, barracksQueue, unfinishedDepot };
}

function tryBuild(w: World, f: Faction, hq: Structure, kind: StructKind): boolean {
  const def = STRUCTS[kind];
  if (f.crystal < w.cost(f, def.crystal) || f.cash < w.cost(f, def.cash)) return false;
  for (let attempt = 0; attempt < 16; attempt++) {
    const x = hq.x + 60 + (w.rng() - 0.5) * 380;
    const y = hq.y + 60 + (w.rng() - 0.5) * 380;
    if (w.build(f.id, kind, x, y) === '') return true;
  }
  return false;
}

export function runAiEconomy(w: World, f: Faction, hq: Structure | null, army: readonly Actor[], t: number): void {
  const facilities = summarizeStructures(w, f.id);
  if (!hq) return;

  let workers = hq.queue.length;
  for (const actor of w.actors) {
    if (actor.alive && actor.f === f.id && actor.kind === 'worker') workers++;
  }
  if (!w.endgame && workers < Math.min(9, 5 + Math.floor(t / 80))) w.train(f.id, 'worker');

  w.recomputeSupply(f);
  const count = (kind: StructKind): number => facilities.counts[kind];
  const built = (kind: StructKind): boolean => facilities.completed.has(kind);

  if (!count('barracks')) tryBuild(w, f, hq, 'barracks');
  else if (f.supplyMax - f.supply <= 2 && f.supplyMax < w.aiCap() && !facilities.unfinishedDepot) tryBuild(w, f, hq, 'depot');
  else if (t > 110 && count('turret') < (t > 320 ? 2 : 1)) tryBuild(w, f, hq, 'turret');
  else if (t > 160 && !count('lab')) tryBuild(w, f, hq, 'lab');
  else if (t > 270 && !count('factory') && f.cash > 500) tryBuild(w, f, hq, 'factory');
  else if (t > 340 && count('barracks') < 2 && f.crystal > 400) tryBuild(w, f, hq, 'barracks');
  else if (t > 520 && count('barracks') < 3 && f.cash > 1800 && f.crystal > 700) tryBuild(w, f, hq, 'barracks');
  else if (t > 520 && count('turret') < 4 && f.cash > 2500) tryBuild(w, f, hq, 'turret');

  if (built('barracks') && facilities.barracksQueue < (f.cash > 2000 ? 4 : 2)) {
    const roll = w.rng();
    let medics = 0;
    for (const a of army) if (a.kind === 'medic') medics++;
    const unit: UnitId = roll < 0.2 ? 'heavy' : roll < 0.32 && medics < 3 ? 'medic' : roll < 0.45 && built('lab') ? 'sniper' : 'rifle';
    if (w.train(f.id, unit) !== '' && unit !== 'rifle') w.train(f.id, 'rifle');
  }
  if (built('factory') && f.crystal > 250) {
    if (built('lab') && f.cash > 900 && w.rng() < 0.5) w.train(f.id, 'tank');
    else if (f.cash > 400) w.train(f.id, 'buggy');
  }
  if (built('lab') && f.crystal > 420 && f.cash > 900 && w.rng() < 0.3) {
    w.research(f.id, (Object.keys(RESEARCH) as ResearchId[])[Math.floor(w.rng() * 3)]);
  }

  if (f.crystal > 520 && f.cash < 500) w.market(f.id, true, 150);
  else if (f.cash > 2600 && f.crystal < 140) w.market(f.id, false, 100);

  if (w.rng() < 0.15) {
    const owned = w.businesses.filter(b => b.owner === f.id && b.level < 3);
    const target = owned[Math.floor(w.rng() * owned.length)];
    if (target && f.cash > w.upgradePrice(target) * 2) w.upgradeBiz(f.id, target);
  }
}

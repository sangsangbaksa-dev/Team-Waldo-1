import { BUDGET, type Placement, type Side } from './sim';
import { TYPES, UNITS, type UnitType } from './units';
export type Difficulty = 'easy' | 'normal' | 'hard';
export function buildArmy(side: Side, difficulty: Difficulty, enemy: Placement[] = []): Placement[] {
  const counts = Object.fromEntries(TYPES.map(t => [t, enemy.filter(p => p.type === t).length])) as Record<UnitType, number>;
  const counter: UnitType = counts.striker > counts.guard && counts.striker >= counts.archer ? 'guard' : counts.guard > counts.archer ? 'archer' : 'striker';
  const plans: Record<Difficulty, UnitType[]> = { easy: ['guard', 'archer', 'striker', 'medic', 'siege'], normal: ['guard', 'striker', 'archer', 'medic', counter, 'siege'], hard: ['guard', counter, counter, 'archer', 'medic', 'siege', counter] };
  const army: Placement[] = []; let gold = BUDGET, i = 0;
  while (gold >= 80 && i < 30) {
    let type = plans[difficulty][i % plans[difficulty].length]!; if (UNITS[type].cost > gold) type = 'striker';
    if (UNITS[type].cost > gold) break;
    const roleColumn = type === 'guard' || type === 'striker' ? 0 : type === 'medic' ? 2 : 3;
    let x = side ? 10 + roleColumn : 9 - roleColumn, y = (i * 3 + Math.floor(i / 4)) % 12;
    while (army.some(p => p.x === x && p.y === y)) { y = (y + 1) % 12; if (y === 0) x += side ? 1 : -1; }
    army.push({ type, x, y }); gold -= UNITS[type].cost; i++;
  }
  return army;
}

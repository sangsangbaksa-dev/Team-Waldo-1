import { BUDGET, type Placement, type Side } from './sim';
import { TYPES, UNITS, type UnitType } from './units';
export type Difficulty = 'easy' | 'normal' | 'hard';
/** 병사 목록을 진영 앞(가드·스트라이커)·중간(메딕)·뒤(아처·시즈) 열에 차례로 배치합니다. */
function layout(side: Side, types: UnitType[]): Placement[] {
  const army: Placement[] = [];
  types.forEach((type, i) => {
    const roleColumn = type === 'guard' || type === 'striker' ? 0 : type === 'medic' ? 2 : 3;
    let y = side ? 9 - roleColumn : 10 + roleColumn, x = (i * 3 + Math.floor(i / 4)) % 12;
    while (army.some(p => p.x === x && p.y === y)) { x = (x + 1) % 12; if (x === 0) y += side ? -1 : 1; }
    army.push({ type, x, y });
  });
  return army;
}
/** '자동 배치' 버튼용 균형 편성(가드 2·스트라이커 1·아처 3·메딕 1·시즈 1 = 990G). 쉬움·보통 AI를 이기고 어려움 AI와는 접전이 되도록 시뮬레이션으로 맞췄습니다. */
const AUTO_PLAN: UnitType[] = ['guard', 'guard', 'striker', 'archer', 'archer', 'archer', 'medic', 'siege'];
export function autoArmy(side: Side): Placement[] { return layout(side, AUTO_PLAN); }
export function buildArmy(side: Side, difficulty: Difficulty, enemy: Placement[] = []): Placement[] {
  const counts = Object.fromEntries(TYPES.map(t => [t, enemy.filter(p => p.type === t).length])) as Record<UnitType, number>;
  const counter: UnitType = counts.striker > counts.guard && counts.striker >= counts.archer ? 'guard' : counts.guard > counts.archer ? 'archer' : 'striker';
  const plans: Record<Difficulty, UnitType[]> = { easy: ['guard', 'archer', 'striker', 'medic', 'siege'], normal: ['guard', 'striker', 'archer', 'medic', counter, 'siege'], hard: ['guard', counter, counter, 'archer', 'medic', 'siege', counter] };
  const types: UnitType[] = []; let gold = BUDGET, i = 0;
  while (gold >= 80 && i < 30) {
    let type = plans[difficulty][i % plans[difficulty].length]!; if (UNITS[type].cost > gold) type = 'striker';
    if (UNITS[type].cost > gold) break;
    types.push(type); gold -= UNITS[type].cost; i++;
  }
  return layout(side, types);
}

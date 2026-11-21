export type UnitType = 'guard' | 'striker' | 'archer' | 'medic' | 'siege';
export interface Definition { name: string; icon: string; role: string; cost: number; hp: number; damage: number; range: number; speed: number; cooldown: number }
export const TYPES: UnitType[] = ['guard', 'striker', 'archer', 'medic', 'siege'];
export const UNITS: Record<UnitType, Definition> = {
  guard: { name: '가드', icon: '■', role: '튼튼한 전열 · 돌격병 제압', cost: 100, hp: 250, damage: 25, range: 0.8, speed: 1.1, cooldown: 0.8 },
  striker: { name: '스트라이커', icon: '▲', role: '빠른 돌격 · 궁수 제압', cost: 80, hp: 85, damage: 25, range: 0.75, speed: 2.5, cooldown: 0.65 },
  archer: { name: '아처', icon: '●', role: '원거리 사격 · 가드 제압', cost: 120, hp: 75, damage: 21, range: 3.6, speed: 1.3, cooldown: 0.85 },
  medic: { name: '메딕', icon: '◆', role: '아군 치료 · 약한 공격', cost: 150, hp: 110, damage: 8, range: 3, speed: 1.3, cooldown: 0.9 },
  siege: { name: '시즈', icon: '⬢', role: '장거리 범위 공격', cost: 200, hp: 150, damage: 25, range: 6, speed: 0.8, cooldown: 1.5 },
};

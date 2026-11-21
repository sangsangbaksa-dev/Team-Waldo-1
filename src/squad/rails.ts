// 전장 화면 좌우 패널(넓은 화면 전용): 왼쪽은 병종 상성, 오른쪽은 배치 팁 또는 전투 중 남은 병력.
import { TYPES, UNITS, type UnitType } from './units';
import { spriteUrl } from './sprites';
import type { Battle } from './sim';

const img = (t: UnitType, side: 0 | 1 = 0): string => `<img src="${spriteUrl(t, side)}" alt="">`;
const dot = (t: UnitType, side: 0 | 1): string => `<span class="sq-rail-unit" title="${UNITS[t].name}">${img(t, side)}</span>`;

const CYCLE: Array<[UnitType, UnitType]> = [['guard', 'striker'], ['striker', 'archer'], ['archer', 'guard']];

export function leftRail(): string {
  return `<aside class="wd-rail wd-rail-l" aria-hidden="true">
    <div class="wd-card"><h3 class="wd-label">병종 상성</h3><ul class="sq-cycle">${CYCLE.map(([a, b]) => `<li>${dot(a, 0)}<i>→</i>${dot(b, 0)}<span>${UNITS[a].name}가 ${UNITS[b].name}를 제압</span></li>`).join('')}</ul></div>
    <div class="wd-card"><h3 class="wd-label">지원 병종</h3><ul class="sq-cycle"><li>${dot('medic', 0)}<span>${UNITS.medic.role}</span></li><li>${dot('siege', 0)}<span>${UNITS.siege.role}</span></li></ul></div></aside>`;
}

/** 전투 중 남은 병력 목록. 진영마다 병종별 생존 수와 체력 막대. */
export function rosterHtml(battle: Battle): string {
  return ([0, 1] as const).map(s => {
    const rows = TYPES.map(t => {
      const all = battle.units.filter(u => u.side === s && u.type === t); if (!all.length) return '';
      const alive = all.filter(u => u.hp > 0), hp = alive.reduce((n, u) => n + u.hp, 0) / (all.length * UNITS[t].hp);
      return `<li class="${alive.length ? '' : 'out'}">${dot(t, s)}<b>${alive.length}/${all.length}</b><i style="--hp:${Math.round(hp * 100)}%"></i></li>`;
    }).join('');
    return `<div class="wd-card sq-roster-${s}"><h3 class="wd-label">${s === 0 ? '파랑 진영' : '빨강 진영'}</h3><ul class="sq-roster-list">${rows}</ul></div>`;
  }).join('');
}

export function rightRail(stage: 'deploy' | 'battle', battle: Battle | null): string {
  if (stage === 'battle') return `<aside class="wd-rail wd-rail-r" aria-hidden="true"><div class="sq-roster">${battle ? rosterHtml(battle) : ''}</div></aside>`;
  const tips = [`${UNITS.guard.name}는 체력 ${UNITS.guard.hp}으로 가장 단단한 전열입니다.`, `${UNITS.striker.name}는 속도 ${UNITS.striker.speed}로 가장 빠르지만 체력이 ${UNITS.striker.hp}뿐입니다.`, `${UNITS.siege.name}는 사거리 ${UNITS.siege.range}칸, 대신 느리고 ${UNITS.siege.cost}G입니다.`];
  return `<aside class="wd-rail wd-rail-r" aria-hidden="true"><div class="wd-card"><h3 class="wd-label">배치 팁</h3><ul>${tips.map(t => `<li>${t}</li>`).join('')}</ul></div></aside>`;
}

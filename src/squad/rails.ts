// 전장 화면 좌우 패널(넓은 화면 전용): 왼쪽은 병종 상성, 오른쪽은 배치 팁 또는 전투 중 남은 병력.
import { TYPES, UNITS, type UnitType } from './units';
import { spriteUrl } from './sprites';
import type { Battle } from './sim';

const img = (t: UnitType, side: 0 | 1 = 0): string => `<img src="${spriteUrl(t, side)}" alt="">`;
const dot = (t: UnitType, side: 0 | 1): string => `<span class="sq-rail-unit" title="${UNITS[t].name}">${img(t, side)}</span>`;

/** 상성 화살표(그린 그림): 글자 '→' 대신 금빛 그라데이션 화살. */
const ARROW = '<svg viewBox="0 0 22 14" aria-hidden="true"><defs><linearGradient id="sq-arw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1c2"/><stop offset="1" stop-color="#d9a441"/></linearGradient></defs><path d="M1 5h11V1l9 6-9 6V9H1z" fill="url(#sq-arw)" stroke="#2a1c0a" stroke-width="1" stroke-linejoin="round"/></svg>';

const svg = (body: string): string => `<svg class="sq-ico" viewBox="0 0 24 24" aria-hidden="true" stroke="#2a1c0a" stroke-width="1.2" stroke-linejoin="round">${body}</svg>`;
/** HUD 아이콘(그린 그림): 글자 'G'·빈 라벨 대신 금화, 검, 물방울, 방패 그림. */
export const ICON = {
  coin: svg('<defs><radialGradient id="sq-ic-c" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#fff3b8"/><stop offset=".55" stop-color="#f0b83a"/><stop offset="1" stop-color="#9a6410"/></radialGradient></defs><circle cx="12" cy="12" r="9.5" fill="url(#sq-ic-c)"/><circle cx="12" cy="12" r="6.2" fill="none" stroke="#b97d14" stroke-width="1.4"/><path d="M12 7.6l1.2 2.6 2.8.3-2.1 1.9.6 2.8-2.5-1.5-2.5 1.5.6-2.8L8 10.5l2.8-.3z" fill="#fff0b0" stroke="none"/>'),
  sword: svg('<defs><linearGradient id="sq-ic-s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6f9fc"/><stop offset="1" stop-color="#7f8b98"/></linearGradient></defs><path d="M20 3l1 5-9.5 9.5-3-3z" fill="url(#sq-ic-s)"/><path d="M6.5 13l4.5 4.5-1.8 1.8-4.5-4.5z" fill="#c9a15a"/><path d="M5 17.5l-2.5 3.5 3.5-2.5" fill="#6a4426"/>'),
  drop: svg('<defs><radialGradient id="sq-ic-d" cx=".35" cy=".4" r=".8"><stop offset="0" stop-color="#ffc7c2"/><stop offset="1" stop-color="#c9303d"/></radialGradient></defs><path d="M12 2.5C16 8 19 11 19 15a7 7 0 0 1-14 0c0-4 3-7 7-12.500z" fill="url(#sq-ic-d)"/><path d="M8.6 15a3.4 3.4 0 0 0 2.6 3.2" fill="none" stroke="#ffffffaa" stroke-linecap="round"/>'),
  shield: svg('<defs><linearGradient id="sq-ic-h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#bfe3ff"/><stop offset="1" stop-color="#1b5aa6"/></linearGradient></defs><path d="M12 2.5l8 3v6c0 5-3.500 8.500-8 10-4.500-1.500-8-5-8-10v-6z" fill="url(#sq-ic-h)"/><path d="M12 5.500v13" fill="none" stroke="#ffffff88" stroke-width="1.4"/>'),
} as const;

const CYCLE: Array<[UnitType, UnitType]> = [['guard', 'striker'], ['striker', 'archer'], ['archer', 'guard']];

export function leftRail(): string {
  return `<aside class="wd-rail wd-rail-l" aria-hidden="true">
    <div class="wd-card"><h3 class="wd-label">병종 상성</h3><ul class="sq-cycle">${CYCLE.map(([a, b]) => `<li>${dot(a, 0)}${ARROW}${dot(b, 0)}<span>${UNITS[a].name}가 ${UNITS[b].name}를 제압</span></li>`).join('')}</ul></div>
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

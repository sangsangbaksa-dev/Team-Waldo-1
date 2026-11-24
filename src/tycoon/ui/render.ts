// TYCOON — 화면 조각(HTML 문자열). 이벤트는 game.ts 가 위임 방식으로 붙입니다.
import { DISTRICTS, STAGES, STAGE_NAMES } from '../core/data';
import { formatMoney } from '../core';
import type { ActionDef, DayReport, LotView, ShopView, SpotDef, Stage, TycoonCore, TycoonState } from '../core/types';

export const esc = (s: string): string => s.replace(/[&<>"]/g, c => c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;');
export const KIND_LABEL: Record<string, string> = { home: '잠자리', scrap: '줍기 장소', recycle: '고물상', food: '식당', job: '일자리', market: '도매시장', bank: '은행', office: '비즈니스 센터', airport: '국제공항', lot: '가게 부지' };
const pct = (v: number): string => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
const bar = (v: number, cls = ''): string => `<div class="ty-bar ${cls}"><i style="width:${pct(v)}"></i></div>`;

export function ladderHtml(stage: Stage): string {
  const cur = STAGES.indexOf(stage);
  return `<ol class="ty-ladder" aria-label="단계">${STAGES.map((s, i) => `<li class="${i < cur ? 'done' : i === cur ? 'now' : ''}" title="${STAGE_NAMES[s]}"><i></i></li>`).join('')}</ol>`;
}

function shopHtml(s: ShopView): string {
  return `<div class="ty-shop">
    <div class="ty-shop-head"><b>${esc(s.name)}</b><span>${esc(s.kindName)} · Lv${s.level}/${s.maxLevel}</span><em class="${s.serving ? 'on' : 'off'}">${s.serving ? '영업 중' : '영업 안 함'}</em></div>
    <div class="ty-kv"><span>재고</span><b>${s.stock}/${s.stockCap}</b>${bar(s.stockCap ? s.stock / s.stockCap : 0)}</div>
    <div class="ty-kv"><span>평점</span><b>${s.rating}</b>${bar(s.rating / 100, 'gold')}</div>
    <div class="ty-chips"><span>오늘 매출 ${formatMoney(s.todayRevenue)}</span><span>손님 ${s.todayCustomers}명</span><span>놓침 ${s.todayLost}명</span><span>일 순이익 ${formatMoney(s.profitPerDay)}</span><span>직원 ${s.staff.length}명</span><span>가격 ×${s.priceMult.toFixed(2)}</span></div>
  </div>`;
}

function actionHtml(a: ActionDef, idx: number): string {
  const chips = [a.cost > 0 ? `<span class="cost">-${formatMoney(a.cost)}</span>` : '', a.reward > 0 ? `<span class="gain">+${formatMoney(a.reward)}</span>` : '', a.energy ? `<span class="${a.energy < 0 ? 'gain' : 'cost'}">체력 ${a.energy < 0 ? '+' : '-'}${Math.abs(a.energy)}</span>` : '', a.durationSec > 0 ? `<span>${a.durationSec}초</span>` : ''].join('');
  return `<li><button type="button" class="ty-act" data-act="${esc(a.id)}" ${a.enabled ? '' : 'disabled'}><span class="no">${idx < 9 ? idx + 1 : ''}</span><span class="body"><b>${esc(a.label)}</b><small>${esc(a.desc)}</small>${!a.enabled && a.disabledReason ? `<em>${esc(a.disabledReason)}</em>` : ''}</span><span class="chips">${chips}</span></button></li>`;
}

export interface CasinoOutcome { delta: number; message: string }

/** 장소 패널(행동 목록). */
export function spotPanelHtml(core: TycoonCore, spotId: string, locked: boolean, lastBet?: CasinoOutcome | null): string {
  const spot = core.spot(spotId); if (!spot) return '';
  const lot = spot.kind === 'lot' ? spot as LotView : null, d = DISTRICTS[spot.district];
  const status = lot ? (lot.owner === 'player' ? '내 가게' : lot.owner === 'rival' ? `라이벌 · ${esc(lot.rival?.rivalName ?? '')}` : `분양 중 · ${formatMoney(lot.price)}`) : esc(KIND_LABEL[spot.kind] ?? '');
  const acts = locked ? [] : core.actionsAt(spotId);
  const body = lot?.owner === 'player' && lot.shop ? shopHtml(lot.shop)
    : lot?.owner === 'rival' && lot.rival ? `<div class="ty-rivalbox" style="--c:${esc(lot.rival.color)}"><b>${esc(lot.rival.rivalName)}</b><span>${esc(lot.rival.kindName)} Lv${lot.rival.level}</span></div>`
    : lot ? `<div class="ty-chips"><span>부지 ${lot.size}</span><span>부지 가격 ${formatMoney(lot.price)}</span></div>` : '';
  const casino = spot.id === 'casino' && !locked ? `
    <section class="ty-casino-table"${lastBet ? ` data-result="${lastBet.delta > 0 ? 'win' : 'loss'}"` : ''}>
      <span class="ty-casino-coin" aria-hidden="true">${lastBet && lastBet.delta < 0 ? '×' : '$'}</span>
      <div><b>게임 내 현금 ${formatMoney(core.state.cash)}</b>
      <p>${lastBet ? esc(lastBet.message) : '금액을 고르면 동전 결과와 손익이 바로 표시됩니다.'}</p></div>
    </section>` : '';
  const minStage = STAGE_NAMES[spot.minStage];
  return `<div class="ty-panel" role="dialog" aria-label="${esc(spot.name)}">
    <header><span class="ico">${esc(spot.icon)}</span><div><h2>${esc(spot.name)}</h2><p>${esc(d.name)} · ${spot.id === 'casino' ? '가상 카지노' : status}</p></div><button type="button" class="ty-x" data-close aria-label="닫기">✕</button></header>
    ${locked ? `<p class="ty-locked">🔒 <b>${esc(minStage)}</b> 단계가 되면 열립니다.</p>` : ''}
    ${body}
    ${casino}
    ${acts.length ? `<ul class="ty-acts">${acts.map(actionHtml).join('')}</ul>` : locked ? '' : '<p class="ty-none">지금 여기서 할 수 있는 일이 없습니다.</p>'}
    <footer><span>숫자 키로 선택 · Esc 닫기</span></footer>
  </div>`;
}

function reportHtml(r: DayReport): string {
  return `<div class="ty-report"><h3>${r.day}일차 결산</h3>
    <div class="ty-chips"><span>매출 ${formatMoney(r.revenue)}</span><span>원가 ${formatMoney(r.costOfGoods)}</span><span>인건비 ${formatMoney(r.wages)}</span><span>유지비 ${formatMoney(r.upkeep)}</span><span>이자 ${formatMoney(r.interest)}</span><span>세금 ${formatMoney(r.tax)}</span>${r.worldIncome ? `<span>해외 ${formatMoney(r.worldIncome)}</span>` : ''}${r.jobIncome ? `<span>일당 ${formatMoney(r.jobIncome)}</span>` : ''}</div>
    <p class="${r.profit >= 0 ? 'gain' : 'cost'}">순이익 <b>${formatMoney(r.profit)}</b> · 손님 ${r.customers}명 (놓침 ${r.lost})</p></div>`;
}

/** 현황판: 자산·목표·가게·라이벌·해외·이벤트. */
export function statusHtml(s: TycoonState): string {
  const goal = s.goal;
  return `<div class="ty-panel wide" role="dialog" aria-label="현황">
    <header><span class="ico">📊</span><div><h2>${esc(s.stageName)}</h2><p>${s.day}일차 · 순자산 ${formatMoney(s.netWorth)}${s.debt ? ` · 빚 ${formatMoney(s.debt)}` : ''}</p></div><button type="button" class="ty-x" data-close aria-label="닫기">✕</button></header>
    <section><h3>다음 목표 — ${esc(goal.label)}</h3>${bar(goal.progress, 'gold')}<ul class="ty-steps">${goal.steps.map(st => `<li class="${st.done ? 'done' : ''}"><span>${st.done ? '✔' : '○'} ${esc(st.label)}</span>${st.done ? '' : bar(st.progress)}</li>`).join('')}</ul></section>
    <section><h3>내 가게 (${s.owned.length})</h3>${s.owned.length ? s.owned.map(shopHtml).join('') : '<p class="ty-none">아직 가게가 없습니다. 부지를 사서 시작해 보세요.</p>'}</section>
    ${s.rivals.length ? `<section><h3>라이벌</h3><ul class="ty-list">${s.rivals.map(r => `<li style="--c:${esc(r.color)}"><i></i><b>${esc(r.name)}</b><span>${r.acquired ? '인수 완료' : `가게 ${r.shops} · 가치 ${formatMoney(r.value)}`}</span></li>`).join('')}</ul></section>` : ''}
    ${s.stageIndex >= 5 ? `<section><h3>세계 시장</h3><ul class="ty-list">${s.regions.map(r => `<li><b>${esc(r.name)}</b><span>${Math.round(r.share * 100)}%${r.conquered ? ' · 정복' : ''}</span>${bar(r.share, r.conquered ? 'gold' : '')}</li>`).join('')}</ul></section>` : ''}
    ${s.events.length ? `<section><h3>진행 중인 일</h3><ul class="ty-list">${s.events.map(e => `<li><b>${esc(e.name)}</b><span>${esc(e.desc)} (${e.daysLeft}일)</span></li>`).join('')}</ul></section>` : ''}
    ${s.lastReport ? `<section>${reportHtml(s.lastReport)}</section>` : ''}
  </div>`;
}

export function menuHtml(sound: boolean, firstPerson: boolean, confirmRestart = false): string {
  return `<div class="ty-pause-screen wd-screen"><div class="ty-panel narrow ty-pause-panel wd-panel" role="dialog" aria-label="일시정지">
    <p class="wd-eyebrow">HUSTLE / PAUSED</p><h2 class="wd-title">일시정지</h2><p class="wd-lead">잠시 쉬어가세요. 진행 상황은 자동으로 저장됩니다.</p>
    <div class="ty-acts wd-actions">
      <button type="button" class="ty-act wd-btn primary" data-menu="resume">이어하기</button>
      <button type="button" class="ty-act wd-btn ghost" data-menu="save">저장하기</button>
      <button type="button" class="ty-act wd-btn ghost" data-menu="view">시점: ${firstPerson ? '1인칭' : '3인칭'} (V)</button>
      <button type="button" class="ty-act wd-btn ghost" data-menu="sound">소리 ${sound ? '켜짐' : '꺼짐'}</button>
      <button type="button" class="ty-act danger wd-btn ghost" data-menu="restart">${confirmRestart ? '다시 시작하려면 한 번 더 누르세요' : '다시 시작'}</button>
      <button type="button" class="ty-act danger wd-btn ghost" data-menu="exit">게임 목록으로</button>
    </div></div></div>`;
}

export function titleHtml(has: boolean, summary: string, confirmNew = false): string {
  return `<div class="ty-titlebox wd-panel">
    <p class="kick wd-eyebrow">WALDO / CITY TYCOON</p><h1 class="wd-title">HUSTLE</h1><p class="sub wd-lead">작은 일부터 시작해 나만의 도시를 만들어 보세요.</p>
    <div class="ty-ladder-lg">${STAGES.map(s => `<span>${STAGE_NAMES[s]}</span>`).join('<i>›</i>')}</div>
    <p class="ty-first-route"><b>첫 목표</b> 빈 병 줍기 → 고물상에서 팔기 → 일자리로 첫 가게 자금 모으기</p>
    <div class="ty-title-btns wd-actions">
      ${has ? `<button type="button" class="wd-btn primary" data-title="continue">이어하기<small>${esc(summary)}</small></button><button type="button" class="wd-btn ghost" data-title="new">${confirmNew ? '저장이 지워집니다 — 한 번 더 누르면 새로 시작' : '다시 시작'}</button>` : '<button type="button" class="wd-btn primary" data-title="new">시작</button>'}
      <button type="button" class="wd-btn ghost" data-title="exit">게임 목록으로</button>
    </div>
    <p class="keys">WASD 이동 / 운전 · Shift 달리기 · E 상호작용 · F 차량 탑승 · Space 브레이크 · H 경적 · V 시점 · Tab 현황 · M 지도(클릭해 목적지 지정)</p>
  </div>`;
}

export function failHtml(): string {
  return `<div class="ty-titlebox wd-panel"><p class="kick wd-eyebrow">HUSTLE</p><h1 class="wd-title">그래픽을 시작하지 못했어요</h1><p class="sub wd-lead">WebGL을 지원하는 브라우저에서 다시 시도해 주세요.</p>
    <div class="ty-title-btns wd-actions"><button type="button" class="wd-btn primary" data-title="exit">게임 목록으로</button></div></div>`;
}

export function winHtml(s: TycoonState): string {
  return `<div class="ty-win-screen wd-screen"><div class="ty-titlebox win wd-panel"><p class="kick wd-eyebrow">HUSTLE / MILESTONE</p><h1 class="wd-title">세계 정복</h1><p class="sub wd-lead">${s.day}일 만에 세계를 손에 넣었습니다. 순자산 ${formatMoney(s.netWorth)}</p>
    <div class="ty-title-btns wd-actions"><button type="button" class="wd-btn primary" data-title="keep">이어하기</button><button type="button" class="wd-btn ghost" data-title="exit">게임 목록으로</button></div></div></div>`;
}
/** Accessible map directory: pure HTML renderer, independent of scene and save state. */
export interface MapCarRow {
  name: string;
  active: boolean;
  reachable: boolean;
  distance: number;
}

export function mapDirectoryHtml(cars: readonly MapCarRow[], hasWaypoint: boolean, teleportBlock?: string): string {
  const rows = cars.map((car, index) => {
    const distance = Number.isFinite(car.distance) ? Math.max(0, Math.round(car.distance)) : 0;
    const description = car.active ? '현재 운전 중'
      : car.reachable ? `도로 기준 약 ${distance}미터, 목적지로 설정` : '구역 개방 후 이용 가능';
    const sub = car.active ? '현재 운전 중' : car.reachable ? `도로 약 ${distance}m` : '구역 개방 후 이용 가능';
    return `<button type="button" class="ty-map-vehicle" data-vehicle-target="${index}"
      ${!car.reachable || car.active ? 'disabled' : ''} aria-label="${esc(car.name)} · ${esc(description)}">
      <span class="ty-map-car-icon" aria-hidden="true">◈</span>
      <span class="ty-map-car-copy"><strong>${esc(car.name)}</strong><small>${sub}</small></span>
      <span class="ty-map-car-chevron" aria-hidden="true">${car.reachable && !car.active ? '↗' : '—'}</span></button>`;
  }).join('');
  const canTeleport = hasWaypoint && !teleportBlock;
  const teleportHint = teleportBlock ?? (hasWaypoint ? '핀 근처의 빈 공간에 착지합니다.' : '지도에서 먼저 핀을 지정하세요.');
  return `<div class="ty-bigmap" role="dialog" aria-modal="true" aria-label="도시 지도">
    <button type="button" class="ty-x" data-close aria-label="지도 닫기">✕</button>
    <div class="ty-map-layout">
      <div class="ty-map-surface"><canvas id="ty-bigmap" width="720" height="720" tabindex="0" aria-label="도시 지도 핀" aria-describedby="ty-map-help"></canvas>
        <div class="ty-map-caption" id="ty-map-help">지도 클릭 또는 방향키로 핀 지정 · 점선은 도로 경로</div></div>
      <div class="ty-map-aside"><div class="ty-map-aside-head"><small>CITY DIRECTORY</small><h2>이동할 곳을 선택하세요</h2><p>차량을 선택하거나 지도 위의 지점을 눌러 주세요. 도로는 자유롭게 탐험할 수 있지만 사업장 이용에는 성장 단계가 적용됩니다.</p></div>
        <div class="ty-map-vehicles">${rows || '<p class="ty-map-empty">배치된 차량이 없습니다.</p>'}</div>
        <div class="ty-warp-controls">
          <button type="button" class="wd-btn primary" data-waypoint-teleport aria-describedby="ty-warp-hint" ${canTeleport ? '' : 'disabled'}>핀으로 순간이동</button>
          <small id="ty-warp-hint">${esc(teleportHint)}</small>
        </div>
        <button type="button" class="ty-clear-waypoint" data-waypoint-clear ${hasWaypoint ? '' : 'disabled'}>핀 지우기</button>
      </div>
    </div>
  </div>`;
}

export type { SpotDef };

import type { War } from './war';
import {
  JOBS, INFRASTRUCTURE, TAXES, ROUTES, CONTRACTS, population, populationCap, storageCap, taxIncome, foodUpkeep,
  infrastructureCost, constructionRequirement, routeRequirement, exportReward,
  assignWorker, recruitWorker, setTax, construct, cancelConstruction, dispatchExport, acceptContract, fulfillContract,
  type Job, type Infrastructure, type Route, type Contract, type Tax,
} from './economy';
import { affordability, economicForecast } from './management';
import { icon } from '../ui/icons';

export const waitLabel = (seconds: number) => Number.isFinite(seconds) ? `${Math.max(0, Math.ceil(seconds))}초` : '생산 재배치 필요';
/** Create stable controls once; forecasts never replace focused DOM elements. */
export function mountEconomyPanels(root: HTMLElement, w: War, perform: (action: () => boolean, message: string) => void, focusRoute: (route: Route) => void = () => {}): (unavailable: boolean) => void {
  const query = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const put = (selector: string, value: string) => { const node = query(selector); if (node.textContent !== value) node.textContent = value; };
  const disable = (selector: string, value: boolean) => { query<HTMLButtonElement>(selector).disabled = value; };
  query('#civil-economy').innerHTML = `
    <div class="finance-overview" aria-label="경제 전망"><div><span>초당 순수입</span><b id="net-income"></b></div><p id="food-forecast"></p><p id="storage-forecast"></p><p id="activity-forecast"></p></div>
    <p class="economy-alert" id="civil-alert" role="status" hidden></p>
    <div class="section-heading"><h2>일꾼 배치</h2><span id="idle-workers"></span></div>
    <div class="worker-allocation">${(['mine', 'farm', 'trade'] as const).map(job => `<div class="worker-row"><span>${icon(job === 'mine' ? 'coin' : job === 'farm' ? 'leaf' : 'home', 16)}${JOBS[job]}<small id="worker-effect-${job}"></small></span><button id="worker-minus-${job}" aria-label="${JOBS[job]} 일꾼 1명 대기로">−</button><b id="worker-count-${job}"></b><button id="worker-plus-${job}" aria-label="대기 일꾼 1명 ${JOBS[job]} 배치">+</button></div>`).join('')}</div>
    <button class="civil-button" id="recruit-worker">${icon('home', 16)}시민 1명 모집 <small>금 20 · 식량 30</small></button><p class="panel-note" id="recruit-worker-reason"></p>
    <p class="panel-note">−로 대기시킨 뒤 +로 재배치하세요. 도시 탭에서 인구 한도를 확장하고, 시장 건설 후 상인을 배치하세요.</p>
    <div class="section-heading"><h2>생산 시설과 방어</h2><span>최대 Lv.4</span></div>`;
  query('#pane-city').innerHTML = `
    <div class="civil-stats"><div><span>시민 / 인구 한도</span><b id="civil-population"></b></div><div><span>행복도 / 평판</span><b id="civil-happiness"></b></div><div><span>자원별 저장 한도</span><b id="civil-storage"></b></div><div><span>세금 / 추가 식량 소비</span><b id="civil-tax-income"></b></div></div>
    <div class="section-heading"><h2>도시 세금</h2><span>시민 12명 초과분 과세</span></div><div class="segmented" id="tax-controls">${(Object.keys(TAXES) as Tax[]).map(tax => `<button id="tax-${tax}" aria-pressed="false">${TAXES[tax].label}</button>`).join('')}</div>
    <p class="panel-note" id="civil-tax-description"></p>
    <div class="section-heading"><h2>민생·교역 기반시설</h2><span>동시 건설 1개</span></div>
    <div class="construction-status" tabindex="-1" id="construction-status"><span id="construction-label">건설 대기 중</span><progress id="construction-progress" max="1" value="0" aria-label="기반시설 건설 진행률"></progress><button id="cancel-construction" class="text-button">건설 취소 · 비용 75% 환불</button></div>
    <div class="action-list">${(Object.keys(INFRASTRUCTURE) as Infrastructure[]).map(key => `<button class="war-action infrastructure-action" id="civil-build-${key}"><span class="action-copy"><b>${INFRASTRUCTURE[key].label}</b><small>${INFRASTRUCTURE[key].description}</small></span><span class="action-meta"></span></button>`).join('')}</div>`;
  query('#pane-trade').innerHTML = `
    <div class="civil-stats"><div><span>완료 수출 / 계약</span><b id="trade-completed"></b></div><div><span>누적 교역 금 수입</span><b id="trade-earned"></b></div></div>
    <div id="economic-goal" class="economic-goal" tabindex="-1"></div>
    <div class="section-heading"><h2>수출 항로</h2><span>동시 운송 1건</span></div>
    <div class="shipment-status" id="shipment-status" role="status"></div><progress id="shipment-progress" max="1" value="0" aria-label="수출 운송 진행률"></progress>
    <label class="export-load-label">운송 규모<select id="export-loads" aria-label="수출 화물 수량"><option value="1">1대 · 상인 1명</option><option value="2">2대 · 시장 Lv.2 · 상인 2명</option><option value="3">3대 · 시장 Lv.3 · 상인 3명</option></select></label>
    <div class="trade-cards">${(Object.keys(ROUTES) as Route[]).map(key => `<article class="trade-card"><span class="kicker">${key === 'caravan' ? 'LAND ROUTE' : 'SEA ROUTE'}</span><h3>${ROUTES[key].label}</h3><p id="route-description-${key}"></p><small id="route-requirement-${key}"></small><div class="trade-route-actions"><button class="civil-button" id="export-${key}">수출 출발</button><button class="civil-button" id="route-map-${key}" aria-label="${ROUTES[key].label} 지도에서 항로 보기">항로 보기</button></div></article>`).join('')}</div>
    <p class="panel-note">해상 항로는 무역항과 서부 항구 또는 남동부 교역소 점령이 필요합니다. 필요한 상인·거점을 잃으면 운송이 멈추며 복구 시 재개합니다. 대금은 출발 당시 평판으로 확정됩니다.</p>
    <div class="section-heading"><h2>납품 계약</h2><span>동시 계약 1건</span></div>
    <article class="active-contract" id="active-contract" tabindex="-1" hidden><h3 id="active-contract-title"></h3><p id="active-contract-description"></p><strong id="contract-deadline"></strong><p id="contract-forecast"></p><button class="civil-button" id="fulfill-contract">자원 납품 · 보상 받기</button></article>
    <div class="trade-cards">${(Object.keys(CONTRACTS) as Contract[]).map(key => `<article class="trade-card"><span class="kicker">MARKET LV.${CONTRACTS[key].market}</span><h3>${CONTRACTS[key].label}</h3><p>${CONTRACTS[key].resource === 'food' ? '식량' : '금'} ${CONTRACTS[key].amount} 납품 → ${CONTRACTS[key].gold ? `금 ${CONTRACTS[key].gold}` : `식량 ${CONTRACTS[key].food}`}<br>기한 ${CONTRACTS[key].seconds}초 · 보증금 ${CONTRACTS[key].deposit}금</p><small id="contract-estimate-${key}"></small><button class="civil-button" id="contract-${key}">계약 체결</button></article>`).join('')}</div>
    <p class="panel-note">성공: 보증금 반환 · 평판 +10. 만료: 보증금 소멸 · 평판 −10. 같은 계약은 종료 후 120초 뒤 재계약합니다. 창고를 넘치는 보상·환불은 받지 못합니다.</p>`;
  for (const job of ['mine', 'farm', 'trade'] as Exclude<Job, 'idle'>[]) for (const change of [-1, 1]) query<HTMLButtonElement>(`#worker-${change > 0 ? 'plus' : 'minus'}-${job}`).onclick = () => perform(() => assignWorker(w, 0, job, change), '일꾼 배치를 변경했습니다.');
  query<HTMLButtonElement>('#recruit-worker').onclick = () => perform(() => recruitWorker(w, 0), '시민이 합류했습니다. 대기 일꾼을 생산 시설에 배치하세요.');
  for (const tax of Object.keys(TAXES) as Tax[]) query<HTMLButtonElement>(`#tax-${tax}`).onclick = () => perform(() => setTax(w, 0, tax), `${TAXES[tax].label}를 적용했습니다.`);
  for (const key of Object.keys(INFRASTRUCTURE) as Infrastructure[]) query<HTMLButtonElement>(`#civil-build-${key}`).onclick = () => perform(() => construct(w, 0, key), `${INFRASTRUCTURE[key].label} 건설을 시작했습니다.`);
  query<HTMLButtonElement>('#cancel-construction').onclick = () => perform(() => cancelConstruction(w, 0), '건설을 취소하고 비용의 75%를 환불했습니다.');
  for (const key of Object.keys(ROUTES) as Route[]) {
    query<HTMLButtonElement>(`#export-${key}`).onclick = () => perform(() => dispatchExport(w, 0, key, Number(query<HTMLSelectElement>('#export-loads').value)), `${ROUTES[key].label} 수출이 출발했습니다.`);
    query<HTMLButtonElement>(`#route-map-${key}`).onclick = () => focusRoute(key);
  }
  for (const key of Object.keys(CONTRACTS) as Contract[]) query<HTMLButtonElement>(`#contract-${key}`).onclick = () => perform(() => acceptContract(w, 0, key), '계약을 체결했습니다. 기한 안에 자원을 납품하세요.');
  query<HTMLButtonElement>('#fulfill-contract').onclick = () => perform(() => fulfillContract(w, 0), '납품 완료! 보상과 보증금을 받고 평판이 올랐습니다.');
  let refresh: (unavailable: boolean) => void;
  query<HTMLSelectElement>('#export-loads').onchange = () => refresh(w.over || !w.factions[0].alive);
  return refresh = unavailable => {
    const f = w.factions[0], e = w.economy[0], cap = storageCap(w, 0), forecast = economicForecast(w);
    put('#net-income', `금 +${forecast.gold.toFixed(1)} / 식량 ${forecast.food >= 0 ? '+' : ''}${forecast.food.toFixed(1)}`);
    put('#food-forecast', Number.isFinite(forecast.foodSeconds) ? `식량 고갈까지 약 ${waitLabel(forecast.foodSeconds)} · 농장 일꾼을 늘리세요.` : `추가 시민 부양비 ${foodUpkeep(e).toFixed(1)}식량/초 · 현재 생산으로 유지 가능`);
    put('#storage-forecast', `자원별 한도 ${cap.toLocaleString('ko-KR')} · 금 저장 여유 ${(Number.isFinite(forecast.goldFullSeconds)?waitLabel(forecast.goldFullSeconds):'충분')} · 식량 ${(Number.isFinite(forecast.foodFullSeconds)?waitLabel(forecast.foodFullSeconds):'충분')}`);
    put('#activity-forecast', [e.construction ? `${INFRASTRUCTURE[e.construction.key].label} 완료 ${waitLabel(e.construction.remaining)}` : '건설 대기', e.shipment ? `수출 도착 ${waitLabel(e.shipment.remaining)}` : '운송 대기', e.contract ? `납품 마감 ${waitLabel(e.contract.deadline - w.time)}` : '계약 대기'].join(' · '));
    put('#civil-population', `${population(e)} / ${populationCap(e)}명`); put('#civil-happiness', `${Math.floor(e.happiness)}% / ${e.reputation}`);
    put('#civil-storage', cap.toLocaleString('ko-KR')); put('#civil-tax-income', `+${taxIncome(e).toFixed(1)}금 / −${foodUpkeep(e).toFixed(1)}식량`); put('#idle-workers', `대기 ${e.workers.idle}명`);
    for (const job of ['mine', 'farm', 'trade'] as const) {
      put(`#worker-count-${job}`, `${e.workers[job]}`); put(`#worker-effect-${job}`, job === 'trade' ? `시장 Lv.${e.market}` : `시설 Lv.${f[job]}`);
      disable(`#worker-minus-${job}`, unavailable || e.workers[job] === 0); disable(`#worker-plus-${job}`, unavailable || e.workers.idle === 0 || (job === 'trade' && !e.market));
    }
    const recruitment = affordability(w, 20, 30);
    disable('#recruit-worker', unavailable || population(e) >= populationCap(e) || recruitment.seconds > 0);
    put('#recruit-worker-reason', population(e) >= populationCap(e) ? '인구 한도 도달 · 도시를 확장하세요.' : recruitment.seconds ? `금 ${recruitment.gold} · 식량 ${recruitment.food} 부족 · ${waitLabel(recruitment.seconds)} 후 모집 가능` : `인구 ${population(e)}/${populationCap(e)} · 모집 후 대기 일꾼에 합류`);
    for (const tax of Object.keys(TAXES) as Tax[]) { const button = query<HTMLButtonElement>(`#tax-${tax}`); button.disabled = unavailable; button.classList.toggle('selected', e.tax === tax); button.setAttribute('aria-pressed', String(e.tax === tax)); }
    put('#civil-tax-description', e.tax === 'high' ? '세수 +80% · 행복도 −0.3/초. 낮은 행복도는 생산량을 줄입니다.' : e.tax === 'low' ? '세수 −50% · 행복도 +0.2/초. 높은 행복도는 생산량을 늘립니다.' : '기본 세수 · 행복도 유지. 식량 부족 시 행복도가 감소합니다.');
    const alert = f.gold >= cap || f.food >= cap ? '저장 한도 도달 · 자원을 쓰거나 도시 탭에서 창고를 확장하세요.' : forecast.foodSeconds < 60 ? '식량 부족 임박 · 농장 일꾼을 늘리세요.' : e.happiness < 50 ? '행복도 저하로 생산량 감소 · 도시 탭에서 감세를 검토하세요.' : '';
    query('#civil-alert').hidden = !alert; put('#civil-alert', alert);
    const build = e.construction;
    put('#construction-label', build ? `${INFRASTRUCTURE[build.key].label} 건설 · ${Math.ceil(build.remaining)}초 남음` : '건설 대기 중');
    query<HTMLProgressElement>('#construction-progress').value = build ? 1 - build.remaining / infrastructureCost(e, build.key).seconds : 0; disable('#cancel-construction', unavailable || !build);
    for (const key of Object.keys(INFRASTRUCTURE) as Infrastructure[]) {
      const cost = infrastructureCost(e, key), requirement = constructionRequirement(e, key), needed = affordability(w, cost.gold, cost.food);
      disable(`#civil-build-${key}`, unavailable || Boolean(requirement) || needed.seconds > 0);
      put(`#civil-build-${key} .action-meta`, requirement || `Lv.${e[key]} → ${e[key] + 1}\n${cost.gold}금 · ${cost.food}식량\n건설 ${cost.seconds}초${needed.seconds ? '\n준비 ' + waitLabel(needed.seconds) : ''}`);
    }
    put('#trade-completed', `${e.exports} / ${e.completed}건`); put('#trade-earned', `${Math.floor(e.tradeGold).toLocaleString('ko-KR')}금`);
    query('#economic-goal').hidden = !w.economyCampaign; put('#economic-goal', `경제 승리 · 도시 ${e.city}/4 · 계약 ${Math.min(3, e.completed)}/3 · 평판 ${e.reputation}/80 · 거점 ${w.outposts.filter(p => p.owner === 0).length}/3`);
    const blocked = e.shipment ? routeRequirement(w, 0, e.shipment.route, e.shipment.loads) : '';
    put('#shipment-status', e.shipment ? `${ROUTES[e.shipment.route].label} · ${e.shipment.loads}대 · 대금 ${e.shipment.reward}금 · ${blocked ? '운송 중단: ' + blocked : '도착까지 ' + waitLabel(e.shipment.remaining)}` : '운송 대기 · 항로 보기로 교역로와 확보할 거점을 확인하세요.');
    query<HTMLProgressElement>('#shipment-progress').value = e.shipment ? 1 - e.shipment.remaining / ROUTES[e.shipment.route].seconds : 0;
    const loads = Number(query<HTMLSelectElement>('#export-loads').value);
    for (const key of Object.keys(ROUTES) as Route[]) {
      const def = ROUTES[key], requirement = (e.exportReadyAt ?? 0) > w.time ? '이전 수출 정산 대기 ' + waitLabel((e.exportReadyAt ?? 0) - w.time) : routeRequirement(w, 0, key, loads), needed = affordability(w, 0, def.food * loads);
      put(`#route-description-${key}`, `식량 ${def.food * loads} → 금 ${exportReward(e, key) * loads}\n운송 ${def.seconds}초 · 식량 1당 ${(exportReward(e, key) / def.food).toFixed(2)}금 · ${def.port ? '해상 거점 유지 필요' : '거점 점령 없이 육상 교역'}`);
      put(`#route-requirement-${key}`, requirement || (needed.seconds ? `식량 ${needed.food} 부족 · 준비 ${waitLabel(needed.seconds)}` : '출발 가능 · 미니맵에서 운송 위치 표시'));
      disable(`#export-${key}`, unavailable || Boolean(e.shipment) || Boolean(requirement) || needed.seconds > 0); disable(`#route-map-${key}`, unavailable);
    }
    query('#active-contract').hidden = !e.contract;
    if (e.contract) {
      const def = CONTRACTS[e.contract.key], remaining = e.contract.deadline - w.time;
      put('#active-contract-title', def.label); put('#active-contract-description', `${def.resource === 'food' ? '식량' : '금'} ${def.amount} 납품 · 현재 ${Math.floor(f[def.resource])}`);
      put('#contract-deadline', `납품까지 ${Math.max(0, Math.ceil(remaining))}초`);
      put('#contract-forecast', forecast.deliverySeconds === 0 ? '납품 준비 완료 · 버튼을 눌러 보상을 받으세요.' : `현재 생산 기준 준비 ${waitLabel(forecast.deliverySeconds)}${forecast.deliverySeconds > remaining ? ' · 기한 초과 예상: 일꾼 재배치 또는 거점 확보 필요' : ' · 기한 내 준비 가능'}`);
      query('#contract-forecast').classList.toggle('danger', forecast.deliverySeconds > remaining);
      disable('#fulfill-contract', unavailable || remaining <= 0 || f[def.resource] < def.amount);
    }
    for (const key of Object.keys(CONTRACTS) as Contract[]) {
      const def = CONTRACTS[key], cooldown = Math.max(0, Math.ceil(e.availableAt[key] - w.time));
      const estimate = affordability(w, def.resource === 'gold' ? def.amount + def.deposit : def.deposit, def.resource === 'food' ? def.amount : 0).seconds;
      put(`#contract-estimate-${key}`, `현재 생산 기준 준비 ${waitLabel(estimate)}${estimate > def.seconds ? ' · 계약 전 생산 확보 권장' : ''}`);
      put(`#contract-${key}`, e.contract?.key === key ? '진행 중 · 위에서 납품' : e.contract ? '다른 계약 진행 중' : cooldown ? `${cooldown}초 후 재계약` : e.market < def.market ? `시장 Lv.${def.market} 필요` : `계약 체결 · 보증금 ${def.deposit}금`);
      disable(`#contract-${key}`, unavailable || Boolean(e.contract) || cooldown > 0 || e.market < def.market || f.gold < def.deposit);
    }
  };
}

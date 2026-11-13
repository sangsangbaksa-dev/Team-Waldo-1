import './operations.css';
import { icon } from '../ui/icons';
import { CONTRACTS, SUPPORTS, listContracts, claimContract, supportStatus, useSupport,
  type ContractId, type OperationsFocus, type SupportId } from './operations';
import { SQUAD_NAMES, type SquadId } from './squads';
import type { War } from './war';

export const operationsMarkup = `
  <div class="operations-heading"><span class="kicker">FIELD OPERATIONS</span><h2>원정 사령부</h2><p>부대를 지원하고, 원정 목표를 달성해 보급을 받으세요.</p></div>
  <section class="operations-support" aria-label="전장 지원">
    <div class="section-heading"><h3>전장 지원</h3><span id="support-squad-name">주력군</span></div>
    <div class="support-squads" role="group" aria-label="지원할 부대">${SQUAD_NAMES.map((name, i) => `<button data-support-squad="${i}" aria-pressed="${i === 0}">${name}</button>`).join('')}</div>
    <div class="support-grid">${SUPPORTS.map(support => `<article class="support-card" data-support="${support.id}">
      <div class="support-heading"><span>${icon(support.id === 'medical' ? 'leaf' : support.id === 'march' ? 'bolt' : 'shield', 19)}</span><h4>${support.title}</h4><small>${support.cooldown}초 재사용</small></div>
      <p>${support.description}</p><button id="support-${support.id}" type="button"><span data-support-label>지원 요청</span><small data-support-cost></small></button><span class="support-status" data-support-status role="status"></span>
    </article>`).join('')}</div>
  </section>
  <section class="operations-contracts" aria-label="원정 계약">
    <div class="section-heading"><h3>원정 계약</h3><span id="contract-count">0 / ${CONTRACTS.length} 완료</span></div>
    <p class="panel-note">목표를 달성한 뒤 보상을 받으세요. 각 보상은 원정마다 한 번만 받을 수 있습니다.</p>
    <div class="contract-list">${CONTRACTS.map((contract, index) => `<article class="contract-card" id="contract-${contract.id}">
      <div class="contract-title"><span class="contract-number">${String(index + 1).padStart(2, '0')}</span><h4>${contract.title}</h4><span data-contract-state></span></div>
      <p>${contract.description}</p><div class="contract-progress" role="progressbar" aria-label="${contract.title}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
      <div class="contract-footer"><span data-contract-reward></span><button data-claim-contract="${contract.id}">목표 보기 ${icon('arrow', 13)}</button></div>
    </article>`).join('')}</div>
  </section>`;

interface OperationsControls {
  selectedSquad(): SquadId;
  selectSquad(squad: SquadId): void;
  focus(focus: OperationsFocus): void;
  available(): boolean;
  changed(message: string): void;
}

/** This UI never owns game state: every click is revalidated by the simulation module. */
export function createOperationsPanel(root: HTMLElement, war: War, controls: OperationsControls) {
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-support-squad]')) {
    button.onclick = () => { controls.selectSquad(Number(button.dataset.supportSquad) as SquadId); refresh(); };
  }
  for (const definition of SUPPORTS) {
    find<HTMLButtonElement>(`#support-${definition.id}`).onclick = () => {
      if (!controls.available()) return;
      const squad = controls.selectedSquad();
      if (useSupport(war, definition.id, squad)) controls.changed(`${SQUAD_NAMES[squad]} · ${definition.title} 지원을 시작했습니다.`);
      refresh();
    };
  }
  for (const contract of CONTRACTS) {
    find<HTMLButtonElement>(`[data-claim-contract="${contract.id}"]`).onclick = () => {
      if (!controls.available()) return;
      const status = listContracts(war).find(item => item.id === contract.id)!;
      if (status.claimed) return;
      if (status.ready) {
        if (claimContract(war, contract.id)) controls.changed(`${contract.title} 완료 · 금 +${status.reward.gold} · 식량 +${status.reward.food}`);
        refresh();
      } else controls.focus(contract.focus);
    };
  }

  function updateSupport(id: SupportId): void {
    const status = supportStatus(war, id, controls.selectedSquad());
    if (!status) return;
    const card = find(`[data-support="${id}"]`), button = find<HTMLButtonElement>(`#support-${id}`);
    button.disabled = !controls.available() || !status.available;
    card.classList.toggle('support-active', status.activeFor > 0);
    find(`[data-support="${id}"] [data-support-label]`).textContent = status.activeFor > 0 ? `효과 ${Math.ceil(status.activeFor)}초` : status.remaining > 0 ? `${Math.ceil(status.remaining)}초 후` : '지원 요청';
    find(`[data-support="${id}"] [data-support-cost]`).textContent = `금 ${status.cost.gold} · 식량 ${status.cost.food}`;
    find(`[data-support="${id}"] [data-support-status]`).textContent = status.available ? `${status.affected}명에게 적용` : status.reason;
  }

  function refresh(): void {
    const selected = controls.selectedSquad();
    find('#support-squad-name').textContent = SQUAD_NAMES[selected];
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-support-squad]')) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.supportSquad) === selected));
    }
    SUPPORTS.forEach(support => updateSupport(support.id));
    const contracts = listContracts(war);
    find('#contract-count').textContent = `${contracts.filter(contract => contract.claimed).length} / ${CONTRACTS.length} 완료`;
    for (const contract of contracts) {
      const card = find(`#contract-${contract.id}`), bar = card.querySelector<HTMLElement>('.contract-progress')!;
      card.classList.toggle('contract-ready', contract.ready); card.classList.toggle('contract-claimed', contract.claimed);
      card.querySelector<HTMLElement>('[data-contract-state]')!.textContent = contract.claimed ? '완료' : contract.ready ? '보상 대기' : `${contract.current}/${contract.target}`;
      const percent = Math.round(contract.progress * 100);
      bar.setAttribute('aria-valuenow', String(percent)); bar.querySelector('i')!.style.width = `${percent}%`;
      card.querySelector<HTMLElement>('[data-contract-reward]')!.textContent = `금 +${contract.reward.gold} · 식량 +${contract.reward.food}`;
      const button = card.querySelector<HTMLButtonElement>('[data-claim-contract]')!;
      button.disabled = contract.claimed || !controls.available();
      button.textContent = contract.claimed ? '수령 완료' : contract.ready ? '보상 받기' : '목표 보기 →';
    }
    const badge = root.querySelector<HTMLElement>('#operations-badge');
    if (badge) { const ready = contracts.filter(contract => contract.ready).length; badge.textContent = String(ready); badge.hidden = ready === 0; }
  }
  return { refresh };
}

export type { ContractId };

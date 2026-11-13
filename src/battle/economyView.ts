import type { War } from './war';
import { CONTRACTS, develop, developmentCost, workerCapacity, assignWorker, exportFood, acceptContract, deliverContract } from './economy';
/** Create controls once so periodic refresh never steals focus or interrupts clicks. */
export function mountEconomy(parent: HTMLElement, w: War, perform: (action: () => boolean, message: string) => void): () => void {
  const section = document.createElement('section'); section.className = 'economy-expansion';
  section.innerHTML = '<div class="section-heading"><h2>도시와 교역</h2></div><p class="panel-note">도시를 확장해 일꾼을 확보하세요. 시설 레벨마다 일꾼 2명이 생산합니다. 수출과 군량 확보 사이에서 선택하세요.</p><p class="panel-note" data-economy-status></p><div class="action-list"></div><p class="panel-note" data-contract-status aria-live="polite"></p>';
  parent.append(section);
  const list = section.querySelector('.action-list')!;
  const controls: {button: HTMLButtonElement; label: () => string; disabled: () => boolean}[] = [];
  const e = () => w.factions[0].economy!;
  const f = () => w.factions[0];
  const add = (label: () => string, action: () => boolean, disabled: () => boolean = () => false) => {
    const button = document.createElement('button'); button.className = 'war-action economy-control';
    button.onclick = () => perform(action, '왕국 경제 명령을 실행했습니다.'); list.append(button); controls.push({button,label,disabled});
  };
  for (const job of ['miners','farmers'] as const) for (const delta of [-1,1]) {
    add(() => `${job==='miners'?'금광 일꾼':'농장 일꾼'} ${delta>0?'+1':'−1'}`, () => assignWorker(w,0,job,delta), () => delta<0 ? e()[job]===0 : e().miners+e().farmers>=workerCapacity(e()));
  }
  for (const kind of ['city','market'] as const) {
    add(() => { const c=developmentCost(e(),kind); return `${kind==='city'?'도시':'시장'} Lv.${e()[kind]} → ${Math.min(3,e()[kind]+1)} · 금 ${c.gold} / 식량 ${c.food} · ${kind==='city'?25:20}초`; }, () => develop(w,0,kind), () => {const c=developmentCost(e(),kind);return !!e().construction || e()[kind]>=3 || f().gold<c.gold || f().food<c.food;});
  }
  add(() => `식량 60 수출 → 금 ${60+e().market*15} · ${Math.ceil(e().cooldown)}초 대기`, () => exportFood(w,0), () => !e().market || e().cooldown>0 || f().food<60);
  for (const kind of ['grain','relief'] as const) {
    const c=CONTRACTS[kind];
    add(() => `${c.label} · 식량 ${c.food} → 금 ${c.gold} · 보증금 ${c.deposit} / ${c.duration}초`, () => acceptContract(w,0,kind), () => !e().market || !!e().contract || f().gold<c.deposit);
  }
  add(() => '계약 납품 · 보상과 보증금 받기', () => deliverContract(w,0), () => !e().contract || f().food<CONTRACTS[e().contract!.kind].food);
  return () => {
    const state=e();
    section.querySelector('[data-economy-status]')!.textContent = `도시 Lv.${state.city} · 시장 Lv.${state.market} · 일꾼 ${state.miners+state.farmers}/${workerCapacity(state)} (금광 ${state.miners}/${f().mine*2} · 농장 ${state.farmers}/${f().farm*2})${state.construction?` · ${state.construction.kind==='city'?'도시':'시장'} 건설 ${Math.ceil(state.construction.remaining)}초`:''}`;
    section.querySelector('[data-contract-status]')!.textContent = state.contract ? `${CONTRACTS[state.contract.kind].label} · 남은 시간 ${Math.max(0,Math.ceil(state.contract.deadline-w.time))}초 · 기한 초과 시 보증금 소멸` : `계약 완료 ${state.completed} · 실패 ${state.failed} · 수출 ${state.exports}회 · 시장 Lv.1에서 교역 해금`;
    for (const c of controls) {c.button.textContent=c.label();c.button.disabled=w.over||!f().alive||c.disabled();}
  };
}

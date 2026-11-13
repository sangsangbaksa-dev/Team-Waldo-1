import type { Upgrade, War } from './war';
import { createBuildingInterior } from './interior';
import {
  BASE_BUILDINGS, BASE_WIDTH, GENERAL_CATALOG, GENERAL_ABILITIES, HQ_SLOT,
  activateGeneralAbility, assignGeneral, baseBuildingPrice, canPlaceBuilding,
  generalAbilityState, getBaseState, placeBaseBuilding, recruitGeneral,
  relocateBaseBuilding, type GeneralId, type SquadIndex,
} from './base';

export interface BaseManager {
  open(tab?:'build'|'generals'):void;
  close():void;
  refresh():void;
  isOpen():boolean;
  openBuilding(slot:number):boolean;
  back():void;
}
export function createBaseManager(parent:HTMLElement,w:War,onChange:(message:string)=>void):BaseManager {
  let tab:'build'|'generals'='build', selected:Upgrade='mine';
  let relocating=false, movingSlot:number|null=null;
  let previousFocus:HTMLElement|null=null;
  let outside:Array<{node:HTMLElement;inert:boolean}>=[];
  const root=document.createElement('section');
  root.className='base-manager';root.hidden=true;
  root.setAttribute('aria-label','왕국 기지 건설과 장군 모집');
  root.innerHTML=`
    <div class="base-backdrop" data-base-close></div>
    <div class="base-window" role="dialog" aria-modal="true" aria-labelledby="base-title">
      <header class="base-header">
        <div><span class="base-kicker">ROYAL COMMAND · STRATEGIC DEVELOPMENT</span>
          <h2 id="base-title">에메랄드 왕국 <em>기지 관리</em></h2>
          <p>내 영지에 시설을 건설하고 장군을 모집해 군단을 강화하세요.</p></div>
        <div class="base-header-tools"><div class="base-wallet" id="base-wallet"></div>
          <button type="button" class="base-close" data-base-close aria-label="기지 화면 닫기">✕</button></div>
      </header>
      <nav class="base-tabs" aria-label="기지 기능">
        <button type="button" data-base-tab="build">▦ 기지 건설</button>
        <button type="button" data-base-tab="generals">♛ 장군 모집 · 배치</button>
      </nav>
      <div class="base-section base-build-section" data-base-panel="build">
        <div class="base-courtyard">
          <div class="base-section-title"><span>BASE DISTRICT · 5 × 5</span><b>내 왕국의 건설 부지</b></div>
          <div class="base-grid" role="grid" aria-label="25칸 영지 설계도">
            ${Array.from({length:BASE_WIDTH*BASE_WIDTH},(_,slot)=>`<button type="button" class="base-cell" role="gridcell" data-base-slot="${slot}" aria-label="${slot===HQ_SLOT?'왕궁':'빈 건설 구획 '+(slot+1)}"></button>`).join('')}
          </div>
          <div class="base-grid-legend"><span><i class="base-dot built"></i> 건설된 시설</span><span><i class="base-dot free"></i> 비어 있는 부지</span><span><i class="base-dot hq"></i> 왕궁</span></div>
          <p class="base-help">빈 칸을 누르면 건설하고, <strong>이미 건설된 시설을 누르면 내부로 입장</strong>합니다. 시설을 옮기려면 오른쪽의 <b>배치 변경</b>을 선택하세요.</p>
        </div>
        <div class="base-build-list">
          <div class="base-section-title"><span>CONSTRUCTION OFFICE</span><b>건설 가능한 시설</b></div>
          <div class="base-build-cards">
            ${BASE_BUILDINGS.map(b=>`<button type="button" data-base-kind="${b.kind}" class="base-build-card">
              <span class="base-building-glyph">${b.glyph}</span>
              <span class="base-building-copy"><b>${b.name}</b><small>${b.effect}</small><em data-base-price="${b.kind}"></em></span>
              <strong data-base-level="${b.kind}"></strong>
            </button>`).join('')}
          </div>
          <div class="base-selection"><span>현재 선택</span><strong id="base-selection"></strong>
            <p id="base-selection-hint"></p>
            <button type="button" data-base-relocate aria-pressed="false">↔ 배치 변경 · 건물 이전</button>
          </div>
        </div>
      </div>
      <div class="base-section base-generals-section" data-base-panel="generals" hidden>
        <div class="base-generals-heading"><span>HIGH COMMAND · OFFICER ACADEMY</span>
          <h3>전쟁의 판도를 바꿀 지휘관</h3><p>장군을 금·식량으로 영입하세요. 전투 장군은 부대 ①②③ 중 하나를 지휘하며, 병참총감은 모집만 해도 모든 자원 생산을 늘립니다.</p></div>
        <div class="base-general-grid">
          ${GENERAL_CATALOG.map(g=>`<article class="base-general-card" data-general-card="${g.id}">
            <div class="base-general-medallion">${g.glyph}</div>
            <span class="base-general-title">${g.title}</span><h3>${g.name}</h3>
            <div class="base-general-bonus">${g.description}</div>
            <div class="base-general-bottom"><span>금 ${g.gold.toLocaleString('ko-KR')} · 식량 ${g.food.toLocaleString('ko-KR')}</span>
              <button type="button" data-base-recruit="${g.id}" class="base-recruit">장군 모집</button></div>
            <label>지휘 부대
              <select data-base-assignment="${g.id}" aria-label="${g.name} 배치">
                <option value="">대기</option>
                <option value="0">① 주력군</option><option value="1">② 기동대</option><option value="2">③ 수비대</option>
              </select>
            </label>
            <div class="base-general-ability">
              <strong>${GENERAL_ABILITIES[g.id].name}</strong>
              <small>${GENERAL_ABILITIES[g.id].effect}</small>
              <button type="button" data-general-ability="${g.id}">전술 발동</button>
              <output data-general-ability-state="${g.id}" aria-live="off">모집 후 사용 가능</output>
            </div>
          </article>`).join('')}
        </div>
        <p class="base-help">한 부대에는 장군 1명만 배치할 수 있습니다. 장군을 다른 부대에 배치하면 기존 장군은 대기로 돌아갑니다. 장군의 전투 효과는 해당 부대에만 적용됩니다.</p>
      </div>
      <footer class="base-footer"><span id="base-feedback" role="status">건물과 장군은 자동 저장됩니다.</span><span>단축키 <kbd>K</kbd> · 닫기 <kbd>Esc</kbd></span></footer>
    </div>`;
  parent.append(root);
  const one=<T extends HTMLElement=HTMLElement>(selector:string)=>root.querySelector<T>(selector)!;
  const notify=(message:string)=>{one('#base-feedback').textContent=message;};
  const buildingByKind=(kind:Upgrade)=>BASE_BUILDINGS.find(b=>b.kind===kind)!;
  const interior=createBuildingInterior(one('.base-window'),w,onChange,()=>{interior.leave();refresh();one<HTMLButtonElement>('[data-base-slot="'+lastInteriorSlot+'"]')?.focus({preventScroll:true});});
  let lastInteriorSlot=0;
  const refresh=()=>{
    if(root.hidden)return;
    const f=w.factions[0],base=getBaseState(w);
    one('#base-wallet').textContent='◆ 금 '+Math.floor(f.gold).toLocaleString('ko-KR')+'    🌾 식량 '+Math.floor(f.food).toLocaleString('ko-KR');
    for(const button of root.querySelectorAll<HTMLButtonElement>('[data-base-slot]')){
      const slot=Number(button.dataset.baseSlot),occupied=base.structures.find(s=>s.slot===slot);
      const palace=slot===HQ_SLOT;
      const def=occupied&&buildingByKind(occupied.kind);
      const label=palace?'왕궁':def?.name??'빈 부지';
      const glyph=palace?'♛':def?.glyph??'+';
      const markup='<span class="base-cell-glyph">'+glyph+'</span><span class="base-cell-label">'+label+'</span>';
      if(button.innerHTML!==markup)button.innerHTML=markup;
      button.classList.toggle('palace',palace);
      button.classList.toggle('occupied',Boolean(occupied));
      button.classList.toggle('relocating-from',relocating&&movingSlot===slot);
      button.classList.toggle('available',!palace&&!occupied&&(relocating?movingSlot!==null:canPlaceBuilding(w,selected,slot)));
      button.title=palace?'왕궁 · 건설할 수 없습니다.':relocating
        ? occupied?def!.name+' 이전 출발지 선택':movingSlot!==null?'이 구획으로 건물 이전':'먼저 옮길 건물을 선택하세요'
        :def?def.name+' 내부 입장':'클릭하여 '+buildingByKind(selected).name+' 건설';
      button.setAttribute('aria-label',button.title);
    }
    for(const b of BASE_BUILDINGS){
      const card=one<HTMLButtonElement>('[data-base-kind="'+b.kind+'"]'),cost=baseBuildingPrice(w,b.kind);
      card.classList.toggle('chosen',selected===b.kind);
      card.setAttribute('aria-pressed',String(selected===b.kind));
      card.classList.toggle('maxed',f[b.kind]>=4);
      one('[data-base-level="'+b.kind+'"]').textContent='Lv.'+f[b.kind]+'/4';
      one('[data-base-price="'+b.kind+'"]').textContent=f[b.kind]>=4?'최대 건설 완료':'건설비 · 금 '+cost.gold+' / 식량 '+cost.food;
    }
    one('#base-selection').textContent=relocating?'건물 배치 변경':buildingByKind(selected).name+' · Lv.'+f[selected];
    one('#base-selection-hint').textContent=relocating
      ? movingSlot===null?'이전할 건물을 먼저 선택하세요. 건물 내부로 들어가지는 않습니다.':'선택한 건물을 옮길 빈 부지를 누르세요. 이동 비용은 없습니다.'
      :f[selected]>=4?'최고 단계에 도달했습니다. 다른 시설을 선택하세요.':'선택한 건물을 빈 칸에 배치하세요. 자원이 모자라면 건설할 수 없습니다.';
    const relocate=one<HTMLButtonElement>('[data-base-relocate]');
    relocate.classList.toggle('chosen',relocating);
    relocate.setAttribute('aria-pressed',String(relocating));
    relocate.textContent=relocating?'✕ 배치 변경 취소':'↔ 배치 변경 · 건물 이전';
    for(const g of GENERAL_CATALOG){
      const card=one('[data-general-card="'+g.id+'"]'),hired=base.generals.find(general=>general.id===g.id);
      const button=one<HTMLButtonElement>('[data-base-recruit="'+g.id+'"]');
      const select=one<HTMLSelectElement>('[data-base-assignment="'+g.id+'"]');
      card.classList.toggle('hired',Boolean(hired));
      button.disabled=Boolean(hired)||w.over||!f.alive||f.gold<g.gold||f.food<g.food;
      button.textContent=hired?'모집 완료':'장군 모집';
      select.disabled=!hired||g.specialty==='income'||w.over||!f.alive;
      select.value=hired?.squad===null||hired?.squad===undefined?'':String(hired.squad);
      if(g.specialty==='income')select.title='병참총감의 경제 보너스는 배치 없이 적용됩니다.';
      const skill=generalAbilityState(w,g.id);
      const abilityButton=one<HTMLButtonElement>('[data-general-ability="'+g.id+'"]');
      abilityButton.disabled=!skill.ready;
      abilityButton.textContent=skill.activeFor>0?'전술 발동 중':skill.cooldownFor>0?'재충전 중':'전술 발동';
      card.classList.toggle('power-active',skill.activeFor>0);
      one('[data-general-ability-state="'+g.id+'"]').textContent=!hired?'모집 후 사용 가능':
        skill.activeFor>0?'효과 적용 중 · '+Math.ceil(skill.activeFor)+'초 남음':
        skill.cooldownFor>0?'재사용까지 '+Math.ceil(skill.cooldownFor)+'초':
        g.specialty!=='income'&&hired.squad===null?'부대 배치 후 발동 가능':'발동 준비 완료';
    }
    for(const button of root.querySelectorAll<HTMLButtonElement>('[data-base-tab]')){
      const active=button.dataset.baseTab===tab;button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    }
    one('.base-tabs').hidden=interior.isInside();
    for(const panel of root.querySelectorAll<HTMLElement>('[data-base-panel]'))panel.hidden=interior.isInside()||panel.dataset.basePanel!==tab;
    interior.refresh();
  };
  const close=()=>{
    if(root.hidden)return;
    interior.leave();relocating=false;movingSlot=null;root.hidden=true;
    outside.forEach(({node,inert})=>{node.inert=inert;});outside=[];
    if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});
    previousFocus=null;
  };
  const back=()=>{if(interior.isInside()){interior.leave();refresh();one<HTMLButtonElement>('[data-base-slot="'+lastInteriorSlot+'"]')?.focus({preventScroll:true});}else close();};
  const open=(next:'build'|'generals'='build')=>{
    if(w.over||!w.factions[0].alive)return;
    if(root.hidden){
      previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
      outside=[...parent.children].filter((node):node is HTMLElement=>node instanceof HTMLElement&&node!==root)
        .map(node=>({node,inert:node.inert}));
      outside.forEach(({node})=>{node.inert=true;});
    }
    tab=next;relocating=false;movingSlot=null;interior.leave();root.hidden=false;refresh();
    one<HTMLButtonElement>('button[data-base-close]').focus({preventScroll:true});
  };
  root.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();back();}
    if(event.key==='Tab'){
      const focusable=[...root.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex="0"]')]
        .filter(node=>!node.closest('[hidden]'));
      const first=focusable[0],last=focusable.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
    // Do not send gameplay hotkeys to the 3D battle while navigating the base.
    event.stopPropagation();
  });
  root.addEventListener('click',event=>{
    const source=event.target as Element;
    if(source.closest('[data-base-close]')){close();return;}
    const button=source.closest<HTMLButtonElement>('button');
    if(!button)return;
    if(button.dataset.baseTab==='build'||button.dataset.baseTab==='generals'){
      tab=button.dataset.baseTab;relocating=false;movingSlot=null;refresh();return;
    }
    if(button.dataset.baseKind){
      selected=button.dataset.baseKind as Upgrade;relocating=false;movingSlot=null;refresh();return;
    }
    if(button.hasAttribute('data-base-relocate')){
      relocating=!relocating;movingSlot=null;refresh();return;
    }
    if(button.dataset.baseSlot!==undefined){
      const slot=Number(button.dataset.baseSlot),def=buildingByKind(selected);
      if(slot===HQ_SLOT){notify('왕궁은 이미 건설되어 있습니다.');return;}
      const occupied=getBaseState(w).structures.find(s=>s.slot===slot);
      if(relocating){
        if(occupied){movingSlot=movingSlot===slot?null:slot;refresh();return;}
        if(movingSlot===null){notify('먼저 이전할 건물을 선택하세요.');return;}
        if(relocateBaseBuilding(w,movingSlot,slot)){
          movingSlot=null;relocating=false;notify('시설 이전 완료 · 건물 효과 유지');
          onChange('기지 건물 이전 완료');refresh();
        }else notify('이전할 수 없는 부지입니다.');
        return;
      }
      if(occupied){lastInteriorSlot=slot;interior.enter(slot);refresh();return;}
      if(placeBaseBuilding(w,selected,slot)){notify(def.name+' 건설 완료 · 생산과 방어 효과 적용');onChange(def.name+' 건설 완료');refresh();}
      else notify('건설할 수 없습니다. 자원과 건설 레벨(최대 4)을 확인하세요.');
      return;
    }
    if(button.dataset.generalAbility){
      const id=button.dataset.generalAbility as GeneralId;
      if(activateGeneralAbility(w,id)){
        notify(GENERAL_ABILITIES[id].name+' 발동 · 전장에 즉시 적용');
        onChange('장군 전술 발동');refresh();
      }else notify('전술을 사용할 수 없습니다. 장군 배치와 재사용 대기시간을 확인하세요.');
      return;
    }
    if(button.dataset.baseRecruit){
      const id=button.dataset.baseRecruit as GeneralId;
      const definition=GENERAL_CATALOG.find(g=>g.id===id)!;
      if(recruitGeneral(w,id)){notify(definition.name+' 장군을 영입했습니다.');onChange(definition.name+' 장군 모집 완료');refresh();}
      else notify('모집할 수 없습니다. 보유 자원과 중복 모집 여부를 확인하세요.');
    }
  });
  root.addEventListener('change',event=>{
    const select=(event.target as Element).closest<HTMLSelectElement>('[data-base-assignment]');
    if(!select)return;
    const id=select.dataset.baseAssignment as GeneralId;
    const squad=select.value===''?null:Number(select.value) as SquadIndex;
    if(assignGeneral(w,id,squad)){
      notify(squad===null?'장군을 대기로 이동했습니다.':(squad+1)+'번 부대에 장군을 배치했습니다.');
      onChange('장군 배치 변경');refresh();
    }
  });
  const openBuilding=(slot:number):boolean=>{
    if(!getBaseState(w).structures.some(s=>s.slot===slot)||w.over||!w.factions[0].alive)return false;
    open('build');lastInteriorSlot=slot;
    const entered=interior.enter(slot);refresh();return entered;
  };
  return {open,close,refresh,back,openBuilding,isOpen:()=>!root.hidden};
}

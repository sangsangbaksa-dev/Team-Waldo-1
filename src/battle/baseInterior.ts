import { INTERIOR_KINDS,INTERIOR_EFFECTS,FACILITY_TYPES,facilitiesFor,buildInterior,type InteriorKind } from './facilities';
import type { War } from './war';
function tileArt(kind:string):string{
 const tower=kind==='waterworks'||kind==='powerplant'||kind==='granary';
 const roof=kind==='school'||kind==='university'||kind==='academy';
 const body=tower?'<ellipse cx="50" cy="24" rx="21" ry="9" fill="#a7b1a6"/><path d="M29 24v33c0 13 42 13 42 0V24" fill="#667f79" stroke="#b3b8a4"/><ellipse cx="50" cy="24" rx="21" ry="9" fill="#bdc4b7"/>':'<path d="M17 34l35-15 33 16v35L50 86 17 68z" fill="#677a73" stroke="#b7c1af"/><path d="M50 49v37l35-16V35z" fill="#344f4b"/>';
 const top=roof?'<path d="M12 33l40-25 38 26-39 19z" fill="#9d9c83" stroke="#d1c7a9"/>':!tower?'<path d="M17 34l35-15 33 16-35 14z" fill="#afbaa9"/>':'';
 const detail=kind==='hospital'||kind==='clinic'?'<path d="M38 52v9h-8v8h8v9h8v-9h8v-8h-8v-9z" fill="#d7e3d8"/>':kind==='workshop'||kind==='powerplant'?'<path d="M65 20V6h10v23" fill="#84938b" stroke="#c4c7b7"/><path d="M29 57h10v14H29z" fill="#c0a878"/>':'<path d="M27 48v11m13-6v11m19-4v12m13-18v12" stroke="#dbd2aa" stroke-width="4"/>';
 return `<svg viewBox="0 0 100 100" aria-hidden="true">${body}${top}${detail}</svg>`;
}
export function openBaseInterior(w:War,owner:number,execute?:(kind:InteriorKind,baseId:number,col:number,row:number)=>void):void{
 const dialog=document.createElement('dialog');dialog.className='base-dialog';
 dialog.innerHTML=`<header><div><span class="kicker">BASE DEVELOPMENT / INTERNAL DISTRICTS</span><h1>기지 내부 관리</h1></div><button class="button secondary" data-close>전장으로 복귀</button></header><div class="base-layout"><aside><label>관리할 기지<select data-base aria-label="관리할 기지"></select></label><p class="panel-note">시설을 선택한 뒤 빈 구획을 클릭하세요. 전장과 내부 시설을 합해 본부 포함 최대 30개입니다. 내부 관리 중에도 전투가 진행됩니다.</p><p data-resources></p><div class="base-catalog"></div></aside><section><div class="base-plan-heading"><h2>시설 배치도</h2><span data-count></span></div><p data-selection role="status">건설할 시설을 선택하세요.</p><div class="base-grid" role="group" aria-label="기지 내부 건설 구획"></div><div class="base-legend">중앙 지휘부 · 북측 보급로 · 남측 출입구</div></section></div>`;
 document.body.append(dialog);
 const select=dialog.querySelector<HTMLSelectElement>('[data-base]')!;
 select.append(new Option('중앙 본부','0'),...facilitiesFor(w,owner).filter(b=>b.kind==='barracks'&&!b.interior&&b.remaining===0).map(b=>new Option(`전진 병영 #${b.id}`,String(b.id))));
 let kind:InteriorKind|null=null;
 const status=dialog.querySelector<HTMLElement>('[data-selection]')!;
 const catalog=dialog.querySelector('.base-catalog')!;
 const choices=INTERIOR_KINDS.map(key=>{const d=FACILITY_TYPES[key],button=document.createElement('button');button.dataset.interior=key;button.className='base-choice';button.innerHTML=`<b>${d.label}</b><small>${INTERIOR_EFFECTS[key]}</small><span>금 ${d.gold} · 식량 ${d.food} · ${d.seconds}초</span>`;button.onclick=()=>{kind=key;choices.forEach(c=>c.button.setAttribute('aria-pressed',String(c.key===key)));status.textContent=`${d.label} 선택됨 · 배치할 빈 구획을 클릭하세요.`;};catalog.append(button);return{key,button};});
 const cells=Array.from({length:30},(_,index)=>{const button=document.createElement('button');button.className='base-cell';button.setAttribute('aria-label',`${Math.floor(index/6)+1}행 ${index%6+1}열 빈 구획`);button.onclick=()=>{
  if(!kind){status.textContent='왼쪽에서 건설할 시설을 먼저 선택하세요.';return;}
  if(execute){execute(kind,Number(select.value),index%6,Math.floor(index/6));status.textContent='건설 명령 전송 · 상태 갱신을 기다리는 중';}
  else{const ok=buildInterior(w,owner,kind,Number(select.value),index%6,Math.floor(index/6));status.textContent=ok?`${FACILITY_TYPES[kind].label} 건설을 시작했습니다.`:'자원, 시설 한도, 기지 상태와 구획을 확인하세요.';}
  refresh();
 };dialog.querySelector('.base-grid')!.append(button);return button;});
 function refresh(){
  const f=w.factions[owner],list=facilitiesFor(w,owner),base=Number(select.value);
  dialog.querySelector('[data-resources]')!.textContent=`금 ${Math.floor(f.gold)} · 식량 ${Math.floor(f.food)}`;
  dialog.querySelector('[data-count]')!.textContent=`전체 시설 ${list.length+1}/30`;
  for(const {key,button} of choices){const d=FACILITY_TYPES[key];button.disabled=w.over||!f.alive||list.length>=29||f.gold<d.gold||f.food<d.food;}
  cells.forEach((button,index)=>{const building=list.find(b=>b.interior?.baseId===base&&b.interior.col===index%6&&b.interior.row===Math.floor(index/6));
   button.classList.toggle('occupied',!!building);button.disabled=!!building||w.over||!f.alive;button.dataset.kind=building?.kind??'empty';
   if(building)button.innerHTML=tileArt(building.kind)+`<span>${FACILITY_TYPES[building.kind].label}<br>${building.remaining>0?`${Math.ceil(building.remaining)}초`:'가동 중'}</span>`;else button.textContent=`${Math.floor(index/6)+1}—${index%6+1}\n빈 구획`;
   button.setAttribute('aria-label',`${Math.floor(index/6)+1}행 ${index%6+1}열 ${building?FACILITY_TYPES[building.kind].label:'빈 구획'}`);
  });
 }
 select.onchange=refresh;
 dialog.querySelector<HTMLButtonElement>('[data-close]')!.onclick=()=>dialog.close();
 const timer=setInterval(()=>{if(!dialog.isConnected){clearInterval(timer);return;}refresh();},250);
 dialog.addEventListener('close',()=>{clearInterval(timer);dialog.remove();});refresh();dialog.showModal();
}

import { openBaseInterior } from './baseInterior';
import { FACILITY_TYPES, facilitiesFor, autoBuildFacility,buildFacility, type FacilityKind } from './facilities';
import { OUTPOST_NAMES, type War } from './war';
export function mountFacilities(parent:HTMLElement,w:War,perform:(action:()=>boolean,message:string)=>void,choose?:(kind:FacilityKind,site?:{x:number;z:number})=>void,finishPlacement?:()=>void):()=>void{
 const section=document.createElement('section');section.className='economy-expansion';
 section.innerHTML='<div class="section-heading"><h2>시설 건설</h2><span data-facility-count></span></div><p class="panel-note">본부 포함 최대 30개. 점령 거점에도 전진 기지를 세울 수 있습니다. 건설 중에도 공격받습니다.</p><label class="panel-note">건설 지역 <select aria-label="시설 건설 지역"><option value="hq">본부 주변</option></select></label><button class="button secondary" data-open-base>기지 내부 관리 · 병원/학교/산업 시설</button><p class="panel-note">건설 버튼 → 전장 위치 클릭 · Esc로 취소</p><div class="construction-coordinates"><label>X <input data-build-x type="number" aria-label="시설 X 좌표"></label><label>Z <input data-build-z type="number" aria-label="시설 Z 좌표"></label><button data-build-exact>입력한 좌표에 건설</button></div><div class="action-list"></div><p class="panel-note" data-facility-summary></p>';
 parent.prepend(section);
 section.querySelector<HTMLButtonElement>('[data-open-base]')!.onclick=()=>openBaseInterior(w,0);
 const site=section.querySelector('select')!;
 let selected:FacilityKind='mine';
 const inputX=section.querySelector<HTMLInputElement>('[data-build-x]')!,inputZ=section.querySelector<HTMLInputElement>('[data-build-z]')!;inputX.value=String(w.factions[0].x);inputZ.value=String(w.factions[0].z+55);
 section.querySelector<HTMLButtonElement>('[data-build-exact]')!.onclick=()=>{perform(()=>buildFacility(w,0,selected,Number(inputX.value),Number(inputZ.value)),'지정한 좌표에 건설을 시작했습니다.');finishPlacement?.();};
 const buttons=(['mine','farm','city','barracks','market','tower'] as FacilityKind[]).map(kind=>{
  const d=FACILITY_TYPES[kind],button=document.createElement('button');button.className='war-action economy-control';button.dataset.facility=kind;
  button.textContent=`${d.label} · 금 ${d.gold} / 식량 ${d.food} · ${d.seconds}초${d.incomeGold?` · 금 +${d.incomeGold}/초`:''}${d.incomeFood?` · 식량 +${d.incomeFood}/초`:''}${kind==='tower'?' · 주변 적 자동 공격':''}${kind==='barracks'?' · 전진 건설 범위 확장':''}`;
  button.onclick=()=>{selected=kind;if(choose)choose(kind,site.value==='hq'?undefined:w.outposts[Number(site.value)]);else perform(()=>autoBuildFacility(w,0,kind,site.value==='hq'?undefined:w.outposts[Number(site.value)]),`${d.label} 건설을 시작했습니다.`);};
  section.querySelector('.action-list')!.append(button);return {kind,button};
 });
 let owned='';
 return ()=>{
  const list=facilitiesFor(w,0), posts=w.outposts.filter(p=>p.owner===0),signature=posts.map(p=>p.id).join(',');
  if(signature!==owned){const old=site.value;site.replaceChildren(new Option('본부 주변','hq'),...posts.map(p=>new Option(OUTPOST_NAMES[p.id],String(p.id))));site.value=[...site.options].some(o=>o.value===old)?old:'hq';owned=signature;}
  section.querySelector('[data-facility-count]')!.textContent=`${list.length+1} / 30`;
  section.querySelector('[data-facility-summary]')!.textContent=list.length?list.map(b=>`${FACILITY_TYPES[b.kind].label}${b.remaining>0?` (${Math.ceil(b.remaining)}초)`:' ✓'}`).join(' · '):'첫 시설을 건설해 영토를 발전시키세요.';
  buttons.forEach(({kind,button})=>{const d=FACILITY_TYPES[kind],f=w.factions[0];button.disabled=w.over||!f.alive||list.length>=29||f.gold<d.gold||f.food<d.food;});
 };
}

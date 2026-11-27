import {createCityActivities} from './city-activities-domain.mjs';
function mountCityActivities(createCityActivities){
 const map=document.querySelector("#map .map-panel"),hud=document.getElementById("hud");
 if(!map||!hud||document.getElementById("harbor-city-activities"))return;
 const el=(tag,txt)=>{const n=document.createElement(tag);if(txt)n.textContent=txt;return n;};
 const details=el("details");details.id="harbor-city-activities";details.style.cssText="border-top:1px solid var(--line,#fff3);padding-top:10px;margin-top:12px;font-size:13px";
 const title=el("summary","도시 생활 · 도보 탐방 / 정차 / 운송");title.style.cursor="pointer";
 const help=el("p","활동은 선택 사항입니다. 운송 점수는 별도 로컬 기록이며 게임 현금과 무관합니다.");help.style.cssText="color:var(--muted,#bfc9c5);margin:8px 0;line-height:1.5";
 const choice=el("select");choice.setAttribute("aria-label","도시 생활 활동");choice.style.cssText="max-width:100%;width:100%;padding:8px;background:#15242b;color:#fff6e8;border:1px solid #fff3;border-radius:4px";
 const buttons=el("div");buttons.style.cssText="display:flex;gap:8px;margin:8px 0";
 const begin=el("button","활동 선택"),cancel=el("button","활동 종료");for(const b of [begin,cancel]){b.type="button";b.className="quiet";}
 begin.disabled=true;cancel.disabled=true;buttons.append(begin,cancel);
 const stats=el("p");stats.style.cssText="white-space:pre-line;line-height:1.5;margin:6px 0";
 details.append(title,help,choice,buttons,stats);map.append(details);
 const panel=el("aside");panel.setAttribute("aria-label","도시 생활 활동 안내");panel.id="city-activity-hud";
 panel.className="panel";panel.hidden=true;panel.style.cssText="position:absolute;right:var(--edge,16px);bottom:calc(var(--edge,16px) + 7.5rem);width:min(240px,42vw);padding:8px 10px;pointer-events:none;z-index:2;font:12px/1.45 system-ui;color:#fff6e8";
 const style=el("style");style.textContent="@media(max-width:600px),(pointer:coarse){#city-activity-hud{bottom:auto!important;top:calc(var(--edge,16px) + 110px);font-size:11px!important;width:min(185px,43vw)!important}}";document.head.append(style);
 const label=el("strong"),body=el("p"),status=el("p");body.style.whiteSpace="pre-line";status.style.cssText="margin-top:4px;color:#fac27d";panel.append(label,body,status);hud.append(panel);
 const key="harbor.city-activities.v1";let game,frame,last=performance.now(),version=null,hideAt=0,notice="",lastScreen="";
 const save=()=>{if(!game)return;try{localStorage.setItem(key,JSON.stringify(game.record));}catch{}};
 const direction=(from,to)=>["북","북동","동","남동","남","남서","서","북서"][(Math.round(Math.atan2(to[0]-from.x,-(to[1]-from.z))*4/Math.PI)+8)%8];
 const set=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
 function render(){
   if(!game)return;
   const v=game.view(frame),a=v.active,r=v.record;
   if(notice!==v.notice){notice=v.notice;hideAt=performance.now()+4500;}
   panel.hidden=!a&&performance.now()>=hideAt;
   set(label,a?.name||"도시 생활");
   if(a){
     const p=frame?.state?.isDriving?frame.state.vehicle?.position:frame?.position,target=a.target;
     const lines=[target.name+(a.distance===null?"":" · "+Math.round(a.distance)+"m")+(p?" · "+direction(p,target.point):"")];
     if(a.type==="trail")lines.push(a.phase==="approach"?"걸어서 시작점에 도착":`경유지 ${a.progress}/${a.total} · ${Math.ceil(a.remaining)}초`);
     else lines.push(a.phase==="approach"?"차량으로 정차점에 접근":a.phase==="deliver"?"운송 중 · "+Math.ceil(a.remaining)+"초":"정차 도전 · "+Math.ceil(a.remaining)+"초","도로 방향에 맞춰 2.5초 정차"+(a.hold>0?" · "+a.hold.toFixed(1)+"초":""));
     set(body,lines.join("\n"));
   }else set(body,"");
   set(status,notice);
   const lines=[`도보 코스 ${Object.keys(r.trailBest).length}/${game.trails.length} · 정차 ${Object.keys(r.stopBest).length}/${game.stops.length}`,`운송 완료 ${r.deliveryCount}회 · 서비스 점수 ${r.servicePoints}`];
   for(const [items,record] of [[game.trails,r.trailBest],[game.stops,r.stopBest],[game.jobs,r.deliveryBest]])for(const i of items)if(record[i.id])lines.push(i.name+" · "+record[i.id].toFixed(1)+"초");
   set(stats,lines.join("\n"));cancel.disabled=!a;
 }
 begin.addEventListener("click",()=>{if(game){const [type,id]=choice.value.split("|");game.select(type,id);render();}});
 cancel.addEventListener("click",()=>{game?.cancel();render();});
 document.getElementById("reset")?.addEventListener("click",()=>{game?.cancel("새 세션 시작");version=null;frame=null;save();render();});
 window.addEventListener("pagehide",save);document.addEventListener("visibilitychange",()=>{if(document.hidden)save();});
 fetch(new URL("world/harbor_front.json",document.baseURI)).then(r=>{if(!r.ok)throw Error("world");return r.json();}).then(layout=>{
   let saved={};try{saved=JSON.parse(localStorage.getItem(key)||"{}")||{};}catch{}
   game=createCityActivities(layout,saved);
   for(const [type,name,items] of [["trail","도보 탐방",game.trails],["stop","정차 훈련",game.stops],["delivery","민간 운송",game.jobs]]){
     const group=el("optgroup");group.label=name;
     for(const i of items){const o=el("option",i.name+(type==="trail"?" · "+Math.round(i.meters)+"m":type==="delivery"?" · "+i.points+"점":""));o.value=type+"|"+i.id;group.append(o);}
     choice.append(group);
   }
   begin.disabled=false;render();
   setInterval(()=>{
     const now=performance.now(),dt=(now-last)/1000;last=now;
     const bridge=globalThis.harborView,screen=bridge?.screen?.();
     if(screen!=="play"||document.hidden){lastScreen=screen;return;}
     try{
       const next=bridge.frameVersion();if(next===version)return;version=next;
       frame=JSON.parse(bridge.frame());
       if(game.update(frame,lastScreen==="play"?dt:0))save();
       lastScreen=screen;render();
     }catch{}
   },100);
 }).catch(()=>{help.textContent="도시 활동 데이터를 불러오지 못했습니다.";});
}
mountCityActivities(createCityActivities);

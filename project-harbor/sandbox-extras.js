/* Project Harbor: optional sandbox activities, using the read-only browser frame bridge. */
(()=>{'use strict';
const courses=[{"id":"harbor-loop","name":"항만 순환 코스","points":[[40,33],[40,71],[-39,71],[-39,33],[40,33]]},{"id":"civic-run","name":"도심 대로 코스","points":[[-155,-242],[-155,-345],[-70,-345],[-70,-440],[22,-440],[22,-530]]},{"id":"cinder-run","name":"사막 패스 코스","points":[[-595,-440],[-599,-381],[-591,-327],[-565,-275],[-530,-247],[-460,-242]]}];
function distance(p,q){return Math.hypot(p.x-q[0],p.z-q[1]);}
function advance(run,course,position,driving,alive,dt){
 if(!alive||(!driving&&run.started))return {...run,cancelled:true};
 const next={...run};
 if(!driving)return next;
 if(!next.started){if(distance(position,course.points[0])<=12){next.started=true;next.index=1;}return next;}
 next.seconds+=Math.max(0,Math.min(dt,.5));
 if(distance(position,course.points[next.index])<=12){next.index++;if(next.index===course.points.length)next.finished=true;}
 return next;
}
function bearing(p,q){return ["북","북동","동","남동","남","남서","서","북서"][Math.round((Math.atan2(q[0]-p.x,-(q[1]-p.z))*180/Math.PI+360)/45)%8];}
function mount(){
 const hud=document.getElementById("hud"), map=document.getElementById("map"), atlas=document.getElementById("atlas");
 if(!hud||!map||!atlas||document.getElementById("harbor-free-roam"))return;
 const key="harbor-exploration-v1";
 let saved={visited:[],records:{},topSpeed:0};
 try{const data=JSON.parse(localStorage.getItem(key)||"null");if(data&&Array.isArray(data.visited)&&data.records&&typeof data.records==="object"){saved={visited:data.visited.filter(x=>typeof x==="string"),records:Object.fromEntries(Object.entries(data.records).filter(([k,v])=>courses.some(c=>c.id===k)&&Number.isFinite(v)&&v>0)),topSpeed:Number.isFinite(data.topSpeed)?Math.max(0,data.topSpeed):0};}}catch{}
 const save=()=>{try{localStorage.setItem(key,JSON.stringify(saved));}catch{}};
 const element=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt)e.textContent=txt;return e;};
 const style=element("style");style.textContent=`
 #harbor-free-roam{position:absolute;top:calc(var(--edge,16px) + 150px);left:var(--edge,16px);max-width:min(245px,45vw);padding:8px 11px;font-size:12px;line-height:1.5;color:#e9e5dc;pointer-events:none}
 #harbor-free-roam strong{color:#fac27d;display:block;font-weight:650}
 #harbor-free-roam p{margin:2px 0;overflow-wrap:anywhere}
 #harbor-discovery{border-top:1px solid #ffffff2b;margin-top:12px;padding-top:10px;font-size:13px}
 #harbor-discovery summary{cursor:pointer;font-weight:650;color:#fac27d;padding:5px 0}
 #harbor-discovery .harbor-extra-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:8px 0}
 #harbor-discovery select{max-width:100%;min-height:34px;background:#15242b;color:#fff6e8;border:1px solid #ffffff35;border-radius:4px;padding:5px}
 #harbor-discovery .quiet{font-size:12px;padding:6px 9px}
 #harbor-discovery p{line-height:1.5;color:#bfc9c5;margin:5px 0}
 @media(max-width:600px){#harbor-free-roam{top:calc(var(--edge,16px) + 110px);font-size:11px;max-width:44vw;padding:5px 8px}}
 `;
 document.head.append(style);
 const panel=element("div","panel");panel.id="harbor-free-roam";panel.hidden=true;
 const heading=element("strong"), progress=element("p"), nav=element("p");panel.append(heading,progress,nav);hud.append(panel);
 const details=element("details");details.id="harbor-discovery";details.append(element("summary","","자유 탐험 · 주행 기록"));
 const description=element("p","","명소를 방문하면 탐험 기록이 남습니다. 주행 코스는 선택 사항이며 차량으로 시작점에 접근하면 기록이 시작됩니다.");
 const summary=element("p"), status=element("p");
 const row=element("div","harbor-extra-row"), select=element("select");select.setAttribute("aria-label","탐험 목적지");
 const defaultOption=element("option","","목적지 없음");defaultOption.value="";select.append(defaultOption);
 const routeRow=element("div","harbor-extra-row"), routeSelect=element("select");routeSelect.setAttribute("aria-label","주행 코스");
 for(const c of courses){const o=element("option","",c.name);o.value=c.id;routeSelect.append(o);}
 const choose=element("button","quiet","코스 선택");choose.type="button";
 const cancel=element("button","quiet","코스 취소");cancel.type="button";
 const clear=element("button","quiet","목적지 해제");clear.type="button";
 row.append(select,clear);routeRow.append(routeSelect,choose,cancel);details.append(description,summary,row,routeRow,status);
 (map.querySelector(".map-panel")||map).append(details);
 let landmarks=[], target=null, course=null, run=null, lastVersion=-1,lastTime=performance.now(),lastPos=null,lastSave=0,lastNotice="",noticeUntil=0;
 const format=t=>`${Math.floor(t/60)}:${(t%60).toFixed(1).padStart(4,"0")}`;
 const announce=(s)=>{lastNotice=s;noticeUntil=performance.now()+4500;};
 function refresh(){
  const visited=new Set(saved.visited);
  summary.textContent=`명소 ${landmarks.filter(l=>visited.has(l.id)).length}/${landmarks.length} · 최고 속도 ${Math.round(saved.topSpeed)} km/h`;
  status.textContent=courses.map(c=>`${c.name} ${saved.records[c.id]?format(saved.records[c.id]):"기록 없음"}`).join(" / ");
  for(const option of select.options){if(!option.value)continue;const l=landmarks.find(x=>x.id===option.value);if(l)option.textContent=(visited.has(l.id)?"✓ ":"")+l.name;}
 }
 select.addEventListener("change",()=>{const l=landmarks.find(x=>x.id===select.value);target=l?{name:l.name,point:[l.position[0],l.position[2]]}:null;});
 clear.addEventListener("click",()=>{target=null;select.value="";});
 choose.addEventListener("click",()=>{course=courses.find(c=>c.id===routeSelect.value)||null;run=course?{started:false,index:0,seconds:0}:null;if(course)announce(course.name+" · 시작점으로 이동");});
 cancel.addEventListener("click",()=>{course=null;run=null;announce("주행 코스 취소");});
 document.getElementById("reset")?.addEventListener("click",()=>{run=null;course=null;target=null;select.value="";lastPos=null;lastVersion=-1;});
 fetch(new URL("world/harbor_front.json",document.baseURI)).then(r=>{if(!r.ok)throw Error("map");return r.json();}).then(layout=>{
  landmarks=(layout.landmarks||[]).filter(l=>typeof l.id==="string"&&typeof l.name==="string"&&Array.isArray(l.position)&&Number.isFinite(l.position[0])&&Number.isFinite(l.position[2]));
  for(const l of landmarks){const o=element("option","",l.name);o.value=l.id;select.append(o);}refresh();
 }).catch(()=>{description.textContent="명소 목록을 불러오지 못했습니다. 주행 코스는 사용할 수 있습니다.";refresh();});
 refresh();
 function tick(){
  const now=performance.now(),dt=Math.min(.5,(now-lastTime)/1000);lastTime=now;
  const view=globalThis.harborView;
  if(!view||typeof view.frame!=="function"||view.screen()!=="play"||document.hidden){lastPos=null;return;}
  const version=view.frameVersion();if(version===lastVersion)return;lastVersion=version;
  let f;try{f=JSON.parse(view.frame());}catch{return;}
  if(!f?.position||!f.state||!Number.isFinite(f.position.x)||!Number.isFinite(f.position.z))return;
  const p=f.position, driving=Boolean(f.state.isDriving),alive=Boolean(f.alive);
  const moved=lastPos?Math.hypot(p.x-lastPos.x,p.z-lastPos.z):0;lastPos={x:p.x,z:p.z};
  if(moved>50&&run?.started){run=null;course=null;announce("위치가 변경되어 주행 기록을 취소했습니다.");}
  if(alive){
   for(const l of landmarks){if(!saved.visited.includes(l.id)&&distance(p,[l.position[0],l.position[2]])<=20){saved.visited.push(l.id);announce("명소 발견 · "+l.name);save();refresh();}}
   const speed=driving?Math.abs(Number(f.state.vehicle?.speed))*3.6:0;
   if(Number.isFinite(speed)&&speed>saved.topSpeed&&speed<450){saved.topSpeed=speed;if(now-lastSave>3000){save();lastSave=now;refresh();}}
  }
  if(run&&course){
   run=advance(run,course,p,driving,alive,dt);
   if(run.cancelled){announce("주행 기록 취소 · 차량에서 내렸거나 쓰러졌습니다.");run=null;course=null;}
   else if(run.finished){const old=saved.records[course.id];if(!old||run.seconds<old){saved.records[course.id]=run.seconds;save();refresh();announce(course.name+" · 신기록 "+format(run.seconds));}else announce(course.name+" · 완주 "+format(run.seconds));run=null;course=null;}
  }
  const point=course&&run?{name:run.started?`체크포인트 ${run.index}/${course.points.length-1}`:"주행 시작점",point:course.points[run.index]}:target;
  panel.hidden=!point&&now>=noticeUntil;
  heading.textContent=course?course.name:"자유 탐험";
  progress.textContent=run?.started?"경과 "+format(run.seconds):now<noticeUntil?lastNotice:"";
  nav.textContent=point?`${point.name} · ${Math.round(distance(p,point.point))}m · ${bearing(p,point.point)}`:"";
 }
 setInterval(tick,150);
 window.addEventListener("pagehide",save);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();

/* Project Harbor: optional sandbox activities, using the read-only browser frame bridge. */
(()=>{'use strict';
const courses=[{"id":"harbor-loop","name":"항만 순환 코스","points":[[40,33],[40,71],[-39,71],[-39,33],[40,33]]},{"id":"civic-run","name":"도심 대로 코스","points":[[-155,-242],[-155,-345],[-70,-345],[-70,-440],[22,-440],[22,-530]]},{"id":"cinder-run","name":"사막 패스 코스","points":[[-595,-440],[-599,-381],[-591,-327],[-565,-275],[-530,-247],[-460,-242]]}];
courses.push(...[{"id":"alder-drive","name":"숲속 파크웨이","points":[[-580,174],[-562,224],[-581,278],[-581,361],[-570,413],[-541,438],[-215,438]]},{"id":"coast-drive","name":"랜턴 포인트 해안","points":[[99,170],[99,438],[385,438],[482,438],[540,420],[568,379],[568,326],[554,287]]},{"id":"station-drive","name":"기지 외곽 순환","points":[[224,-530],[224,-268],[550,-268],[550,-530]]}]);
const traps=[{"id":"boulevard","name":"Union Boulevard","point":[-110,-440]},{"id":"harbor","name":"Calloway Boulevard","point":[-95,33]},{"id":"desert","name":"Cinder Main","point":[-591,-327]},{"id":"forest","name":"Alderwash Parkway","point":[-581,320]},{"id":"coast","name":"Seabank Road","point":[290,438]}];
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
function track(previous, sample, stats){
 const next={...stats,traps:{...stats.traps}};
 if(!sample.alive)return {stats:next,peak:0};
 const moved=previous?.alive?Math.hypot(sample.x-previous.x,sample.z-previous.z):0;
 const continuous=Boolean(previous?.alive&&moved<=35);
 if(continuous&&previous.driving===sample.driving)next[sample.driving?"driveMeters":"walkMeters"]+=moved;
 let peak=continuous?Math.max(previous.peak||0,sample.wanted):sample.wanted;
 if(continuous&&previous.wanted>0&&sample.wanted===0&&peak>=2){next.escapes++;next.maxEscape=Math.max(next.maxEscape,peak);peak=0;}
 if(!sample.wanted)peak=0;
 if(sample.driving&&Number.isFinite(sample.speed)&&sample.speed>=15&&sample.speed<=450){
  for(const trap of traps)if(Math.hypot(sample.x-trap.point[0],sample.z-trap.point[1])<=16)next.traps[trap.id]=Math.max(next.traps[trap.id]||0,sample.speed);
 }
 return {stats:next,peak};
}
function mapProjection(bounds,width,height){
 const {min,max}=bounds;
 const scale=Math.min((width-40)/(max[0]-min[0]),(height-32)/(max[1]-min[1]));
 const cx=(min[0]+max[0])/2,cz=(min[1]+max[1])/2;
 return {point:(x,z)=>[width/2+(x-cx)*scale,height/2+(z-cz)*scale],world:(x,y)=>[(x-width/2)/scale+cx,(y-height/2)/scale+cz]};
}
function canvasFit(canvas){
 const r=canvas.getBoundingClientRect(),scale=Math.min(r.width/canvas.width,r.height/canvas.height);
 return {left:r.left+(r.width-canvas.width*scale)/2,top:r.top+(r.height-canvas.height*scale)/2,width:canvas.width*scale,height:canvas.height*scale,scale};
}
function drawPins(ctx,point,selected,course,run,landmarks,visited,showAll){
 const draw=(p,color,r)=>{const [x,y]=point(...p);if(x<0||y<0||x>ctx.canvas.width||y>ctx.canvas.height)return;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.strokeStyle="#172429";ctx.lineWidth=1.5;ctx.stroke();};
 if(showAll){
  for(const l of landmarks)draw([l.position[0],l.position[2]],visited.includes(l.id)?"#92e0d1":"#e9e6db",3.1);
  for(const t of traps){const [x,y]=point(...t.point);ctx.fillStyle="#fbc27d";ctx.fillRect(x-3,y-3,6,6);}
 }
 if(course&&run){
  ctx.save();ctx.strokeStyle="#eab774";ctx.lineWidth=2.5;ctx.setLineDash([6,5]);ctx.beginPath();
  course.points.slice(run.index).forEach((p,i)=>{const [x,y]=point(...p);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();ctx.restore();
  course.points.slice(run.index).forEach((p,i)=>draw(p,i===0?"#f6c574":"#d9a261",i===0?5.5:3));
 }else if(selected)draw(selected.point,"#f6c574",6);
}
function mount(){
 const hud=document.getElementById("hud"), map=document.getElementById("map"), atlas=document.getElementById("atlas");
 if(!hud||!map||!atlas||document.getElementById("harbor-free-roam"))return;
 const key="harbor-exploration-v1";
 let saved={visited:[],records:{},topSpeed:0};
 const statsKey="harbor-free-roam-stats-v1";
 let stats={driveMeters:0,walkMeters:0,escapes:0,maxEscape:0,traps:{}};
 try{const a=JSON.parse(localStorage.getItem(statsKey)||"null");if(a){for(const k of ["driveMeters","walkMeters","escapes","maxEscape"])if(Number.isFinite(a[k])&&a[k]>=0)stats[k]=a[k];for(const t of traps)if(Number.isFinite(a.traps?.[t.id])&&a.traps[t.id]>=0&&a.traps[t.id]<=450)stats.traps[t.id]=a.traps[t.id];}}catch{}
 try{const data=JSON.parse(localStorage.getItem(key)||"null");if(data&&Array.isArray(data.visited)&&data.records&&typeof data.records==="object"){saved={visited:data.visited.filter(x=>typeof x==="string"),records:Object.fromEntries(Object.entries(data.records).filter(([k,v])=>courses.some(c=>c.id===k)&&Number.isFinite(v)&&v>0)),topSpeed:Number.isFinite(data.topSpeed)?Math.max(0,data.topSpeed):0};}}catch{}
 const save=()=>{try{localStorage.setItem(key,JSON.stringify(saved));localStorage.setItem(statsKey,JSON.stringify(stats));}catch{}};
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
 #harbor-discovery .harbor-records{margin:8px 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:5px 12px}
 #harbor-discovery .harbor-records div{padding:4px 0;border-bottom:1px solid #ffffff18}
 #harbor-discovery .harbor-records strong{color:#fff6e8;font-weight:650}
 #harbor-discovery .harbor-records small{display:block;color:#bfc9c5}
 #atlas{cursor:crosshair}
 .harbor-map-pins{position:fixed;pointer-events:none;z-index:4;display:block}
 #harbor-map-pins-radar{z-index:2}
 @media(max-width:600px){#harbor-free-roam{top:calc(var(--edge,16px) + 110px);font-size:11px;max-width:44vw;padding:5px 8px}}
 `;
 document.head.append(style);
 const panel=element("div","panel");panel.id="harbor-free-roam";panel.hidden=true;
 const heading=element("strong"), progress=element("p"), nav=element("p");panel.append(heading,progress,nav);hud.append(panel);
 const details=element("details");details.id="harbor-discovery";details.append(element("summary","","자유 탐험 · 주행 기록"));
 const description=element("p","","명소를 방문하면 탐험 기록이 남습니다. 주행 코스는 선택 사항이며 차량으로 시작점에 접근하면 기록이 시작됩니다.");
 const summary=element("p"), status=element("p");
 const records=element("div","harbor-records");
 const mapHelp=element("p","","지도에서 클릭해 자유 목적지를 지정하세요. 금색 사각형은 속도 측정 구간입니다. 점선은 체크포인트 연결선이며 도로 경로는 아닙니다.");
 const row=element("div","harbor-extra-row"), select=element("select");select.setAttribute("aria-label","탐험 목적지");
 const defaultOption=element("option","","목적지 없음");defaultOption.value="";select.append(defaultOption);
 const routeRow=element("div","harbor-extra-row"), routeSelect=element("select");routeSelect.setAttribute("aria-label","주행 코스");
 for(const c of courses){const o=element("option","",c.name);o.value=c.id;routeSelect.append(o);}
 const choose=element("button","quiet","코스 선택");choose.type="button";
 const cancel=element("button","quiet","코스 취소");cancel.type="button";
 const clear=element("button","quiet","목적지 해제");clear.type="button";
 row.append(select,clear);routeRow.append(routeSelect,choose,cancel);details.append(description,summary,row,routeRow,status,mapHelp,records);
 (map.querySelector(".map-panel")||map).append(details);
 let landmarks=[], target=null, course=null, run=null, lastVersion=-1,lastTime=performance.now(),lastPos=null,lastSave=0,lastNotice="",noticeUntil=0;
 let bounds=null,latest=null,previousSample=null;
 const radar=document.getElementById("radar");
 const makeOverlay=id=>{const e=element("canvas","harbor-map-pins");e.id=id;e.setAttribute("aria-hidden","true");e.hidden=true;document.body.append(e);return e;};
 const atlasPins=makeOverlay("harbor-map-pins-atlas"),radarPins=makeOverlay("harbor-map-pins-radar");
 function renderOverlay(){
  const view=globalThis.harborView,screen=view?.screen?.();
  for(const [canvas,pins,mode] of [[atlas,atlasPins,"map"],[radar,radarPins,"play"]]){
   if(!canvas||!bounds||screen!==mode||document.hidden||(!latest&&mode==="play")){pins.hidden=true;continue;}
   const box=canvasFit(canvas);if(box.width<1||box.height<1){pins.hidden=true;continue;}
   pins.hidden=false;
   pins.style.left=box.left+"px";pins.style.top=box.top+"px";pins.style.width=box.width+"px";pins.style.height=box.height+"px";
   if(pins.width!==canvas.width)pins.width=canvas.width;if(pins.height!==canvas.height)pins.height=canvas.height;
   const ctx=pins.getContext("2d");ctx.clearRect(0,0,pins.width,pins.height);
   const point=mode==="map"?mapProjection(bounds,pins.width,pins.height).point:(x,z)=>{const scale=pins.width/(latest.driving?134:88);return [pins.width/2+(x-latest.x)*scale,pins.height/2+(z-latest.z)*scale];};
   drawPins(ctx,point,target,course,run,landmarks,saved.visited,mode==="map");
  }
 }
 atlas.addEventListener("click",event=>{
  if(!bounds)return;
  const box=canvasFit(atlas),x=(event.clientX-box.left)/box.scale,y=(event.clientY-box.top)/box.scale;
  if(x<0||y<0||x>atlas.width||y>atlas.height)return;
  const point=mapProjection(bounds,atlas.width,atlas.height).world(x,y);
  if(point[0]<bounds.min[0]||point[0]>bounds.max[0]||point[1]<bounds.min[1]||point[1]>bounds.max[1])return;
  target={name:"사용자 목적지",point};select.value="";renderOverlay();
 });
 window.addEventListener("resize",renderOverlay);
 map.querySelector(".map-panel")?.addEventListener("scroll",renderOverlay,{passive:true});
 const format=t=>{const tenths=Math.round(t*10);return `${Math.floor(tenths/600)}:${(tenths%600/10).toFixed(1).padStart(4,"0")}`;};
 const announce=(s)=>{lastNotice=s;noticeUntil=performance.now()+4500;};
 function refresh(){
  const visited=new Set(saved.visited);
  summary.textContent=`명소 ${landmarks.filter(l=>visited.has(l.id)).length}/${landmarks.length} · 최고 속도 ${Math.round(saved.topSpeed)} km/h`;
  status.textContent=courses.map(c=>`${c.name} ${saved.records[c.id]?format(saved.records[c.id]):"기록 없음"}`).join(" / ");
  const rows=[["운전 거리",(stats.driveMeters/1000).toFixed(2)+" km"],["도보 거리",(stats.walkMeters/1000).toFixed(2)+" km"],["수배 탈출",stats.escapes+"회 · 최고 "+stats.maxEscape+"단계"],...traps.map(t=>[t.name,stats.traps[t.id]?Math.round(stats.traps[t.id])+" km/h":"기록 없음"])];
  records.replaceChildren(...rows.map(([name,value])=>{const d=element("div");d.append(element("small","",name),element("strong","",value));return d;}));
  for(const option of select.options){if(!option.value)continue;const l=landmarks.find(x=>x.id===option.value);if(l)option.textContent=(visited.has(l.id)?"✓ ":"")+l.name;}
 }
 select.addEventListener("change",()=>{const l=landmarks.find(x=>x.id===select.value);target=l?{name:l.name,point:[l.position[0],l.position[2]]}:null;});
 clear.addEventListener("click",()=>{target=null;select.value="";});
 choose.addEventListener("click",()=>{course=courses.find(c=>c.id===routeSelect.value)||null;run=course?{started:false,index:0,seconds:0}:null;if(course)announce(course.name+" · 시작점으로 이동");});
 cancel.addEventListener("click",()=>{course=null;run=null;announce("주행 코스 취소");});
 document.getElementById("reset")?.addEventListener("click",()=>{run=null;course=null;target=null;select.value="";lastPos=null;lastVersion=-1;previousSample=null;latest=null;});
 fetch(new URL("world/harbor_front.json",document.baseURI)).then(r=>{if(!r.ok)throw Error("map");return r.json();}).then(layout=>{
  bounds=layout.bounds;
  landmarks=(layout.landmarks||[]).filter(l=>typeof l.id==="string"&&typeof l.name==="string"&&Array.isArray(l.position)&&Number.isFinite(l.position[0])&&Number.isFinite(l.position[2]));
  for(const l of landmarks){const o=element("option","",l.name);o.value=l.id;select.append(o);}refresh();
 }).catch(()=>{description.textContent="명소 목록을 불러오지 못했습니다. 주행 코스는 사용할 수 있습니다.";refresh();});
 refresh();
 function tick(){
  const now=performance.now(),dt=Math.min(.5,(now-lastTime)/1000);lastTime=now;
  const view=globalThis.harborView;
  if(!view||typeof view.frame!=="function"||view.screen()!=="play"||document.hidden){lastPos=null;previousSample=null;renderOverlay();return;}
  const version=view.frameVersion();if(version===lastVersion)return;lastVersion=version;
  let f;try{f=JSON.parse(view.frame());}catch{return;}
  if(!f?.position||!f.state||!Number.isFinite(f.position.x)||!Number.isFinite(f.position.z))return;
  const p=f.position, driving=Boolean(f.state.isDriving),alive=Boolean(f.alive);
  const sample={x:p.x,z:p.z,alive,driving,wanted:Math.max(0,Number(f.state.wantedLevel)||0),speed:driving?Math.abs(Number(f.state.vehicle?.speed))*3.6:0};
  const oldEscapes=stats.escapes,oldTraps=stats.traps;
  const tracked=track(previousSample,sample,stats);stats=tracked.stats;sample.peak=tracked.peak;previousSample=sample;latest=sample;
  if(stats.escapes>oldEscapes){announce("경찰 추격 탈출 · 최고 "+stats.maxEscape+"단계");save();refresh();}
  for(const t of traps)if(Math.floor(stats.traps[t.id]||0)>Math.floor(oldTraps[t.id]||0)){announce("속도 기록 · "+t.name+" "+Math.round(stats.traps[t.id])+" km/h");break;}
  if(now-lastSave>3000){save();lastSave=now;refresh();}
  if(target&&alive&&distance(p,target.point)<10){announce("목적지 도착 · "+target.name);target=null;select.value="";}
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
  renderOverlay();
 }
 setInterval(tick,150);
 window.addEventListener("pagehide",save);
 document.addEventListener("visibilitychange",()=>{if(document.hidden)save();});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();

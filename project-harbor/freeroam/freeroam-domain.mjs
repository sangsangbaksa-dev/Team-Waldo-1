export function createFreeRoam(layout, saved = {}) {
  const points = (layout.landmarks ?? []).filter(p => p.id && Array.isArray(p.position) && p.position.length === 3);
  const routes = [
    {id:"quay", name:"부두 직선 코스", checkpoints:[[-130,33],[-85,33],[-39,33],[40,33],[99,33]], limit:55},
    {id:"civic", name:"시빅 스트리트", checkpoints:[[-140,-345],[-70,-345],[22,-345],[105,-345],[170,-345]], limit:70},
    {id:"rail", name:"철도 교차로 코스", checkpoints:[[-140,-119],[-85,-119],[-39,-119],[40,-119],[99,-119]], limit:55},
    {id:"harbor-loop", name:"항만 순환 코스", checkpoints:[[40,33],[40,71],[-39,71],[-39,33],[40,33]],limit:85},
    {id:"civic-run", name:"도심 대로 코스", checkpoints:[[-155,-242],[-155,-345],[-70,-345],[-70,-440],[22,-440],[22,-530]],limit:120},
    {id:"cinder-run", name:"사막 패스 코스", checkpoints:[[-595,-440],[-599,-381],[-591,-327],[-565,-275],[-530,-247],[-460,-242]],limit:100},
    {id:"alder-drive",name:"숲속 파크웨이",checkpoints:[[-580,174],[-562,224],[-581,278],[-581,361],[-570,413],[-541,438],[-215,438]],limit:180},
    {id:"coast-drive",name:"랜턴 포인트 해안",checkpoints:[[99,170],[99,438],[385,438],[482,438],[540,420],[568,379],[568,326],[554,287]],limit:200},
    {id:"station-drive",name:"기지 외곽 순환",checkpoints:[[224,-530],[224,-268],[550,-268],[550,-530]],limit:180},
  ];
  const traps = [
    {id:"lighthouse", name:"Lighthouse Drive", x:99,z:-80},
    {id:"supply", name:"Supply Road", x:-105,z:-175},
    {id:"meridian", name:"Meridian Avenue", x:22,z:-470},
    {id:"boulevard",name:"Union Boulevard",x:-110,z:-440},
    {id:"harbor",name:"Calloway Boulevard",x:-95,z:33},
    {id:"desert",name:"Cinder Main",x:-591,z:-327},
    {id:"forest",name:"Alderwash Parkway",x:-581,z:320},
    {id:"coast",name:"Seabank Road",x:290,z:438},
  ];
  const record = {visited: Array.isArray(saved.visited) ? [...new Set(saved.visited.filter(id=>points.some(p=>p.id===id)))] : [], best:{}, speeds:{}, trip:{walk:0,drive:0,topSpeed:0,escapes:0,maxEscape:0}};
  for(const k of Object.keys(record.trip)) if(Number.isFinite(saved.trip?.[k])&&saved.trip[k]>=0)record.trip[k]=saved.trip[k];
  for (const r of routes) if (Number.isFinite(saved.best?.[r.id]) && saved.best[r.id]>0) record.best[r.id]=saved.best[r.id];
  for (const t of traps) if (Number.isFinite(saved.speeds?.[t.id]) && saved.speeds[t.id]>=0) record.speeds[t.id]=saved.speeds[t.id];
  let active=null, previous=null, msg="", notice=0, trapInside=new Set(), trapPeak={}, selectedRoute="", selectedLandmark="", wantedPeak=0, clearTime=0, dirtyDistance=0;
  const d=(p,x,z)=>Math.hypot(p.x-x,p.z-z);
  const tell=(s)=>{msg=s;notice=4;};
  const nearest=(p,list,coord)=>list.reduce((best,item)=>{const [x,z]=coord(item);const distance=d(p,x,z);return !best||distance<best.distance?{item,distance}:best;},null);
  const cancel=()=>{active=null;previous=null;trapInside.clear();trapPeak={};wantedPeak=0;clearTime=0;};
  const reset=()=>{cancel();selectedRoute="";selectedLandmark="";notice=0;};
  function update(frame,dt) {
    if (!frame?.position || !frame.state || !frame.alive) {if(active)tell("주행 기록 취소");cancel();return false;}
    const driving=Boolean(frame.state.isDriving), car=frame.state.vehicle;
    const p=driving&&car?.position?car.position:frame.position;
    if(![p.x,p.y,p.z].every(Number.isFinite))return false;
    dt=Number.isFinite(dt)?Math.max(0,Math.min(.25,dt)):0;
    notice=Math.max(0,notice-dt);
    const teleported=previous&&d(p,previous.x,previous.z)>45;
    let changed=false;
    if(teleported){if(active)tell("주행 기록 취소");cancel();}
    if(previous&&previous.driving===driving&&!teleported){
      const step=d(p,previous.x,previous.z);
      if(step<=Math.max(3,dt*70)){record.trip[driving?"drive":"walk"]+=step;dirtyDistance+=step;}
      if(dirtyDistance>=20){dirtyDistance=0;changed=true;}
    }
    previous={x:p.x,z:p.z,driving};
    const speed=driving?Math.round(Math.abs(Number(car?.speed)||0)*3.6):0;
    if(Number.isFinite(speed)&&speed<450&&speed>record.trip.topSpeed){record.trip.topSpeed=speed;changed=true;}
    const wanted=Math.max(0,Number(frame.state.wantedLevel)||0);
    if(wanted){wantedPeak=Math.max(wantedPeak,wanted);clearTime=0;}
    else if(wantedPeak){clearTime+=dt;if(clearTime>=3){record.trip.escapes++;record.trip.maxEscape=Math.max(record.trip.maxEscape,wantedPeak);tell("추격 탈출 · "+wantedPeak+"단계");wantedPeak=0;clearTime=0;changed=true;}}
    if(!driving) {
      for(const mark of points) if(!record.visited.includes(mark.id)&&d(p,mark.position[0],mark.position[2])<=10&&Math.abs(p.y-mark.position[1])<=4){
        record.visited.push(mark.id);tell("명소 발견 · "+mark.name);changed=true;
      }
    }
    if(active){
      active.elapsed+=dt;
      if(!driving||active.elapsed>active.route.limit){tell(!driving?"하차로 주행 종료":"시간 초과 · 다시 도전하세요");active=null;}
      else {
        const cp=active.route.checkpoints[active.index];
        if(d(p,cp[0],cp[1])<=7&&Math.abs(p.y)<=4){
          active.index++;
          if(active.index===active.route.checkpoints.length){
            const seconds=Math.max(.1,Math.round(active.elapsed*10)/10),id=active.route.id;
            const best=!record.best[id]||seconds<record.best[id];
            if(best){record.best[id]=seconds;changed=true;}
            tell((best?"최고 기록 · ":"완주 · ")+seconds.toFixed(1)+"초");active=null;
          }else tell("체크포인트 "+active.index+"/"+active.route.checkpoints.length);
        }
      }
    }
    for(const trap of traps){
      const inside=driving&&Math.abs(p.y)<=4&&d(p,trap.x,trap.z)<=10;
      if(inside){trapInside.add(trap.id);trapPeak[trap.id]=Math.max(trapPeak[trap.id]||0,Math.round(Math.abs(Number(car?.speed)||0)*3.6));}
      else if(trapInside.has(trap.id)){
        if(driving&&(trapPeak[trap.id]||0)>=10&&trapPeak[trap.id]>(record.speeds[trap.id]||0)){
          record.speeds[trap.id]=trapPeak[trap.id];tell("속도 기록 · "+trap.name+" "+trapPeak[trap.id]+" km/h");changed=true;
        }
        trapInside.delete(trap.id);delete trapPeak[trap.id];
      }
    }
    return changed;
  }
  function toggle(frame) {
    if(active){active=null;tell("주행 도전 종료");return;}
    if(!frame?.alive||!frame.state?.isDriving||!frame.state.vehicle?.position){tell("차량에 탑승해 출발점으로 이동하세요");return;}
    const p=frame.state.vehicle.position;
    const near=nearest(p,selectedRoute?routes.filter(r=>r.id===selectedRoute):routes,r=>r.checkpoints[0]);
    if(!near||near.distance>12||Math.abs(p.y)>4){tell("가까운 코스 출발점으로 이동하세요");return;}
    active={route:near.item,index:1,elapsed:0};tell(near.item.name+" · 출발");
  }
  function view(frame){
    const p=frame?.state?.isDriving?frame.state.vehicle?.position:frame?.position;
    if(!p)return null;
    const route=nearest(p,selectedRoute?routes.filter(r=>r.id===selectedRoute):routes,r=>r.checkpoints[0]);
    const landmark=nearest(p,selectedLandmark?points.filter(v=>v.id===selectedLandmark):points.filter(v=>!record.visited.includes(v.id)),v=>[v.position[0],v.position[2]]);
    const trap=nearest(p,traps,t=>[t.x,t.z]);
    const target=active?{item:active.route,distance:d(p,...active.route.checkpoints[active.index]),point:active.route.checkpoints[active.index]}:route&&{...route,point:route.item.checkpoints[0]};
    return {active:active?{name:active.route.name,index:active.index,total:active.route.checkpoints.length,remaining:Math.max(0,active.route.limit-active.elapsed)}:null,target,landmark,trap,visited:record.visited.length,total:points.length,record,msg:notice>0?msg:""};
  }
  return {update,toggle,view,cancel,reset,record,routes,points,traps,selectRoute(id){selectedRoute=routes.some(r=>r.id===id)?id:"";active=null;},selectLandmark(id){selectedLandmark=points.some(p=>p.id===id)?id:"";}};
}

function projectPoint(p,a,b){
 const dx=b[0]-a[0],dz=b[1]-a[1],d=dx*dx+dz*dz;
 const t=d?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/d)):0;
 const q=[a[0]+dx*t,a[1]+dz*t];return {t,q,d:Math.hypot(p[0]-q[0],p[1]-q[1])};
}
export function roadGraph(roads){
 const segments=[];
 for(const r of roads){
  if(r.kind==="path"||r.kind==="runway")continue;
  let a=r.from,b=r.to;
  if(!a||!b){
   if(!r.center||!r.size)continue;
   const [x,z]=r.center,[w,h]=r.size;
   a=w>=h?[x-w/2,z]:[x,z-h/2];b=w>=h?[x+w/2,z]:[x,z+h/2];
  }
  if(![...a,...b].every(Number.isFinite)||Math.hypot(b[0]-a[0],b[1]-a[1])<.1)continue;
  segments.push({a,b,cuts:[0,1]});
 }
 const cross=(ax,az,bx,bz)=>ax*bz-az*bx;
 for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
  const p=segments[i],q=segments[j],rx=p.b[0]-p.a[0],rz=p.b[1]-p.a[1],sx=q.b[0]-q.a[0],sz=q.b[1]-q.a[1],dx=q.a[0]-p.a[0],dz=q.a[1]-p.a[1],den=cross(rx,rz,sx,sz);
  if(Math.abs(den)>1e-8){
   const t=cross(dx,dz,sx,sz)/den,u=cross(dx,dz,rx,rz)/den;
   if(t>=-1e-7&&t<=1+1e-7&&u>=-1e-7&&u<=1+1e-7){p.cuts.push(Math.max(0,Math.min(1,t)));q.cuts.push(Math.max(0,Math.min(1,u)));}
  }else{
   for(const e of [q.a,q.b]){const hit=projectPoint(e,p.a,p.b);if(hit.d<.02)p.cuts.push(hit.t);}
   for(const e of [p.a,p.b]){const hit=projectPoint(e,q.a,q.b);if(hit.d<.02)q.cuts.push(hit.t);}
  }
 }
 const points=[],edges=[],adj=[],ids=new Map(),unique=new Set();
 const node=p=>{const key=p.map(v=>Math.round(v*100)).join(",");if(ids.has(key))return ids.get(key);const id=points.length;ids.set(key,id);points.push(p);adj.push([]);return id;};
 for(const s of segments){
  const cuts=[...new Set(s.cuts.map(t=>Math.round(t*1e8)/1e8))].sort((a,b)=>a-b);
  const list=cuts.map(t=>node([s.a[0]+(s.b[0]-s.a[0])*t,s.a[1]+(s.b[1]-s.a[1])*t]));
  for(let i=1;i<list.length;i++){
   const a=list[i-1],b=list[i],key=[Math.min(a,b),Math.max(a,b)].join(":");if(a===b||unique.has(key))continue;unique.add(key);
   const d=Math.hypot(points[a][0]-points[b][0],points[a][1]-points[b][1]);edges.push({a,b,d});adj[a].push({to:b,d});adj[b].push({to:a,d});
  }
 }
 return {points,edges,adj};
}
export function roadRoute(graph,from,to){
 if(!graph?.edges.length)return null;
 const nearest=p=>{let best=null;for(const edge of graph.edges){const hit=projectPoint(p,graph.points[edge.a],graph.points[edge.b]);if(!best||hit.d<best.d)best={...hit,edge};}return best;};
 const start=nearest(from),end=nearest(to);if(!start||!end||start.d>70||end.d>70)return null;
 if(start.edge===end.edge)return {points:[start.q,end.q],meters:Math.hypot(start.q[0]-end.q[0],start.q[1]-end.q[1]),offRoad:end.d};
 const n=graph.points.length,dist=Array(n).fill(Infinity),prev=Array(n).fill(-1),used=Array(n).fill(false);
 dist[start.edge.a]=start.t*start.edge.d;dist[start.edge.b]=(1-start.t)*start.edge.d;
 for(let i=0;i<n;i++){
  let u=-1;for(let j=0;j<n;j++)if(!used[j]&&(u<0||dist[j]<dist[u]))u=j;
  if(u<0||!Number.isFinite(dist[u]))break;used[u]=true;
  for(const e of graph.adj[u])if(dist[u]+e.d<dist[e.to]){dist[e.to]=dist[u]+e.d;prev[e.to]=u;}
 }
 const ca=dist[end.edge.a]+end.t*end.edge.d,cb=dist[end.edge.b]+(1-end.t)*end.edge.d,meters=Math.min(ca,cb);
 if(!Number.isFinite(meters))return null;
 let u=ca<=cb?end.edge.a:end.edge.b,route=[];
 while(u>=0){route.push(graph.points[u]);u=prev[u];}
 return {points:[start.q,...route.reverse(),end.q],meters,offRoad:end.d};
}

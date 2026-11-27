export function createCityActivities(layout,saved={}){
 const finite=Number.isFinite,dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 const trails=[];
 for(const name of ["Fern Glade Trail","Alderwalk Trail","Terrace Walk"]){
   const seg=(layout.roads||[]).filter(r=>r.kind==="path"&&r.name===name&&Array.isArray(r.from)&&Array.isArray(r.to));
   if(!seg.length||!seg.every((r,i)=>i===0||dist(seg[i-1].to,r.from)<.1))continue;
   const points=[seg[0].from,...seg.map(r=>r.to)],meters=points.slice(1).reduce((d,p,i)=>d+dist(p,points[i]),0);
   trails.push({id:name.toLowerCase().replaceAll(" ","-"),name,points,meters,limit:Math.ceil(meters/1.1+35)});
 }
 const stops=[
   {id:"harbor",name:"항만 물류",point:[-105,-178],axis:[1,0]},
   {id:"city",name:"메리디언 대로",point:[25,-470],axis:[0,1]},
   {id:"market",name:"올드 슬루이스",point:[-332.5,68],axis:[1,0]},
   {id:"desert",name:"신더 플랫",point:[-592.03,-354.44],axis:[8,54]},
   {id:"forest",name:"앨더워시",point:[-578,320],axis:[0,1]},
   {id:"base",name:"브레이크워터 외곽",point:[221,-400],axis:[0,1]},
   {id:"coast",name:"시뱅크 해안",point:[290,441],axis:[1,0]}
 ];
 const jobs=[["harbor","city"],["city","base"],["market","harbor"],["desert","market"],["forest","market"],["coast","forest"]].map(([a,b])=>{
   const from=stops.find(x=>x.id===a),to=stops.find(x=>x.id===b),meters=dist(from.point,to.point);
   return {id:a+"-"+b,name:from.name+" → "+to.name,from,to,limit:Math.ceil(130+meters/2.5),points:Math.round(25+meters/10)};
 });
 const districtNames=new Map((layout.districts||[]).map(d=>[d.id,d.name]));
 const descriptions={harbor:"화물 부두와 산업 시설",bridge:"지역을 연결하는 교량",plaza:"도시 광장",tower:"고층 건물",market:"지역 상권",workshop:"정비 및 재활용 시설",mesa:"사막 암반 지형",outpost:"외곽 중계 지점",airfield:"비행장",hangar:"격납고 구역",glade:"숲속 공터",garden:"해안 정원",interior:"출입 가능한 실내 시설",lookout:"고지대 전망 지점"};
 const surveys=(layout.landmarks||[]).filter(l=>typeof l.id==="string"&&typeof l.name==="string"&&l.position?.length===3&&l.position.every(finite)).map(l=>({id:l.id,name:l.name,point:[l.position[0],l.position[2]],height:l.position[1],district:l.district,description:descriptions[l.kind]||"지역 명소"}));
 const record={trailBest:{},stopBest:{},deliveryBest:{},deliveryCount:0,servicePoints:0,surveyed:[...new Set(Array.isArray(saved?.surveyed)?saved.surveyed.filter(id=>surveys.some(l=>l.id===id)):[])]};
 const journal=()=>[...districtNames].map(([id,name])=>{const items=surveys.filter(l=>l.district===id);return {id,name,total:items.length,done:items.filter(l=>record.surveyed.includes(l.id)).length};}).filter(d=>d.total>0);
 for(const [key,items] of [["trailBest",trails],["stopBest",stops],["deliveryBest",jobs]])for(const i of items){const v=saved?.[key]?.[i.id];if(finite(v)&&v>0&&v<100000)record[key][i.id]=v;}
 for(const k of ["deliveryCount","servicePoints"])if(finite(saved?.[k])&&saved[k]>=0)record[k]=Math.min(1e9,Math.floor(saved[k]));
 let active=null,previous=null,notice="";
 function sample(f){
   if(!f?.alive||!f.state||!f.position)return null;
   const driving=Boolean(f.state.isDriving),car=f.state.vehicle,p=driving&&car?.position?car.position:f.position;
   if(![p?.x,p?.z,p?.y].every(finite))return null;
   return {point:[p.x,p.z],height:p.y,driving,carId:f.state.playerVehicleId??null,generation:f.state.runGeneration??null,speed:driving?Math.abs(Number(car?.speed)||0):Math.hypot(Number(f.velocity?.x)||0,Number(f.velocity?.y)||0,Number(f.velocity?.z)||0),yaw:Number(car?.yaw),wanted:Number(f.state.wantedLevel)||0};
 }
 function select(type,id){
   const item=({trail:trails,stop:stops,delivery:jobs,survey:surveys}[type]||[]).find(i=>i.id===id);
   if(!item)return false;
   if(type==="survey"&&record.surveyed.includes(id)){notice="이미 조사한 명소입니다";return false;}
   active={type,item,phase:"approach",index:0,elapsed:0,hold:0,vehicle:null};previous=null;notice="출발 지점으로 이동하세요";return true;
 }
 function cancel(message="활동 취소"){active=null;previous=null;notice=message;}
 function target(){
   if(!active)return null;
   const {type,item,index,phase}=active;
   return type==="trail"?{name:item.name,point:item.points[index]}:(type==="stop"||type==="survey")?item:phase==="deliver"?item.to:item.from;
 }
 function aligned(q,t){const [x,z]=t.axis,n=Math.hypot(x,z);return finite(q.yaw)&&Math.abs((-Math.sin(q.yaw)*x-Math.cos(q.yaw)*z)/n)>=Math.cos(20*Math.PI/180);}
 function finish(){
   const {type,item,elapsed}=active,k=type==="trail"?"trailBest":type==="stop"?"stopBest":"deliveryBest",time=Math.max(.1,Math.round(elapsed*10)/10);
   const best=!record[k][item.id]||time<record[k][item.id];if(best)record[k][item.id]=time;
   if(type==="delivery"){record.deliveryCount++;record.servicePoints+=item.points;}
   notice=item.name+" · "+(best?"최고 기록 ":"완료 ")+time.toFixed(1)+"초"+(type==="delivery"?" · 서비스 점수 +"+item.points:"");
   active=null;previous=null;return true;
 }
 function update(frame,dt){
   if(!active)return false;const q=sample(frame);
   if(!q){cancel("쓰러져 활동이 종료되었습니다");return false;}
   dt=finite(dt)?Math.max(0,Math.min(.5,dt)):0;
   if(previous&&q.generation!==previous.generation){cancel("새 세션으로 활동 종료");return false;}
   if(previous&&dt>0&&dist(q.point,previous.point)>Math.max(q.driving||previous.driving?8:4,dt*(q.driving||previous.driving?75:13))){cancel("위치 급변으로 기록 취소");return false;}
   previous=q;const a=active,t=target(),near=dist(q.point,t.point);
   if(a.type==="survey"){
     const valid=!q.driving&&q.wanted===0&&q.speed<=1&&near<=8&&Math.abs(q.height-t.height)<=3;
     a.hold=valid?a.hold+dt:0;
     if(a.hold>=3){
       if(!record.surveyed.includes(t.id))record.surveyed.push(t.id);
       const region=journal().find(d=>d.id===t.district);
       notice="명소 조사 완료 · "+t.name+(region?.done===region?.total&&region?.total>0?" · "+region.name+" 탐방 완료":"");
       active=null;previous=null;return true;
     }
     return false;
   }
   if(a.type==="trail"){
     if(a.phase==="run"){
       if(q.driving){cancel("도보 탐방 중 차량 탑승으로 종료");return false;}
       a.elapsed+=dt;if(a.elapsed>a.item.limit){cancel("도보 탐방 제한 시간 초과");return false;}
       if(near<=6){a.index++;if(a.index===a.item.points.length)return finish();notice="경유지 "+a.index+"/"+a.item.points.length;}
     }else if(!q.driving&&near<=6){a.phase="run";a.index=1;notice="도보 탐방 시작";}
     return false;
   }
   if(a.phase==="deliver"&&(!q.driving||q.carId!==a.vehicle)){cancel("운송 중 차량 변경으로 종료");return false;}
   if(q.wanted>0&&a.phase==="deliver"){cancel("수배 중에는 민간 운송을 완료할 수 없습니다");return false;}
   if(a.phase==="deliver"||a.phase==="stop"){a.elapsed+=dt;if(a.elapsed>(a.type==="delivery"?a.item.limit:60)){cancel("제한 시간 초과");return false;}}
   if(a.type==="stop"&&a.phase==="approach"&&q.driving&&near<=20){a.phase="stop";a.elapsed=0;}
   a.hold=q.driving&&q.wanted===0&&near<=3.5&&q.speed<=.7&&aligned(q,t)?a.hold+dt:0;
   if(a.hold>=2.5){
     if(a.type==="stop")return finish();
     if(a.phase==="approach"){a.phase="deliver";a.vehicle=q.carId;a.elapsed=0;a.hold=0;notice="운송 시작 · 목적지에서 정확히 정차하세요";}
     else return finish();
   }
   return false;
 }
 function view(frame){
   if(!active)return {active:null,notice,record};
   const q=sample(frame),t=target(),a=active;
   return {active:{type:a.type,name:a.item.name,phase:a.phase,target:t,remaining:a.phase==="approach"?null:Math.max(0,(a.type==="stop"?60:a.item.limit)-a.elapsed),hold:a.hold,distance:q?dist(q.point,t.point):null,progress:a.type==="trail"?a.index:null,total:a.type==="trail"?a.item.points.length:null,path:a.type==="trail"?a.item.points.slice(a.index):a.type==="delivery"&&a.phase==="approach"?[a.item.from.point,a.item.to.point]:[t.point]},notice,record};
 }
 return {trails,stops,jobs,surveys,record,journal,select,cancel,update,view};
}

export function mapActivityPoint(bounds,width,height,point){
 const {min,max}=bounds;const scale=Math.min((width-40)/(max[0]-min[0]),(height-32)/(max[1]-min[1]));
 return [width/2+(point[0]-(min[0]+max[0])/2)*scale,height/2+(point[1]-(min[1]+max[1])/2)*scale];
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

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
 const record={trailBest:{},stopBest:{},deliveryBest:{},deliveryCount:0,servicePoints:0};
 for(const [key,items] of [["trailBest",trails],["stopBest",stops],["deliveryBest",jobs]])for(const i of items){const v=saved?.[key]?.[i.id];if(finite(v)&&v>0&&v<100000)record[key][i.id]=v;}
 for(const k of ["deliveryCount","servicePoints"])if(finite(saved?.[k])&&saved[k]>=0)record[k]=Math.min(1e9,Math.floor(saved[k]));
 let active=null,previous=null,notice="";
 function sample(f){
   if(!f?.alive||!f.state||!f.position)return null;
   const driving=Boolean(f.state.isDriving),car=f.state.vehicle,p=driving&&car?.position?car.position:f.position;
   if(![p?.x,p?.z,p?.y].every(finite))return null;
   return {point:[p.x,p.z],driving,carId:f.state.playerVehicleId??null,speed:driving?Math.abs(Number(car?.speed)||0):0,yaw:Number(car?.yaw),wanted:Number(f.state.wantedLevel)||0};
 }
 function select(type,id){
   const item=({trail:trails,stop:stops,delivery:jobs}[type]||[]).find(i=>i.id===id);
   if(!item)return false;
   active={type,item,phase:"approach",index:0,elapsed:0,hold:0,vehicle:null};previous=null;notice="출발 지점으로 이동하세요";return true;
 }
 function cancel(message="활동 취소"){active=null;previous=null;notice=message;}
 function target(){
   if(!active)return null;
   const {type,item,index,phase}=active;
   return type==="trail"?{name:item.name,point:item.points[index]}:type==="stop"?item:phase==="deliver"?item.to:item.from;
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
   if(previous&&dist(q.point,previous.point)>Math.max(25,dt*100)){cancel("위치 급변으로 기록 취소");return false;}
   previous=q;const a=active,t=target(),near=dist(q.point,t.point);
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
   return {active:{type:a.type,name:a.item.name,phase:a.phase,target:t,remaining:a.phase==="approach"?null:Math.max(0,(a.type==="stop"?60:a.item.limit)-a.elapsed),hold:a.hold,distance:q?dist(q.point,t.point):null,progress:a.type==="trail"?a.index:null,total:a.type==="trail"?a.item.points.length:null},notice,record};
 }
 return {trails,stops,jobs,record,select,cancel,update,view};
}

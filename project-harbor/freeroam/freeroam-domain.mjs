export function createFreeRoam(layout, saved = {}) {
  const points = (layout.landmarks ?? []).filter(p => p.id && Array.isArray(p.position) && p.position.length === 3);
  const routes = [
    {id:"quay", name:"부두 직선 코스", checkpoints:[[-130,33],[-85,33],[-39,33],[40,33],[99,33]], limit:55},
    {id:"civic", name:"시빅 스트리트", checkpoints:[[-140,-345],[-70,-345],[22,-345],[105,-345],[170,-345]], limit:70},
    {id:"rail", name:"철도 교차로 코스", checkpoints:[[-140,-119],[-85,-119],[-39,-119],[40,-119],[99,-119]], limit:55},
  ];
  const traps = [
    {id:"lighthouse", name:"Lighthouse Drive", x:99,z:-80},
    {id:"supply", name:"Supply Road", x:-105,z:-175},
    {id:"meridian", name:"Meridian Avenue", x:22,z:-470},
  ];
  const record = {visited: Array.isArray(saved.visited) ? [...new Set(saved.visited.filter(id=>points.some(p=>p.id===id)))] : [], best:{}, speeds:{}};
  for (const r of routes) if (Number.isFinite(saved.best?.[r.id]) && saved.best[r.id]>0) record.best[r.id]=saved.best[r.id];
  for (const t of traps) if (Number.isFinite(saved.speeds?.[t.id]) && saved.speeds[t.id]>=0) record.speeds[t.id]=saved.speeds[t.id];
  let active=null, previous=null, msg="", notice=0, trapInside=new Set(), trapPeak={};
  const d=(p,x,z)=>Math.hypot(p.x-x,p.z-z);
  const tell=(s)=>{msg=s;notice=4;};
  const nearest=(p,list,coord)=>list.reduce((best,item)=>{const [x,z]=coord(item);const distance=d(p,x,z);return !best||distance<best.distance?{item,distance}:best;},null);
  const cancel=()=>{active=null;previous=null;trapInside.clear();trapPeak={};};
  function update(frame,dt) {
    if (!frame?.position || !frame.state || !frame.alive) {if(active)tell("주행 기록 취소");cancel();return false;}
    const driving=Boolean(frame.state.isDriving), car=frame.state.vehicle;
    const p=driving&&car?.position?car.position:frame.position;
    if(![p.x,p.y,p.z].every(Number.isFinite))return false;
    dt=Number.isFinite(dt)?Math.max(0,Math.min(.25,dt)):0;
    notice=Math.max(0,notice-dt);
    const teleported=previous&&d(p,previous.x,previous.z)>45;
    if(teleported){if(active)tell("주행 기록 취소");cancel();}
    previous={x:p.x,z:p.z};
    let changed=false;
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
    const near=nearest(p,routes,r=>r.checkpoints[0]);
    if(!near||near.distance>12||Math.abs(p.y)>4){tell("가까운 코스 출발점으로 이동하세요");return;}
    active={route:near.item,index:1,elapsed:0};tell(near.item.name+" · 출발");
  }
  function view(frame){
    const p=frame?.state?.isDriving?frame.state.vehicle?.position:frame?.position;
    if(!p)return null;
    const route=nearest(p,routes,r=>r.checkpoints[0]);
    const landmark=nearest(p,points.filter(v=>!record.visited.includes(v.id)),v=>[v.position[0],v.position[2]]);
    const trap=nearest(p,traps,t=>[t.x,t.z]);
    const target=active?{item:active.route,distance:d(p,...active.route.checkpoints[active.index]),point:active.route.checkpoints[active.index]}:route&&{...route,point:route.item.checkpoints[0]};
    return {active:active?{name:active.route.name,index:active.index,total:active.route.checkpoints.length,remaining:Math.max(0,active.route.limit-active.elapsed)}:null,target,landmark,trap,visited:record.visited.length,total:points.length,record,msg:notice>0?msg:""};
  }
  return {update,toggle,view,cancel,record};
}

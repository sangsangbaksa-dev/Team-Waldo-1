import { paths } from "./levels.mjs";
export const recordings = [
  [{title:"01 / 야간 점검",text:"03:17. 환기구에서 내 발소리가 한 박자 늦게 돌아왔다."},{title:"02 / 결번 채널",text:"전원이 끊겼는데 4번 채널만 녹음 중이었다. 배선을 뽑아도 멈추지 않는다."}],
  [{title:"03 / 수신 불가",text:"72.4 MHz. 누군가 내 이름 대신 방 번호를 반복한다."},{title:"04 / 무응답",text:"송신을 끊었더니 수신기 뒤에서 같은 숨소리가 들렸다."}],
  [{title:"05 / 두 번째 발자국",text:"테이프에는 내가 걷기 2초 전에 이미 발소리가 들어 있다."},{title:"06 / 편집 금지",text:"무음 부분을 잘라내자 파형이 살아 움직였다. 다시 이어 붙였다."}],
  [{title:"07 / 마지막 근무자",text:"마스터 채널의 위상을 뒤집자 모든 벽에서 같은 소리가 났다."},{title:"08 / 퇴실 기록",text:"출구 센서는 한 명이 나갔다고 기록했다. 마이크에는 여전히 두 명이 있다."}],
];
export function cleanArchive(value) {
  return Array.isArray(value) ? [...new Set(value.filter(id => Number.isInteger(id) && id >= 0 && id < recordings.length * 2))] : [];
}
export function archiveCells(level) {
  const occupied = [level.start,level.exit,level.nest,...level.items];
  const distances = occupied.map(cell => paths(level.map,cell).dist);
  const selected = [];
  for(let i=0;i<2;i++) {
    let best=-1,score=-1;
    for(const cell of level.reachable) {
      if(occupied.includes(cell)||selected.includes(cell)) continue;
      const d=Math.min(...distances.map(tree=>tree[cell]));
      if(d>score){score=d;best=cell;}
    }
    if(best<0) break;
    selected.push(best);
    distances.push(paths(level.map,best).dist);
  }
  return selected;
}
export const incidents = [
  {kind:"knock",caption:"벽 너머에서 세 번 두드리는 소리가 난다.",duration:2.7},
  {kind:"drop",caption:"환풍기 소리가 갑자기 끊겼다.",duration:3.2},
  {kind:"tape",caption:"수신기에 알 수 없는 신호가 들어온다.",duration:2.8},
  {kind:"breath",caption:"가까운 곳에서 숨소리가 들린다.",duration:2.5},
  {kind:"echo",caption:"발걸음을 멈췄는데 복도에선 계속 걷는 소리가 난다.",duration:3.4},
  {kind:"relay",caption:"전원이 끊긴 회로에서 릴레이가 딸깍인다.",duration:2.9},
];
export function createDread(random=Math.random,chapter=0){
  const stage=Math.max(0,Math.min(3,Math.floor(chapter)||0));
  const available=[0,1,2,3,...(stage>=1?[4]:[]),...(stage>=2?[5]:[])];
  let wait=22-stage*2, previous=-1, event=null, age=0;
  return {tick(dt,eligible){
    if(!Number.isFinite(dt)||dt<=0) return null;
    if(event){
      age+=dt;
      if(age<event.duration) return {...event,age,started:false};
      // Count only the portion of this tick after the prior incident ended.
      dt=age-event.duration;
      event=null;wait=18-stage*2+random()*17;
    }
    wait=Math.max(0,wait-dt);
    if(wait>0||!eligible) return null;
    let index=Math.min(available.length-1,Math.max(0,Math.floor(random()*available.length)));
    if(available[index]===previous) index=(index+1)%available.length;
    previous=available[index];event=incidents[previous];age=0;
    return {...event,age,started:true};
  }};
}

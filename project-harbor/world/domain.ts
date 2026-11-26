export const CHUNK = 128;
export const WIDTH = 3072;
export const DEPTH = 2048;
export const HIGHWAYS = [1088, 2112] as const;
export const CROSS_HIGHWAY = 1088;
export type District = 'forest' | 'city' | 'rich' | 'desert' | 'slum' | 'base';
export const DISTRICTS: ReadonlyArray<{ id: District; name: string; color: number; x: number; z: number }> = [
  {id:'forest', name:'노스우드 숲', color:0x496748, x:512,z:512},
  {id:'city', name:'캘러웨이 도심', color:0x777b79, x:1536,z:512},
  {id:'rich', name:'크레스트힐 부촌', color:0x789468, x:2560,z:512},
  {id:'desert', name:'레드메사 사막', color:0xb99463, x:512,z:1536},
  {id:'slum', name:'사우스야드 빈민가', color:0x8a7867, x:1536,z:1536},
  {id:'base', name:'포트 아이언 군사기지', color:0x777c59, x:2560,z:1536},
];
export function districtAt(x:number,z:number) {
  const column = Math.max(0,Math.min(2,Math.floor(x/1024)));
  return DISTRICTS[column+(z>=1024?3:0)]!;
}
export function roadHalf(axis:'x'|'z', center:number):number {
  if(center < 0 || center >= (axis==='x'?WIDTH:DEPTH)) return 0;
  if(axis==='x'?HIGHWAYS.some(v=>v===center):center===CROSS_HIGHWAY) return 15;
  return center%256===64?6:0;
}
export function roadDistance(x:number,z:number):number {
  const dx = Math.round((x-64)/256)*256+64;
  const dz = Math.round((z-64)/256)*256+64;
  return Math.min(roadHalf('x',dx)?Math.abs(x-dx)-roadHalf('x',dx):Infinity,
    roadHalf('z',dz)?Math.abs(z-dz)-roadHalf('z',dz):Infinity);
}
export function terrainHeight(x:number,z:number):number {
  const id=districtAt(x,z).id;
  const amp=id==='forest'?8:id==='desert'?5:id==='rich'?3:0;
  // Smooth the transition between districts and flatten road shoulders.
  const edge=Math.min(x%1024,1024-x%1024,z%1024,1024-z%1024);
  const blend=Math.max(0,Math.min(1,edge/45,(roadDistance(x,z)-3)/28));
  if(amp===0||blend===0)return 0;
  return amp*blend*(Math.sin(x*.023)*Math.cos(z*.018)*.65+Math.sin((x+z)*.011)*.35);
}
export function randomFor(cx:number,cz:number) {
  let s=(Math.imul(cx+1,73856093)^Math.imul(cz+1,19349663)^0x5379a14)>>>0;
  return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
}
export type PropKind='tree'|'rock'|'tower'|'house'|'shack'|'hangar'|'crate'|'lamp'|'cactus';
export interface WorldProp {kind:PropKind;x:number;z:number;w:number;d:number;h:number;color:number}
export function propsFor(cx:number,cz:number):WorldProp[] {
  const rand=randomFor(cx,cz), id=districtAt(cx*CHUNK+64,cz*CHUNK+64).id;
  const props:WorldProp[]=[];
  const counts={forest:45,desert:18,city:19,rich:14,slum:27,base:13};
  for(let i=0;i<counts[id]*5 && props.length<counts[id];i++){
    const x=cx*CHUNK+12+rand()*104,z=cz*CHUNK+12+rand()*104;
    let kind:PropKind,w:number,d:number,h:number,color:number;
    switch(id){
      case 'forest': kind=rand()<.87?'tree':'rock';w=kind==='tree'?2.4:3;d=w;h=kind==='tree'?8+rand()*9:1+rand()*2;color=kind==='tree'?0x355a39:0x777d71;break;
      case 'desert':kind=rand()<.65?'cactus':'rock';w=2+rand()*2;d=w;h=kind==='cactus'?2+rand()*3:1+rand()*3;color=kind==='cactus'?0x627e45:0xa47e50;break;
      case 'city':kind='tower';w=9+rand()*8;d=9+rand()*8;h=14+rand()*60;color=[0x76858d,0x999c96,0x536a77][Math.floor(rand()*3)]!;break;
      case 'rich':kind=rand()<.25?'tree':'house';w=kind==='tree'?2:11+rand()*7;d=w;h=kind==='tree'?8:6+rand()*4;color=kind==='tree'?0x416b40:0xe1d4b8;break;
      case 'slum':kind=rand()<.18?'crate':'shack';w=kind==='crate'?2.5:5+rand()*5;d=w;h=kind==='crate'?2.5:3+rand()*5;color=[0x876a54,0xa48a70,0x646c6b][Math.floor(rand()*3)]!;break;
      case 'base':kind=rand()<.3?'crate':'hangar';w=kind==='crate'?3:14+rand()*8;d=w;h=kind==='crate'?3:6+rand()*5;color=kind==='crate'?0x625b42:0x858a69;break;
    }
    if(roadDistance(x,z)<Math.max(w,d)/2+3 || x-w/2<cx*CHUNK+2 || x+w/2>(cx+1)*CHUNK-2 || z-d/2<cz*CHUNK+2 || z+d/2>(cz+1)*CHUNK-2)continue;
    if(props.some(p=>Math.abs(p.x-x)<(p.w+w)/2+2&&Math.abs(p.z-z)<(p.d+d)/2+2))continue;
    props.push({kind,x,z,w,d,h,color});
  }
  return props;
}
export function blocked(x:number,z:number,props:readonly WorldProp[],radius=.65){
  return props.some(p=>Math.abs(x-p.x)<p.w/2+radius&&Math.abs(z-p.z)<p.d/2+radius);
}

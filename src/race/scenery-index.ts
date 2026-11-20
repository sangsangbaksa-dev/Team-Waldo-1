import type { Track } from './track';
/** Stable seed from the actual circuit, not the global animation RNG. */
export function artSeed(t:Track):number{
  let h=0x811c9dc5;
  for(let i=0;i<t.n;i+=Math.max(1,Math.floor(t.n/48))){
    h=Math.imul(h^Math.round(t.x[i]*10),16777619);
    h=Math.imul(h^Math.round(t.y[i]*10),16777619);
    h=Math.imul(h^Math.round(t.z[i]*10),16777619);
  }
  return (h^t.n)>>>0;
}
/** Spatial lookup preserves the exact elevated-road clearance test. */
export class ClearanceIndex{
  private readonly cells=new Map<string,number[]>();private readonly cell=80;private extra=0;
  constructor(private readonly track:Track){
    for(let i=0;i<track.n;i++){
      const key=this.key(Math.floor(track.x[i]/this.cell),Math.floor(track.z[i]/this.cell));
      const list=this.cells.get(key)??[];list.push(i);this.cells.set(key,list);
      this.extra=Math.max(this.extra,Math.max(0,track.y[i]*2.4-2));
    }
  }
  private key(x:number,z:number):string{return x+':'+z;}
  isClear(x:number,z:number,need:number):boolean{
    const t=this.track,r=Math.max(0,need+this.extra);
    for(let cz=Math.floor((z-r)/this.cell);cz<=Math.floor((z+r)/this.cell);cz++)for(let cx=Math.floor((x-r)/this.cell);cx<=Math.floor((x+r)/this.cell);cx++){
      const list=this.cells.get(this.key(cx,cz));if(!list)continue;
      for(const j of list){const d=need+Math.max(0,t.y[j]*2.4-2);if(d>0&&(t.x[j]-x)**2+(t.z[j]-z)**2<d*d)return false;}
    }
    return true;
  }
}

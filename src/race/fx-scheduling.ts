/** Fixed-rate arcade effects across 20–144 Hz, with a burst cap on slow frames. */
export type FxChannel='nitro'|'tireL'|'tireR'|'driftL'|'driftR'|'wall'|'draft';
export class FxScheduler {
  private readonly residue:Record<FxChannel,number>={nitro:0,tireL:0,tireR:0,driftL:0,driftR:0,wall:0,draft:0};
  take(channel:FxChannel,rate:number,dt:number,maxBurst=10):number{
    if(!Number.isFinite(rate)||rate<=0){this.residue[channel]=0;return 0;}
    if(!Number.isFinite(dt)||dt<=0)return 0;
    const total=this.residue[channel]+rate*Math.min(0.1,dt);
    const result=Math.floor(total+1e-9);
    this.residue[channel]=Math.max(0,total-result);
    return Math.min(Math.max(0,Math.floor(maxBurst)),result);
  }
}
export function skidSegmentCount(distance:number,maxStep=3,maxJump=28):number{
  if(!Number.isFinite(distance)||distance<0.2||distance>maxJump||maxStep<=0)return 0;
  return Math.ceil(distance/maxStep);
}

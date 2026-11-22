import type { Vehicle } from './world';

/**
 * Keep only the nearest moving light sources without sorting the entire traffic fleet.
 * The supplied output array is reused by the renderer each frame.
 */
export function nearbyVehicleLights<T extends Pick<Vehicle,'alive'|'driver'|'burn'|'x'|'y'>>(
  vehicles:readonly T[],x:number,z:number,radius:number,limit:number,out:T[]=[]
):T[]{
  out.length=0;
  if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(radius)||radius<=0||!Number.isFinite(limit)||limit<=0)return out;
  const radiusSq=radius*radius,n=Math.floor(limit);
  const dist=(v:T):number=>(v.x-x)**2+(v.y-z)**2;
  for(const v of vehicles){
    if(!v.alive||!v.driver||v.burn>0||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;
    const d=dist(v);if(d>radiusSq)continue;
    let i=out.length;
    while(i>0&&d<dist(out[i-1]))i--;
    if(i>=n)continue;
    out.splice(i,0,v);
    if(out.length>n)out.pop();
  }
  return out;
}
/** Poisson per-frame rate: smoke density is independent of screen refresh rate. */
export function frameEmissionChance(perSecond:number,dt:number):number{
  if(!Number.isFinite(perSecond)||!Number.isFinite(dt)||perSecond<=0||dt<=0)return 0;
  return 1-Math.exp(-perSecond*Math.min(dt,0.1));
}

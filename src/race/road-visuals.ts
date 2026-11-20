import type { Quality } from '../city/interiorkit';
/** Keep low quality on the original unlit road. Wetness only changes rendering. */
export function wetRoadFinish(rain:number|undefined,quality:Quality):{specular:number;shininess:number}|null{
  const wet=Math.min(1,Math.max(0,rain??0));if(quality==='low'||wet<=0)return null;
  return {specular:0.18+wet*0.27,shininess:20+wet*30};
}
export function sprayRate(speed:number,rain:number,low:boolean):number{
  const wet=Math.max(0,Math.min(1,rain)),fast=Math.max(0,Math.min(1,(speed-5)/55));
  return wet*fast*(low?24:64);
}
/** Fractional emission makes spray density independent of rendering frame rate. */
export function emissionStep(carry:number,rate:number,dt:number):{count:number;carry:number}{
  const total=Math.max(0,Math.min(1,carry))+Math.max(0,rate)*Math.max(0,Math.min(dt,0.1));
  const count=Math.floor(total+1e-9);
  return {count,carry:Math.max(0,total-count)};
}

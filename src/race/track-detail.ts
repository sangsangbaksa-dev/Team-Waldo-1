import type { Track } from './track';
/** Bounded marker density independent of spline sample spacing. */
export function reflectorIndices(n: number, ds: number, low: boolean): number[] {
  if (n < 1 || !Number.isFinite(ds) || ds <= 0) return [];
  const stride = Math.max(1,Math.ceil((low?48:24)/ds),Math.ceil(n/240));
  const out: number[] = []; for(let i=0;i<n;i+=stride) out.push(i); return out;
}
/** Brake light visual response based on deceleration, including remote cars. */
export function brakeGlow(previous: number, acceleration: number, dt: number, speed: number): number {
  const target = speed>2 && Number.isFinite(acceleration)?Math.min(1,Math.max(0,(-acceleration-3)/12)):0;
  return previous+(target-previous)*(1-Math.exp(-Math.max(0,dt)*(target>previous?16:6)));
}
/** The grid paint is laid on the local sloped road plane (triangle list). */
export function gridPaint(t: Track, slots: ReadonlyArray<readonly [number,number]>): number[] {
  const out: number[] = [];
  for (const [idx,lat] of slots) {
    const i=((idx%t.n)+t.n)%t.n;
    const p=(u:number,v:number):number[]=>[t.x[i]+t.tx[i]*u-t.tz[i]*(lat+v),t.y[i]+Math.tan(t.pitch[i])*u+0.09,t.z[i]+t.tz[i]*u+t.tx[i]*(lat+v)];
    const quad=(a:number,b:number,c:number,d:number):void=>{const p0=p(a,c),p1=p(b,c),p2=p(b,d),p3=p(a,d);out.push(...p0,...p1,...p2,...p0,...p2,...p3);};
    const w=Math.min(1.5,t.halfWidth-Math.abs(lat)-0.15); if(w<=0)continue;
    // U-shaped stall marking, open towards the start line.
    quad(-2.5,-2.33,-w,w); quad(-2.5,0.3,-w,-w+0.14); quad(-2.5,0.3,w-0.14,w);
  }
  return out;
}

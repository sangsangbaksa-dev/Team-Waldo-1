/** Defensive input normalization used by both first-person and vehicle controls. */
export function safeMoveAxis(value:number):number{
  return Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;
}
export function safeAimAngle(ax:number,ay:number,x:number,y:number,current:number):number{
  if(![ax,ay,x,y].every(Number.isFinite))return current;
  const dx=ax-x,dy=ay-y;
  return dx===0&&dy===0?current:Math.atan2(dy,dx);
}

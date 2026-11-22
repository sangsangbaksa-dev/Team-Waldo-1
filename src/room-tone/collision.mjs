/** Grid-space collision is independent of the WebGL render loop. */
function walkablePoint(map,tile,x,z) {
  const col=Math.floor(x/tile+0.5),row=Math.floor(z/tile+0.5);
  return map[row]?.[col]===".";
}
export function canOccupy(map,tile,x,z,radius=0.225) {
  if(!(tile>0 && radius>=0) || !Number.isFinite(x) || !Number.isFinite(z))
    return false;
  return walkablePoint(map,tile,x-radius,z-radius) &&
    walkablePoint(map,tile,x+radius,z-radius) &&
    walkablePoint(map,tile,x-radius,z+radius) &&
    walkablePoint(map,tile,x+radius,z+radius);
}
/** Resolve X then Z independently so sliding along walls stays natural. */
export function moveWithCollision(map,tile,position,dx,dz,radius=0.225) {
  if(canOccupy(map,tile,position.x+dx,position.z,radius)) position.x+=dx;
  if(canOccupy(map,tile,position.x,position.z+dz,radius)) position.z+=dz;
}
/** Sample the same 0.42-unit interval as the original enemy sight test. */
export function lineOfSight(map,tile,a,b) {
  const len=Math.hypot(a.x-b.x,a.z-b.z),steps=Math.ceil(len/0.42);
  for(let i=1;i<steps;i++){
    const t=i/steps;
    if(!walkablePoint(map,tile,a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t))
      return false;
  }
  return true;
}

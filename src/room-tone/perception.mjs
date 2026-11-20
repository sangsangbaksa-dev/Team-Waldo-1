export function enemyPerception({distance,visible,facing,lightOn,running,crouched,moving,corridorDistance}) {
  // Close-range awareness is omnidirectional; the farther away, the more direction matters.
  const visualRange=lightOn?10.7:6.1;
  const sight=visible && distance<=visualRange && (distance<=2.4 || facing>=-0.12);
  const hearRange=running?14:crouched?1.6:4.7;
  const acousticDistance=visible?distance:corridorDistance*1.35;
  const heard=moving && acousticDistance<hearRange;
  return {sight,heard};
}

export function cellDistance(distance,cellSize) {
  return Number.isFinite(distance)&&distance>=0?Math.max(0,distance-1)*cellSize:Infinity;
}

export function patrolGoal(reachable,distances,anchor,start,avoid,random=Math.random) {
  // Use corridor distances, not Euclidean gaps through solid walls.
  let viable=reachable.filter(id=>id!==anchor&&id!==start&&id!==avoid&&distances[id]>=3&&distances[id]<=12);
  if(!viable.length) viable=reachable.filter(id=>id!==anchor&&id!==start&&id!==avoid&&distances[id]>0);
  return viable[Math.min(viable.length-1,Math.max(0,Math.floor(random()*viable.length)))]??anchor;
}

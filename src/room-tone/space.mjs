export function exitWall(map,cell){
  const width=map[0]?.length??0;
  if(!width||!Number.isInteger(cell)||cell<0||cell>=width*map.length)return null;
  const col=cell%width,row=Math.floor(cell/width);
  if(map[row]?.[col]!==".")return null;
  return [[0,-1],[0,1],[-1,0],[1,0]].find(([dx,dz])=>map[row+dz]?.[col+dx]==="#")??null;
}

export function propBlocks(x,z,r,rootX,rootZ,rotation,halfWidth,halfDepth){
  const dx=x-rootX,dz=z-rootZ,cos=Math.cos(rotation),sin=Math.sin(rotation);
  // Transform the circular player footprint into the equipment's local frame.
  const lx=dx*cos-dz*sin,lz=dx*sin+dz*cos;
  const sx=Math.max(0,Math.abs(lx)-halfWidth),sz=Math.max(0,Math.abs(lz)-halfDepth);
  return sx*sx+sz*sz<r*r;
}

export function bindCollisionObstacles(items){
  return items.filter(item=>item.collision).map(({root,collision})=>({
    x:root.position.x,
    z:root.position.z,
    ry:root.rotation.y,
    halfWidth:collision.halfWidth,
    halfDepth:collision.halfDepth,
    get visible(){return root.visible;},
  }));
}

export function clearanceAllows(x,z,oldX,oldZ,r,obstacles){
  for(const o of obstacles){
    if(!o.visible)continue;
    if(Math.abs(x-o.x)>1.1||Math.abs(z-o.z)>1.1)continue;
    if(!propBlocks(x,z,r,o.x,o.z,o.ry,o.halfWidth,o.halfDepth))continue;
    // A resumed or pre-existing overlapping save may move outward, never deeper.
    const wasBlocked=propBlocks(oldX,oldZ,r,o.x,o.z,o.ry,o.halfWidth,o.halfDepth);
    if(!wasBlocked||Math.hypot(x-o.x,z-o.z)<=Math.hypot(oldX-o.x,oldZ-o.z))return false;
  }
  return true;
}

export function doorMotion(elapsed,duration=1.65){
  const t=Number.isFinite(elapsed)&&Number.isFinite(duration)&&duration>0?Math.max(0,Math.min(1,elapsed/duration)):0;
  const slide=Math.max(0,Math.min(1,(t-.12)/.72));
  const fade=Math.max(0,Math.min(1,(t-.70)/.30));
  return {progress:slide*slide*(3-2*slide),fade:fade*fade*(3-2*fade),done:t>=1};
}

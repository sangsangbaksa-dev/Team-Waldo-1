import type { War } from './war';
import { getMap, type MapId } from './maps';

export interface MapPosition { x:number; z:number; }
export type StrategicTarget =
 | {kind:'outpost';id:number}
 | {kind:'faction';id:number};

/** Same world-to-minimap transform is used for drawing and hit detection. */
export function worldToMinimap(x:number,z:number,size=200,mapId:MapId='classic'):{x:number;y:number}{
 const half=getMap(mapId).halfSize;
 return {x:(x/half+1)*size/2,y:(z/half+1)*size/2};
}
export function minimapToWorld(x:number,y:number,width:number,height:number,mapId:MapId='classic'):MapPosition{
 const half=getMap(mapId).halfSize;
 if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)
   return {x:0,z:0};
 return {
  x:Math.max(-half,Math.min(half,(x/width*2-1)*half)),
  z:Math.max(-half,Math.min(half,(y/height*2-1)*half)),
 };
}
/** Shift-click on an objective to send the standing army there. */
export function pickMapTarget(w:War,owner:number,x:number,z:number):StrategicTarget|null {
 if(!Number.isFinite(x)||!Number.isFinite(z)||!w.factions[owner]?.alive)return null;
 let best:StrategicTarget|null=null,distance=Infinity;
 for(const f of w.factions){
  if(!f.alive||f.id===owner)continue;
  const d=Math.hypot(f.x-x,f.z-z);
  if(d<=18&&d<distance){best={kind:'faction',id:f.id};distance=d;}
 }
 for(const p of w.outposts){
  const d=Math.hypot(p.x-x,p.z-z);
  if(d<=16&&d<distance){best={kind:'outpost',id:p.id};distance=d;}
 }
 return best;
}

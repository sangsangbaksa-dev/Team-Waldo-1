import {CHUNK,WIDTH,DEPTH,blocked,propsFor,terrainHeight,type WorldProp} from './domain';
export interface ChunkData {cx:number;cz:number;props:WorldProp[];lod:0|1}
export interface ChunkView {load(chunk:ChunkData):void;unload(key:string):void}
export const chunkKey=(x:number,z:number)=>x+':'+z;
export class World {
  x=1536; z=576; yaw=0; hours=10;
  private readonly cache=new Map<string,WorldProp[]>();
  private readonly loaded=new Map<string,0|1>();
  constructor(private readonly view:ChunkView) {}
  private props(cx:number,cz:number){
    const key=chunkKey(cx,cz);
    let props=this.cache.get(key);
    if(!props){props=propsFor(cx,cz);this.cache.set(key,props);}
    return props;
  }
  private free(x:number,z:number){
    if(x<2||z<2||x>WIDTH-2||z>DEPTH-2)return false;
    const cx=Math.floor(x/CHUNK),cz=Math.floor(z/CHUNK);
    for(let i=Math.max(0,cx-1);i<=Math.min(WIDTH/CHUNK-1,cx+1);i++)
      for(let j=Math.max(0,cz-1);j<=Math.min(DEPTH/CHUNK-1,cz+1);j++)
        if(blocked(x,z,this.props(i,j)))return false;
    return true;
  }
  move(forward:number,side:number,seconds:number,sprint:boolean){
    const dt=Math.max(0,Math.min(.05,seconds));
    const length=Math.max(1,Math.hypot(forward,side));
    const speed=(sprint?27:11)*dt/length;
    const dx=(Math.sin(this.yaw)*forward+Math.cos(this.yaw)*side)*speed;
    const dz=(-Math.cos(this.yaw)*forward+Math.sin(this.yaw)*side)*speed;
    if(this.free(this.x+dx,this.z))this.x+=dx;
    if(this.free(this.x,this.z+dz))this.z+=dz;
    this.hours=(this.hours+dt*24/720)%24;
  }
  get y(){return terrainHeight(this.x,this.z);}
  get activeChunks(){return this.loaded.size;}
  stream(budget=2){
    const cx=Math.floor(this.x/CHUNK),cz=Math.floor(this.z/CHUNK);
    const wanted=new Map<string,ChunkData>();
    for(let r=0;r<=3;r++)for(let i=cx-r;i<=cx+r;i++)for(let j=cz-r;j<=cz+r;j++){
      if(Math.max(Math.abs(i-cx),Math.abs(j-cz))!==r||i<0||j<0||i>=WIDTH/CHUNK||j>=DEPTH/CHUNK)continue;
      wanted.set(chunkKey(i,j),{cx:i,cz:j,props:this.props(i,j),lod:r<=1?0:1});
    }
    for(const key of this.loaded.keys())if(!wanted.has(key)){this.view.unload(key);this.loaded.delete(key);}
    for(const [key,chunk] of wanted){
      if(this.loaded.get(key)===chunk.lod)continue;
      if(budget<=0)break;
      if(this.loaded.has(key))this.view.unload(key);
      this.view.load(chunk);this.loaded.set(key,chunk.lod);budget--;
    }
    // Collision geometry is deterministic; old descriptions can be regenerated.
    for(const key of this.cache.keys())if(!wanted.has(key))this.cache.delete(key);
  }
}

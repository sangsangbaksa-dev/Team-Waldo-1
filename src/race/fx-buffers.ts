/** Typed-buffer helpers avoid per-particle JS array allocations during heavy rain. */
export function writeVec3(buffer: Float32Array,slot: number,x:number,y:number,z:number):void{
  const i=slot*3;buffer[i]=x;buffer[i+1]=y;buffer[i+2]=z;
}
export function writeSpeedStreak(buffer:Float32Array,slot:number,x:number,y:number,z:number,dx:number,dz:number,length:number):void{
  const i=slot*6;buffer[i]=x;buffer[i+1]=y;buffer[i+2]=z;
  buffer[i+3]=x+dx*length;buffer[i+4]=y;buffer[i+5]=z+dz*length;
}
export function streakDirection(vx:number,vz:number):{x:number;z:number}{
  if(!Number.isFinite(vx)||!Number.isFinite(vz))return {x:1,z:0};
  const length=Math.hypot(vx,vz);
  return length>1e-6?{x:vx/length,z:vz/length}:{x:1,z:0};
}

/** Avoid uploading hundreds of line vertices while the player is parked. */
export function speedStreakVisible(speed:number,opacity:number):boolean{
  return Number.isFinite(speed)&&Number.isFinite(opacity)&&(speed>26||opacity>0.01);
}

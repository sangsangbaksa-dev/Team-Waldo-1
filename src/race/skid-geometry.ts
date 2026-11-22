/** Write two triangles for one tire mark directly into the preallocated GPU buffers. */
export function writeSkidQuad(
  positions:Float32Array,colors:Float32Array,slot:number,
  ax:number,ay:number,az:number,bx:number,by:number,bz:number,
  halfX:number,halfZ:number,alpha:number
):void{
  const i=slot*18;
  positions[i]=ax-halfX;positions[i+1]=ay;positions[i+2]=az-halfZ;
  positions[i+3]=ax+halfX;positions[i+4]=ay;positions[i+5]=az+halfZ;
  positions[i+6]=bx-halfX;positions[i+7]=by;positions[i+8]=bz-halfZ;
  positions[i+9]=ax+halfX;positions[i+10]=ay;positions[i+11]=az+halfZ;
  positions[i+12]=bx+halfX;positions[i+13]=by;positions[i+14]=bz+halfZ;
  positions[i+15]=bx-halfX;positions[i+16]=by;positions[i+17]=bz-halfZ;
  for(let j=slot*24,end=j+24;j<end;j+=4){
    colors[j]=0.02;colors[j+1]=0.02;colors[j+2]=0.03;colors[j+3]=alpha;
  }
}

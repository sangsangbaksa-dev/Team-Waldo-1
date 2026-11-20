// Localized ground glows adapted from OUTLAW CITY's instanced lamp pools.
// One instanced draw per scene, no extra dynamic lights or shadows.
import * as THREE from 'three';
export function nearVisual(x:number,z:number,cx:number,cz:number,r:number):boolean{return (x-cx)**2+(z-cz)**2<=r*r;}
export function lightRange(max:number,blocked:(distance:number)=>boolean):number{
  const steps=12;
  for(let i=0;i<=steps;i++){const d=max*i/steps;if(blocked(d))return Math.max(0,d-max/steps);}
  return max;
}
/** Soft elliptical coverage; low edge values avoid sharp borders. */
export function lightMask(size:number):Uint8Array{
  const a=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=(x+0.5)/size*2-1,v=(y+0.5)/size*2-1,k=(y*size+x)*4;
    const r=u*u+v*v, w=Math.max(0,1-r);
    a[k]=a[k+1]=a[k+2]=255;a[k+3]=Math.round(255*w*w*w);
  }
  return a;
}
export class RoadLightBatch {
  private geo=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2);
  private tex=new THREE.DataTexture(lightMask(48),48,48,THREE.RGBAFormat);
  private mat:THREE.MeshBasicMaterial;
  private mesh:THREE.InstancedMesh;
  private d=new THREE.Object3D();private color=new THREE.Color();
  constructor(private scene:THREE.Scene,private capacity:number){
    this.tex.magFilter=THREE.LinearFilter;this.tex.minFilter=THREE.LinearFilter;this.tex.needsUpdate=true;
    this.mat=new THREE.MeshBasicMaterial({map:this.tex,color:0xffffff,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,toneMapped:false});
    this.mesh=new THREE.InstancedMesh(this.geo,this.mat,Math.max(1,capacity));
    this.mesh.count=0;this.mesh.frustumCulled=false;this.mesh.renderOrder=2;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(this.mesh);
  }
  get remaining():number{return this.capacity-this.mesh.count;}
  begin():void{this.mesh.count=0;}
  add(x:number,y:number,z:number,heading:number,length:number,width:number,color:number,power:number,pitch=0):void{
    if(this.remaining<=0||power<=0||length<=0||width<=0)return;
    this.d.position.set(x,y,z);this.d.rotation.set(0,-heading,pitch,'YXZ');this.d.scale.set(length,1,width);this.d.updateMatrix();
    const i=this.mesh.count++;this.mesh.setMatrixAt(i,this.d.matrix);this.mesh.setColorAt(i,this.color.setHex(color).multiplyScalar(Math.min(1,power)));
  }
  end():void{this.mesh.visible=this.mesh.count>0;this.mesh.instanceMatrix.needsUpdate=true;if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;}
  dispose():void{this.scene.remove(this.mesh);this.mesh.dispose();this.geo.dispose();this.tex.dispose();this.mat.dispose();}
}

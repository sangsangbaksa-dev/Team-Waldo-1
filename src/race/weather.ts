// ZERO ZONE weatherfx.ts의 선분 비 표현을 SPEED RUSH 추적 카메라에 맞게 이식.
import * as THREE from 'three';

export const wrapRain = (v: number, span: number): number => ((v % span) + span) % span;
export class RaceRain {
  readonly mesh: THREE.LineSegments;
  private offsets: Float32Array;
  private points: Float32Array;
  constructor(private count: number) {
    this.offsets=new Float32Array(count*3);this.points=new Float32Array(count*6);
    let seed=311;
    const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<count;i++){this.offsets[i*3]=rng()*84;this.offsets[i*3+1]=rng()*28;this.offsets[i*3+2]=rng()*84;}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(this.points,3).setUsage(THREE.DynamicDrawUsage));
    this.mesh=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0xc3d9ef,transparent:true,opacity:.32,depthWrite:false}));
    this.mesh.frustumCulled=false;
  }
  update(dt:number,cam:THREE.Vector3,density:number):void{
    const n=Math.min(this.count,Math.max(0,Math.floor(this.count*density)));
    this.mesh.geometry.setDrawRange(0,n*2);this.mesh.visible=n>0;if(!n)return;
    const o=this.offsets,p=this.points;
    for(let i=0;i<n;i++){
      const k=i*3,j=i*6;
      o[k+1]=wrapRain(o[k+1]-dt*(34+i%9),28);
      const x=cam.x+wrapRain(o[k]-cam.x+42,84)-42,z=cam.z+wrapRain(o[k+2]-cam.z+42,84)-42,y=cam.y-9+o[k+1];
      const len=.7+(i%5)*.15;
      p[j]=x;p[j+1]=y;p[j+2]=z;p[j+3]=x+.12;p[j+4]=y+len;p[j+5]=z+.07;
    }
    this.mesh.geometry.attributes.position.needsUpdate=true;
  }
}

import * as T from 'three';
import type { Ride } from './traffic';

const X = new T.Vector3(1, 0, 0);
const Y = new T.Vector3(0, 1, 0);
const RADIUS = .34;
export function wheelAdvance(angle: number, speed: number, dt: number, radius = RADIUS): number {
  return (angle + speed * Math.min(.1, Math.max(0, dt)) / radius) % (Math.PI * 2);
}

export interface MotorcycleVisual {
  root: T.Group;
  steering: T.Group;
  wheels: T.Group[];
  brake: T.MeshStandardMaterial;
  angle: number;
}

export class MotorcycleParts {
  private readonly geometries = new Set<T.BufferGeometry>();
  private readonly materials = new Set<T.Material>();
  private readonly unit = this.geo(new T.BoxGeometry(1, 1, 1));
  private readonly sphere = this.geo(new T.SphereGeometry(1, 24, 16));
  private readonly rod = this.geo(new T.CylinderGeometry(1, 1, 1, 16));
  private readonly tire = this.geo(new T.LatheGeometry([
    [.20,-.085],[.27,-.086],[.32,-.065],[.34,-.032],[.34,.032],
    [.32,.065],[.27,.086],[.20,.085],[.20,-.085],
  ].map(([r,y])=>new T.Vector2(r!,y!)),32));
  private readonly rim = this.geo(new T.TorusGeometry(.215,.016,8,32).rotateY(Math.PI/2));
  private readonly rubber = this.mat(0x1b1c1c,.92);
  private readonly dark = this.mat(0x24282b,.64,.2);
  private readonly alloy = this.mat(0x989da1,.32,.68);
  private readonly chrome = this.mat(0xc2c6c8,.26,.75);
  private readonly leather = this.mat(0x202123,.95);
  private readonly headlamp = this.mat(0xe9ebdf,.24,.1,0xfff1d3);
  private readonly reflector = this.mat(0xc47b28,.42,.05,0x8a4d10);
  private geo(g: T.BufferGeometry) { this.geometries.add(g); return g; }
  private mat(color:number,roughness:number,metalness=0,emissive=0) {
    const m=new T.MeshStandardMaterial({color,roughness,metalness,emissive});this.materials.add(m);return m;
  }

  create(paint: T.Material): MotorcycleVisual {
    const root = new T.Group();
    const mesh = (parent:T.Group,g:T.BufferGeometry,m:T.Material,x:number,y:number,z:number,sx=1,sy=1,sz=1) => {
      const o=new T.Mesh(g,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);parent.add(o);return o;
    };
    const box=(p:T.Group,m:T.Material,x:number,y:number,z:number,w:number,h:number,d:number)=>mesh(p,this.unit,m,x,y,z,w,h,d);
    const oval=(p:T.Group,m:T.Material,x:number,y:number,z:number,w:number,h:number,d:number)=>mesh(p,this.sphere,m,x,y,z,w,h,d);
    const bar=(p:T.Group,m:T.Material,a:number[],b:number[],r:number)=>{
      const v=new T.Vector3(...a as [number,number,number]),w=new T.Vector3(...b as [number,number,number]);
      const delta=w.clone().sub(v),center=v.add(w).multiplyScalar(.5);
      const o=mesh(p,this.rod,m,center.x,center.y,center.z,r,delta.length(),r);
      o.quaternion.setFromUnitVectors(Y,delta.normalize());return o;
    };
    const axle=(p:T.Group,m:T.Material,x:number,y:number,z:number,r:number,w:number)=>{
      const o=mesh(p,this.rod,m,x,y,z,r,w,r);o.quaternion.setFromUnitVectors(Y,X);return o;
    };
    const wheel=(p:T.Group,x:number,y:number,z:number)=>{
      const spin=new T.Group();spin.position.set(x,y,z);p.add(spin);
      const tire=mesh(spin,this.tire,this.rubber,0,0,0);tire.rotation.z=Math.PI/2;
      for(const side of [-1,1]){
        mesh(spin,this.rim,this.chrome,side*.065,0,0);
        for(let i=0;i<5;i++){
          const a=i*Math.PI*2/5;
          bar(spin,this.alloy,[side*.048,Math.cos(a)*.045,Math.sin(a)*.045],[side*.063,Math.cos(a+.18)*.20,Math.sin(a+.18)*.20],.012);
        }
      }
      axle(spin,this.dark,0,0,0,.062,.17);axle(spin,this.alloy,.085,0,0,.14,.012);
      return spin;
    };
    const rear=wheel(root,0,RADIUS,-.76);
    const steering=new T.Group();steering.position.set(0,.96,.48);root.add(steering);
    const front=wheel(steering,0,RADIUS-.96,.76-.48);
    for(const side of [-1,1]){
      bar(steering,this.chrome,[side*.12,.02,0],[side*.12,-.53,.25],.028);
      bar(steering,this.alloy,[side*.12,-.30,.14],[side*.12,-.62,.28],.043);
      bar(root,this.dark,[side*.17,.59,-.13],[side*.12,.34,-.76],.044);
      bar(root,this.dark,[side*.16,.57,.32],[side*.18,.86,-.36],.035);
      bar(root,this.alloy,[side*.16,.72,-.33],[side*.12,.41,-.65],.028);
      bar(root,this.chrome,[side*.22,.37,-.12],[side*.22,.43,-.75],.042);
      oval(root,this.dark,side*.22,.43,-.67,.055,.055,.20);
      box(root,this.rubber,side*.26,.49,-.14,.17,.045,.09);
      box(steering,this.reflector,side*.16,-.28,.12,.025,.095,.045);
      bar(steering,this.dark,[side*.30,.20,-.01],[side*.35,.39,.01],.011);
      oval(steering,this.glassMaterial(),side*.35,.40,.01,.10,.04,.045);
    }
    const tank=oval(root,paint,0,.85,.08,.24,.22,.39);tank.rotation.x=-.09;
    oval(root,this.leather,0,.83,-.43,.20,.075,.37);
    oval(root,paint,0,.76,-.69,.22,.15,.34);
    oval(root,this.dark,0,.49,.05,.21,.21,.29);
    for(let i=0;i<5;i++)box(root,this.alloy,0,.41+i*.045,.07,.40,.015,.31);
    bar(steering,this.alloy,[-.29,.18,-.02],[.29,.18,-.02],.022);
    for(const side of [-1,1])bar(steering,this.rubber,[side*.24,.18,-.02],[side*.34,.18,-.02],.026);
    oval(steering,paint,0,-.26,.28,.13,.055,.30);
    oval(steering,this.dark,0,.02,.18,.155,.14,.10);
    oval(steering,this.headlamp,0,.02,.26,.132,.111,.045);
    const brake=new T.MeshStandardMaterial({color:0xb62220,emissive:0xff2218,emissiveIntensity:.45,roughness:.32});
    box(root,brake,0,.76,-.98,.20,.07,.04);
    box(root,this.dark,0,.62,-.96,.19,.17,.022);
    return {root,steering,wheels:[rear,front],brake,angle:0};
  }

  private mirror: T.Material | undefined;
  private glassMaterial(){return this.mirror??=this.mat(0x8297a4,.16,.7);}
  update(visual: MotorcycleVisual, ride: Ride, dt: number){
    const speed=ride.vx*Math.sin(ride.yaw)+ride.vz*Math.cos(ride.yaw);
    visual.angle=wheelAdvance(visual.angle,speed,dt);
    for(const wheel of visual.wheels)wheel.rotation.x=visual.angle;
    visual.steering.rotation.y=ride.steer*.34/(1+Math.abs(speed)*.07);
    visual.brake.emissiveIntensity=ride.impact>.05?1.1:.45;
  }
  dispose(){for(const g of this.geometries)g.dispose();for(const m of this.materials)m.dispose();}
}

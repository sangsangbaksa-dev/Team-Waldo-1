// SPEED RUSH — GLB 로딩 실패 시에도 사용할 수 있는 경량 스포츠카.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface FallbackCar { root: THREE.Group; wheels: THREE.Mesh[] }
export function makeFallbackCar(color: THREE.ColorRepresentation, accent: THREE.ColorRepresentation): FallbackCar {
  const root = new THREE.Group(), wheels: THREE.Mesh[] = [];
  // 정면 +X, 바닥 Y=0, 폭 약 2m. 차체·캐빈은 직접 만든 단면을 연결합니다.
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.48, roughness: 0.27 });
  const trim = new THREE.MeshStandardMaterial({ color: accent, metalness: 0.25, roughness: 0.38 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x172b3b, roughness: 0.13, metalness: 0.65 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x16181e, roughness: 0.9 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xa1aab8, roughness: 0.35, metalness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x232831, roughness: 0.6, metalness: 0.2 });
  const head = new THREE.MeshBasicMaterial({ color: 0xd7f5ff });
  const batch = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const add = (mat: THREE.Material, geo: THREE.BufferGeometry, x=0,y=0,z=0): void => {
    geo.translate(x,y,z); const list = batch.get(mat) ?? []; list.push(geo); batch.set(mat,list);
  };
  const box = (mat: THREE.Material,w:number,h:number,d:number,x:number,y:number,z:number):void => add(mat,new THREE.BoxGeometry(w,h,d),x,y,z);
  const shell = (rows: ReadonlyArray<readonly [number,number,number,number]>): THREE.BufferGeometry => {
    const pos:number[] = [], idx:number[] = [];
    for (const [x,w,b,t] of rows) pos.push(x,b,-w,x,b,w,x,t,w*0.91,x,t,-w*0.91);
    for(let i=0;i<rows.length-1;i++) for(let j=0;j<4;j++){
      const a=i*4+j,b=i*4+(j+1)%4,c=b+4,d=a+4; idx.push(a,d,b,b,d,c);
    }
    idx.push(0,1,2,0,2,3); const e=(rows.length-1)*4; idx.push(e,e+2,e+1,e,e+3,e+2);
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);
    const flat=g.toNonIndexed();g.dispose();flat.computeVertexNormals();return flat;
  };
  add(paint,shell([[-2.32,.83,.30,.64],[-1.72,1.00,.24,.83],[-.4,.98,.24,.96],[.7,.96,.24,.83],[1.85,.94,.27,.57],[2.3,.76,.32,.43]]));
  add(glass,shell([[-1.18,.68,.79,.87],[-.68,.66,.78,1.31],[.22,.65,.78,1.30],[.92,.59,.73,.80]]));
  box(paint,1.02,.07,1.21,-.22,1.29,0);
  for(const z of [-.91,.91]){
    box(dark,2.52,.11,.18,0,.29,z);
    box(trim,1.68,.07,.08,-.1,.41,z);
    box(dark,.34,.12,.23,.43,.99,z);
    box(head,.045,.13,.58,2.20,.48,z*.62);
  }
  box(dark,.12,.20,1.32,2.24,.31,0);
  box(dark,.12,.15,1.56,-2.26,.30,0);
  box(paint,.28,.08,1.89,-1.99,1.05,0);
  for(const z of [-.65,.65])box(dark,.10,.33,.12,-1.99,.89,z);
    for(const [mat,parts] of batch){
    const flat=parts.map(g=>{const out=g.index?g.toNonIndexed():g; if(out!==g)g.dispose();if(out.hasAttribute('uv'))out.deleteAttribute('uv');return out;});
    const geometry=mergeGeometries(flat);
    for(const p of flat)p.dispose();
    if(geometry)root.add(new THREE.Mesh(geometry,mat));
  }
  const tireGeo = new THREE.CylinderGeometry(.37,.37,.23,16); tireGeo.rotateX(Math.PI/2);
  const hubGeo = new THREE.CylinderGeometry(.22,.22,.025,12); hubGeo.rotateX(Math.PI/2);
  for(const x of [-1.43,1.42])for(const z of [-.99,.99]){
    const wheel=new THREE.Mesh(tireGeo,rubber);wheel.position.set(x,.37,z);
    const hub=new THREE.Mesh(hubGeo,metal);hub.position.z=Math.sign(z)*.12;wheel.add(hub);root.add(wheel);wheels.push(wheel);
  }
  return {root,wheels};
}

/* Compact 3D restoration equipment, with a consistent industrial design language.
 * The existing tile navigation and interaction ranges remain authoritative.
 */
export function buildStationArt(THREE, root, chapter, bright, dark, steel) {
  const rubber = new THREE.MeshStandardMaterial({ color:0x18201e, roughness:.94 });
  const enamel = new THREE.MeshStandardMaterial({ color:0x444d43, roughness:.66, metalness:.22 });
  const copper = new THREE.MeshStandardMaterial({ color:0xa5805b, roughness:.48, metalness:.55 });
  const amber = new THREE.MeshStandardMaterial({ color:0xf1b573, emissive:0xb57536, emissiveIntensity:.65, roughness:.52 });
  const glass = new THREE.MeshStandardMaterial({ color:0x14251f, roughness:.24, metalness:.15 });
  const boxGeo = new THREE.BoxGeometry(1,1,1);
  const knobGeo = new THREE.CylinderGeometry(1,1,1,16);
  const ringGeo = new THREE.TorusGeometry(1,.10,8,24);
  function piece(geo,mat,x,y,z,w,h,d,rx=0) {
    const mesh=new THREE.Mesh(geo,mat);
    mesh.position.set(x,y,z);
    mesh.scale.set(w,h,d);
    mesh.rotation.x=rx;
    root.add(mesh);
    return mesh;
  }
  const box=(mat,x,y,z,w,h,d,rx=0)=>piece(boxGeo,mat,x,y,z,w,h,d,rx);
  const dial=(mat,x,y,z,r,h)=>piece(knobGeo,mat,x,y,z,r,h,r,Math.PI/2);
  // Plinth, adjustable feet, steel folded-edge chassis.
  box(rubber,0,.045,0,.88,.09,.53);
  box(enamel,0,.49,0,.8,.88,.46);
  box(steel,0,.96,0,.91,.11,.55);
  for(const side of [-1,1]){
    box(steel,side*.375,.49,.239,.035,.84,.035);
    box(rubber,side*.28,.32,.245,.13,.025,.035);
    for(let k=0;k<6;k++) box(rubber,side*.235,.15+k*.045,.246,.21,.016,.012);
  }
  box(dark,0,1.16,-.10,.81,.37,.29);
  box(steel,0,1.16,.053,.75,.31,.025);
  box(glass,0,1.16,.07,.69,.26,.013);
  if(chapter===0){
    // Three vertically mounted fuse holders with copper contacts.
    for(let k=0;k<3;k++){
      const x=(k-1)*.21;
      box(rubber,x,1.16,.085,.17,.23,.035);
      box(copper,x,1.235,.105,.085,.027,.02);
      box(copper,x,1.085,.105,.085,.027,.02);
      box(bright,x,1.16,.108,.044,.123,.024);
      box(amber,x,.985,.20,.044,.022,.041);
    }
  }else if(chapter===1){
    // Analog radio receiver: frequency scale, tuning knobs and speaker slots.
    box(bright,0,1.225,.086,.56,.065,.012);
    for(let k=0;k<13;k++) box(rubber,(k-6)*.041,1.226,.095,.006,k%3===0?.044:.025,.008);
    for(let k=0;k<3;k++){
      const x=(k-1)*.21;
      dial(steel,x,1.10,.12,.064,.053);
      box(dark,x,1.136,.148,.012,.027,.012);
    }
    for(let k=0;k<5;k++)box(rubber,(k-2)*.095,.995,.17,.065,.023,.10);
  }else if(chapter===2){
    // A pair of open reel spools, guide rollers and tape transport path.
    for(const x of [-.20,.20]){
      piece(ringGeo,steel,x,1.17,.112,.103,.103,.103);
      dial(rubber,x,1.17,.10,.084,.025);
      dial(copper,x,1.17,.14,.025,.018);
      for(let k=0;k<3;k++){
        const angle=k*2*Math.PI/3;
        const spoke=box(steel,x+Math.cos(angle)*.050,1.17+Math.sin(angle)*.050,.131,.074,.018,.013);
        spoke.rotation.z=angle;
      }
    }
    box(rubber,0,1.065,.12,.32,.026,.02);
    for(const x of [-.1,.1])dial(amber,x,1.07,.142,.017,.019);
  }else{
    // Master console: dual traces and a row of physical channel faders.
    for(let k=0;k<20;k++){
      const x=(k-9.5)*.029, y1=1.20+Math.sin(k*.62)*.037, y2=1.12-Math.sin(k*.62)*.037;
      box(bright,x,y1,.094,.032,.009,.01);
      box(amber,x,y2,.094,.032,.008,.01);
    }
    for(let k=0;k<3;k++){
      const x=(k-1)*.22;
      box(rubber,x,1.013,.19,.032,.025,.18);
      box(steel,x,1.043,.15+k*.039,.092,.044,.045);
    }
  }
}
export function addContactShadow(THREE,root,width,depth,texture) {
  const mat=new THREE.MeshBasicMaterial({map:texture,color:0x000000,transparent:true,opacity:.65,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,depth),mat);
  mesh.rotation.x=-Math.PI/2;
  mesh.position.y=.004;
  root.add(mesh);
  return mesh;
}
export function makeContactTexture(THREE) {
  const canvas=document.createElement("canvas");
  canvas.width=canvas.height=64;
  const ctx=canvas.getContext("2d");
  const gradient=ctx.createRadialGradient(32,32,3,32,32,32);
  gradient.addColorStop(0,"rgba(255,255,255,.94)");
  gradient.addColorStop(.48,"rgba(255,255,255,.64)");
  gradient.addColorStop(1,"rgba(255,255,255,0)");
  ctx.fillStyle=gradient;
  ctx.fillRect(0,0,64,64);
  return new THREE.CanvasTexture(canvas);
}

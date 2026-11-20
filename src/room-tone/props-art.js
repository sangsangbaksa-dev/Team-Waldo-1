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

/* Collectibles use recognizable silhouettes and restrained illumination instead of
 * emissive blocks. Mesh bounds remain small enough for the original pedestal. */
export function buildCollectibleArt(THREE, root, chapter, index, bright, dark, steel) {
  const ceramic=new THREE.MeshStandardMaterial({color:0xdbd1b5,roughness:.72});
  const copper=new THREE.MeshStandardMaterial({color:0xb89062,metalness:.65,roughness:.38});
  const paper=new THREE.MeshStandardMaterial({color:0xc5bd9e,roughness:.94});
  const plastic=new THREE.MeshStandardMaterial({color:0x353934,roughness:.48,metalness:.06});
  const boxGeo=new THREE.BoxGeometry(1,1,1);
  const cylinder=new THREE.CylinderGeometry(1,1,1,16);
  const ring=new THREE.TorusGeometry(1,.14,8,20);
  function piece(geo,mat,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0){
    const mesh=new THREE.Mesh(geo,mat);
    mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.rotation.set(rx,ry,rz);root.add(mesh);
    return mesh;
  }
  const box=(mat,x,y,z,w,h,d)=>piece(boxGeo,mat,x,y,z,w,h,d);
  const frontDisc=(mat,x,y,z,r,d)=>piece(cylinder,mat,x,y,z,r,d,r,Math.PI/2);
  if(chapter===0){
    const len=.29+index*.025;
    piece(cylinder,ceramic,0,0,0,.071,len,.071,0,0,Math.PI/2);
    for(const side of [-1,1]){
      piece(cylinder,steel,side*len*.5,0,0,.082,.056,.082,0,0,Math.PI/2);
      piece(cylinder,copper,side*(len*.5+.034),0,0,.055,.021,.055,0,0,Math.PI/2);
    }
    box(bright,0,.072,0,.10+index*.025,.013,.09);
    for(let k=0;k<index+1;k++)box(dark,(k-index*.5)*.022,.08,0,.011,.006,.06);
  }else if(chapter===1){
    box(plastic,0,0,0,.37,.252,.032);
    box(paper,0,0,.019,.333,.219,.011);
    box(bright,0,.078,.026,.286,.041,.007);
    for(let k=0;k<6;k++){
      box(dark,-.024,-.02-k*.013,.027,.20-(k%2)*.04,.005,.006);
      box(copper,.115,-.02-k*.013,.027,.03,.005,.006);
    }
    box(steel,-.145,.097,.027,.027,.025,.01);
    for(let k=0;k<index+1;k++)box(plastic,.15-k*.025,.098,.027,.013,.019,.006);
  }else if(chapter===2){
    frontDisc(plastic,0,0,0,.139,.064);
    frontDisc(steel,0,0,.041,.124,.016);
    frontDisc(copper,0,0,.054,.040,.019);
    piece(ring,dark,0,0,.053,.109,.109,.025);
    for(let k=0;k<3;k++){
      const a=k*Math.PI*2/3;
      const spoke=box(plastic,Math.cos(a)*.082,Math.sin(a)*.082,.059,.066,.028,.012);
      spoke.rotation.z=a;
    }
    frontDisc(bright,0,0,.069,.024,.007);
    box(paper,0,-.125,.045,.15,.024,.013);
  }else{
    box(steel,0,0,0,.34,.24,.016);
    box(plastic,0,0,.012,.322,.219,.012);
    box(paper,0,.06,.021,.274,.056,.009);
    for(let k=0;k<11;k++){
      const x=(k-5)*.024;
      const y=-.04+Math.sin(k*.63+index*Math.PI/2)*.025;
      box(bright,x,y,.025,.026,.009,.007);
    }
    for(let k=0;k<7;k++)box(copper,(k-3)*.038,-.107,.019,.022,.032,.008);
  }
  // Avoid retaining unattached materials and geometries on chapter changes.
  const usedMaterials=new Set(root.children.map(child=>child.material));
  const usedGeometry=new Set(root.children.map(child=>child.geometry));
  for(const m of [ceramic,copper,paper,plastic])if(!usedMaterials.has(m))m.dispose();
  for(const geo of [boxGeo,cylinder,ring])if(!usedGeometry.has(geo))geo.dispose();
}

/* Wall-mounted pressure door. +Z is the room-facing side. A locked exit is a
 * visual landmark rather than a new walkable passage in the existing maze. */
export function buildExitDoorArt(THREE,root,bright,dark,steel){
  const frame=new THREE.MeshStandardMaterial({color:0x343f3b,roughness:.67,metalness:.42});
  const panel=new THREE.MeshStandardMaterial({color:0x4b5551,roughness:.73,metalness:.28});
  const rubber=new THREE.MeshStandardMaterial({color:0x151d1b,roughness:.94});
  const boxGeo=new THREE.BoxGeometry(1,1,1);
  const box=(mat,x,y,z,w,h,d)=>{
    const mesh=new THREE.Mesh(boxGeo,mat);
    mesh.position.set(x,y,z);mesh.scale.set(w,h,d);root.add(mesh);return mesh;
  };
  box(rubber,0,1.29,.024,2.07,2.58,.048);
  for(const side of [-1,1]){
    box(frame,side*.98,1.27,.08,.15,2.50,.16);
    box(steel,side*.902,1.25,.167,.033,2.35,.024);
    box(panel,side*.455,1.22,.069,.88,2.36,.098);
    for(const y of [.24,1.18,2.15]){
      box(frame,side*.455,y,.131,.81,.064,.052);
    }
    for(const u of [-.38,.38]){
      box(steel,side*.455+u,.18,.166,.028,.025,.022);
      box(steel,side*.455+u,2.28,.166,.028,.025,.022);
    }
    box(rubber,side*.083,1.12,.139,.085,.32,.07);
    box(steel,side*.08,1.12,.192,.038,.22,.03);
  }
  box(frame,0,2.51,.087,2.11,.14,.174);
  box(dark,0,2.39,.172,.59,.099,.026);
  box(bright,0,2.39,.193,.43,.042,.018);
  box(rubber,0,.045,.11,1.88,.09,.17);
}

/* Batch repeated opaque meshes by geometry and material inside each prop.
 * Parent transforms, visibility, transparent shadows and sprite signs remain unchanged. */
export function batchStaticMeshes(THREE,root){
  let removed=0;
  const groups=new Map();
  for(const child of [...root.children]){
    if(child.isGroup){removed+=batchStaticMeshes(THREE,child);continue;}
    if(!child.isMesh||child.isInstancedMesh||!child.visible||child.children.length||
       Array.isArray(child.material)||child.material?.transparent||!child.geometry||!child.material)continue;
    let materials=groups.get(child.geometry);
    if(!materials){materials=new Map();groups.set(child.geometry,materials);}
    let group=materials.get(child.material);
    if(!group){group=[];materials.set(child.material,group);}
    group.push(child);
  }
  for(const [geometry,materials] of groups)for(const [material,group] of materials){
    if(group.length<2)continue;
    const batch=new THREE.InstancedMesh(geometry,material,group.length);
    batch.name="Static detail batch";
    for(let i=0;i<group.length;i++){
      const mesh=group[i];mesh.updateMatrix();
      batch.setMatrixAt(i,mesh.matrix);
      root.remove(mesh);
    }
    batch.instanceMatrix.needsUpdate=true;
    batch.computeBoundingBox();
    batch.computeBoundingSphere();
    root.add(batch);
    removed+=group.length-1;
  }
  return removed;
}

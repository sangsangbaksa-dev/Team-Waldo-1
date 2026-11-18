import assert from 'node:assert/strict';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true,watch:{ignored:['**/.browser-check/**']}},appType:'custom'});
let count=0;
const check=(name,fn)=>{fn();count++;console.log('PASS '+name);};
try{
 const a=await server.ssrLoadModule('/src/shooter/attachments.ts');
 const {WEAPONS}=await server.ssrLoadModule('/src/shooter/config.ts');
 const {Match,blankInput}=await server.ssrLoadModule('/src/shooter/sim.ts');
 const {makeModularGun,makePart,disposeModel}=await server.ssrLoadModule('/src/shooter/gunmodel.ts');
 const {generateMap}=await server.ssrLoadModule('/src/shooter/world.ts');
 const gun={id:'rifle',mag:30,reserve:90,parts:{}},bag=[...a.PART_IDS];
 check('Scope mounts from inventory',()=>assert.ok(a.fitPart(gun,bag,'optic','scope4')));
 check('Mounted scope leaves bag',()=>assert.ok(!bag.includes('scope4')));
 check('Optic magnification is four',()=>assert.equal(a.gunStats(gun).zoom,4));
 check('Optic does not buff hip fire',()=>assert.equal(a.gunStats(gun).spread,WEAPONS.rifle.spread));
 a.fitPart(gun,bag,'optic','redDot');check('Scope replacement returns old part',()=>assert.ok(bag.includes('scope4')&&!bag.includes('redDot')));
 check('Wrong slot cannot equip',()=>assert.equal(a.fitPart(gun,bag,'grip','suppressor'),false));
 check('Unowned part cannot equip',()=>assert.equal(a.fitPart(gun,[],'muzzle','suppressor'),false));
 check('Pistol rejects four power scope',()=>assert.equal(a.fitPart({id:'pistol',mag:12,reserve:12},bag,'optic','scope4'),false));
 a.fitPart(gun,bag,'magazine','extendedMag');check('Extended magazine raises capacity',()=>assert.equal(a.gunStats(gun).mag,42));
 gun.mag=42;const total=gun.mag+gun.reserve;a.fitPart(gun,bag,'magazine',null);
 check('Magazine removal preserves total ammunition',()=>assert.equal(gun.mag+gun.reserve,total));
 check('Magazine removal clamps loaded rounds',()=>assert.equal(gun.mag,30));
 a.fitPart(gun,bag,'muzzle','compensator');a.fitPart(gun,bag,'grip','verticalGrip');
 check('Grip and muzzle reduce recoil multiplicatively',()=>assert.ok(Math.abs(a.gunStats(gun).recoil-WEAPONS.rifle.recoil*.76*.82)<1e-10));
 check('Invalid network parts are sanitized',()=>assert.deepEqual(a.cleanLoadout('pistol',{optic:'scope4',muzzle:'suppressor',grip:'redDot',magazine:'__proto__'}),{muzzle:'suppressor'}));
 check('Full inventory cannot overflow on detach',()=>assert.equal(a.fitPart(gun,Array(16).fill('scope4'),'optic',null),false));
 for(const id of ['pistol','smg','shotgun','rifle','sniper']){
   const model=makeModularGun({id,parts:{optic:'redDot',muzzle:'compensator',magazine:'extendedMag'}});
   check('Finite 3D weapon geometry: '+id,()=>{let meshes=0;model.traverse(o=>{if(o.geometry){meshes++;for(const value of o.geometry.attributes.position.array)assert.ok(Number.isFinite(value));}});assert.ok(meshes>10);});disposeModel(model);
 }
 for(const id of a.PART_IDS){const model=makePart(id);check('Renderable attachment: '+id,()=>{let n=0;model.traverse(o=>{if(o.geometry)n++;});assert.ok(n>2);});disposeModel(model);}
 const match=new Match({seed:27,mode:'duel',difficulty:'easy',humans:[{name:'Test'},{name:'Other'}],drop:false});
 const p=match.players[0];p.parts=['extendedMag','quickMag','suppressor'];p.guns=[{id:'rifle',mag:30,reserve:100},{id:'shotgun',mag:6,reserve:12}];p.cur=0;p.input=blankInput();
 match.equip(p,'magazine','extendedMag');p.input.reload=true;match.step(1/60);p.input.reload=false;
 for(let i=0;i<180;i++)match.step(1/60);
 check('Extended magazine reloads to actual capacity',()=>assert.equal(p.guns[0].mag,42));
 check('Reload conserves ammo',()=>assert.equal(p.guns[0].mag+p.guns[0].reserve,130));
 p.cd=0;p.input.slot=1;p.input.fire=true;match.step(1/60);p.input.slot=-1;p.input.fire=false;
 check('Weapon switch applies new weapon cooldown',()=>assert.ok(p.cd>=0.3));
 p.cd=0;p.fireHeld=false;p.input.fire=true;match.step(1/60);check('Shot event matches switched weapon',()=>assert.equal(match.events.filter(e=>e.t==='shot').at(-1).weapon,'shotgun'));
 p.input.fire=false;p.cur=0;p.reload=0;p.parts.push('suppressor');match.equip(p,'muzzle','suppressor');p.cd=0;p.fireHeld=false;p.input.fire=true;match.step(1/60);
 check('Suppressor reduces shot detection range',()=>assert.equal(match.sounds.at(-1).range,44));
 const empty={id:99999,kind:'weapon',weapon:'rifle',x:p.x,z:p.z,y:p.y,taken:false,b:-1,mag:0,reserve:0,parts:{}};
 const before=p.guns[0].reserve;match.takeWeapon(p,empty);check('Picking empty duplicate gun creates no ammunition',()=>assert.equal(p.guns[0].reserve,before));
 const dropped={...empty,id:99998,taken:false,mag:8,reserve:13,parts:{optic:'scope4'}};match.takeWeapon(p,dropped);
 check('Duplicate drop transfers only real rounds',()=>assert.equal(p.guns[0].reserve,before+21));
 check('Duplicate gun returns mounted parts',()=>assert.ok(p.parts.includes('scope4')));
 p.reload=1;check('Cannot attach during reload',()=>assert.equal(match.equip(p,'muzzle',null),false));
 const map1=generateMap(27,'duel'),map2=generateMap(27,'duel');
 check('Part loot deterministic for PvP peers',()=>assert.deepEqual(map1.loot,map2.loot));
 check('Map contains attachment loot',()=>assert.ok(map1.loot.some(l=>l.kind==='attachment'&&a.PART_IDS.includes(l.part))));
 console.log(count+' attachment checks passed');
}finally{await server.close();}

import {describe,it,expect} from 'vitest';
import {CHUNK,WIDTH,DEPTH,DISTRICTS,HIGHWAYS,CROSS_HIGHWAY,districtAt,roadHalf,roadDistance,terrainHeight,propsFor,blocked} from '../../project-harbor/world/domain';
import {World,type ChunkData} from '../../project-harbor/world/application';
import {FreeRoam,IDLE_INPUT} from '../../project-harbor/world/session';
import {makeVehicle, stepVehicle} from '../../project-harbor/vehicles/domain.js';
import {cruiseInput, type Ride} from '../../project-harbor/world/traffic';
import {
  WEAPONS,WANTED_DECAY_DELAY,addWanted,applyHit,armWeapon,createVitals,decayWanted,hospital,
  makeMed,makePed,makeWeapon,pickpocket,populationFor,rayHit,rob,starCount,takeItem,
} from '../../project-harbor/world/street';

describe('Harbor free-roam world',()=>{
  it('defines six distinct districts within a connected 24 by 16 grid',()=>{
    expect(WIDTH/CHUNK).toBe(24);expect(DEPTH/CHUNK).toBe(16);
    expect(new Set(DISTRICTS.map(d=>districtAt(d.x,d.z).id)).size).toBe(6);
    for(const x of HIGHWAYS){expect(roadHalf('x',x)).toBe(15);expect(roadDistance(x,CROSS_HIGHWAY)).toBeLessThan(0);expect(terrainHeight(x,CROSS_HIGHWAY)).toBe(0);}
    expect(roadHalf('z',CROSS_HIGHWAY)).toBe(15);
  });
  it('generates deterministic props clear of road shoulders and chunk borders',()=>{
    for(let cx=0;cx<WIDTH/CHUNK;cx++)for(let cz=0;cz<DEPTH/CHUNK;cz++){
      const props=propsFor(cx,cz);expect(props).toEqual(propsFor(cx,cz));
      for(const p of props){
        expect(roadDistance(p.x,p.z)).toBeGreaterThanOrEqual(Math.max(p.w,p.d)/2+3);
        expect(p.x-p.w/2).toBeGreaterThanOrEqual(cx*CHUNK+2);
        expect(p.z-p.d/2).toBeGreaterThanOrEqual(cz*CHUNK+2);
        expect(blocked(p.x,p.z,props)).toBe(true);
      }
    }
  });
  it('streams a bounded active set with nearby detail and evicts distant chunks',()=>{
    const active=new Map<string,ChunkData>();
    const world=new World({load(c){active.set(c.cx+':'+c.cz,c);},unload(key){active.delete(key);}});
    world.stream(2);expect(active.size).toBe(2);
    world.stream(100);expect(active.size).toBe(49);
    expect([...active.values()].filter(c=>c.lod===0)).toHaveLength(9);
    world.x=64;world.z=64;world.stream(100);
    expect(active.size).toBe(16);expect(world.activeChunks).toBe(16);
    expect([...active.values()].every(c=>c.cx<=3&&c.cz<=3)).toBe(true);
  });
  it('advances time and allows movement along an unobstructed road',()=>{
    const world=new World({load(){},unload(){}});
    world.x=1088;world.z=1088;
    const before=world.z;world.move(1,0,.05,false);
    expect(world.z).toBeLessThan(before);expect(world.hours).toBeGreaterThan(10);
    world.x=2;world.yaw=-Math.PI/2;world.move(1,0,.05,true);expect(world.x).toBe(2);
  });
  it('keeps generated people and gear off the roadway',()=>{
    let placed=0;
    for(let cx=0;cx<WIDTH/CHUNK;cx+=3)for(let cz=0;cz<DEPTH/CHUNK;cz+=3){
      const life=populationFor(cx,cz);
      expect(life).toEqual(populationFor(cx,cz));
      const props=propsFor(cx,cz);
      for(const ped of life.peds){
        placed++;
        expect(roadDistance(ped.x,ped.z)).toBeGreaterThanOrEqual(3.2);
        expect(blocked(ped.x,ped.z,props,0.8)).toBe(false);
      }
      for(const item of life.items){
        expect(roadDistance(item.x,item.z)).toBeGreaterThanOrEqual(3.2);
        expect(blocked(item.x,item.z,props,0.8)).toBe(false);
      }
    }
    expect(placed).toBeGreaterThan(10);
  });
  it('resolves pickpocket, robbery, gunfire and wanted decay without missions',()=>{
    const quiet=createVitals();
    const rich=makePed('rich',1,0,{cash:100,health:40});
    expect(pickpocket(quiet,rich,0)).toEqual({status:'quiet',amount:35});
    expect(quiet.money).toBe(35);expect(quiet.wanted).toBe(0);expect(rich.cash).toBe(65);
    const spotted=createVitals();
    expect(pickpocket(spotted,makePed('mark',1,0,{cash:100,health:40}),0.9).status).toBe('spotted');
    expect(spotted.wanted).toBe(1);
    const armed=createVitals();armed.weapon='pistol';
    const victim=makePed('victim',0,0,{cash:200,health:50});
    expect(rob(armed,victim).amount).toBe(180);
    expect(armed.health).toBe(100);expect(starCount(armed.wanted)).toBe(2);
    const bare=createVitals();
    rob(bare,makePed('shove',0,0,{cash:100,health:40}));
    expect(bare.health).toBe(92);expect(rob(createVitals(),makePed('empty',0,0,{cash:0})).status).toBe('broke');
    const healed=createVitals();healed.health=50;
    expect(takeItem(healed,makeMed('kit',0,0))).toBe('med');expect(healed.health).toBe(90);
    expect(takeItem(createVitals(),makeMed('full',0,0))).toBe('full');
    const gun=createVitals();
    expect(takeItem(gun,makeWeapon('w',0,0,'pistol'))).toBe('weapon');
    expect(takeItem(gun,makeWeapon('ammo',0,0,'pistol'))).toBe('ammo');
    expect(gun.reserve).toBe(WEAPONS.pistol.reserve+WEAPONS.pistol.magazine);
    expect(takeItem(gun,makeWeapon('smg',0,0,'smg'))).toBe('swap');
    expect(gun.weapon).toBe('smg');
    const shooter=createVitals();shooter.weapon='pistol';shooter.magazine=2;shooter.reserve=10;
    expect(armWeapon(shooter,0.1,true,false)).toBe('shot');expect(shooter.magazine).toBe(1);
    expect(armWeapon(shooter,0.01,true,false)).toBe('none');
    shooter.magazine=0;expect(armWeapon(shooter,1,true,false)).toBe('empty');
    expect(armWeapon(shooter,0,false,true)).toBe('reload');
    const ahead=makePed('ahead',0,-5,{health:80});
    expect(rayHit(0,0,0,40,[ahead])?.ped).toBe(ahead);
    expect(rayHit(0,0,0,40,[makePed('behind',0,5,{health:80})])).toBeNull();
    expect(rayHit(0,0,0,40,[makePed('wide',3,-5,{health:80})])).toBeNull();
    expect(applyHit(ahead,WEAPONS.pistol.damage)).toBe(false);
    expect(ahead.health).toBe(80-WEAPONS.pistol.damage);
    expect(applyHit(ahead,80)).toBe(true);expect(ahead.state).toBe('down');
    const heat=createVitals();heat.wanted=2;decayWanted(heat,1);expect(heat.wanted).toBe(2);
    heat.wanted=1;heat.calm=WANTED_DECAY_DELAY;decayWanted(heat,10);expect(starCount(heat.wanted)).toBe(0);
    addWanted(heat,9);expect(heat.wanted).toBe(5);expect(heat.calm).toBe(0);
    const site=hospital(1600,400);
    expect(districtAt(site.x,site.z).id).toBe('city');
    expect(roadHalf('x',site.x)+roadHalf('z',site.z)).toBeGreaterThan(0);
  });
  it('plays the free-roam loop: pickup, theft, shots, death and a bounded crowd',()=>{
    const view={load(){},unload(){}};
    const roam=new FreeRoam(view);
    expect(roam.items.some(item=>item.kind==='weapon'&&Math.hypot(item.x-roam.x,item.z-roam.z)<22)).toBe(true);
    expect(roam.peds.some(ped=>ped.health>0&&Math.hypot(ped.x-roam.x,ped.z-roam.z)<20)).toBe(true);
    const starterGun=roam.items.find(item=>item.id==='starter-pistol');
    const starterPed=roam.peds.find(person=>person.id==='starter-ped');
    expect(starterGun&&starterGun.z<roam.z).toBeTruthy();
    expect(starterPed&&starterPed.z<roam.z).toBeTruthy();
    let picked=false,paid=false;
    for(let i=0;i<80&&(!picked||!paid);i++){
      roam.tick({...IDLE_INPUT,forward:1,use:!picked,pickpocket:picked},0.05);
      picked=roam.vitals.weapon!==null;
      paid=roam.vitals.money>0;
    }
    expect(picked).toBe(true);
    expect(paid).toBe(true);
    const weapon=roam.items.find(item=>item.kind==='weapon');
    expect(weapon).toBeTruthy();
    if(!weapon)return;
    roam.world.x=weapon.x;roam.world.z=weapon.z;
    roam.tick({...IDLE_INPUT,use:true},0.05);
    expect(roam.vitals.weapon).not.toBeNull();
    expect(roam.vitals.magazine).toBeGreaterThan(0);
    for(const ped of roam.peds)ped.health=0;
    const mark=roam.placePed(roam.x+1,roam.z,{cash:100,health:70});
    roam.tick({...IDLE_INPUT,pickpocket:true},0.05);
    expect(roam.vitals.money).toBeGreaterThan(0);expect(mark.cash).toBeLessThan(100);
    const fresh=new FreeRoam(view);
    for(const ped of fresh.peds)ped.health=0;
    const target=fresh.placePed(fresh.x+1,fresh.z,{cash:200,health:90});
    fresh.vitals.weapon='pistol';fresh.vitals.magazine=12;
    fresh.tick({...IDLE_INPUT,rob:true},0.05);
    expect(fresh.vitals.money).toBeGreaterThan(100);
    expect(starCount(fresh.vitals.wanted)).toBeGreaterThanOrEqual(2);
    expect(target.cash).toBe(0);
    for(const ped of fresh.peds)ped.health=0;
    const front=fresh.placePed(fresh.x,fresh.z-6,{health:80});
    fresh.vitals.weapon='pistol';fresh.vitals.magazine=6;fresh.vitals.cooldown=0;
    fresh.tick({...IDLE_INPUT,fire:true},0.05);
    expect(front.health).toBe(80-WEAPONS.pistol.damage);
    for(const ped of fresh.peds)ped.health=0;
    const rear=fresh.placePed(fresh.x,fresh.z+6,{health:80});
    fresh.yaw=0;fresh.vitals.cooldown=0;fresh.vitals.magazine=6;
    fresh.tick({...IDLE_INPUT,fire:true},0.05);
    expect(rear.health).toBe(80);
    fresh.vitals.money=100;fresh.vitals.wanted=3;fresh.vitals.health=0;
    fresh.tick(IDLE_INPUT,0.05);
    expect(fresh.vitals.health).toBe(100);expect(fresh.vitals.wanted).toBe(0);expect(fresh.vitals.money).toBe(80);
    expect(districtAt(fresh.x,fresh.z).id).toBe('city');
    const calm=new FreeRoam(view);
    calm.vitals.wanted=1;calm.vitals.calm=WANTED_DECAY_DELAY;
    for(let i=0;i<220;i++)calm.tick(IDLE_INPUT,0.05);
    expect(starCount(calm.vitals.wanted)).toBe(0);
    const stress=new FreeRoam(view);
    for(let i=0;i<180;i++){
      stress.tick({
        forward:i%3===0?1:0.4,side:i%5===0?1:0,sprint:i%2===0,look:0.04,
        use:i%45===0,pickpocket:i%55===0,rob:i%80===0,fire:i%7===0,reload:i%100===0,
        throttle:0,steer:0,handbrake:false,
      },0.05);
      expect(Number.isFinite(stress.x+stress.z+stress.vitals.money+stress.vitals.wanted+stress.vitals.health)).toBe(true);
      expect(stress.vitals.health).toBeGreaterThanOrEqual(0);
      expect(stress.vitals.health).toBeLessThanOrEqual(100);
      expect(stress.vitals.money).toBeGreaterThanOrEqual(0);
      expect(stress.vitals.wanted).toBeGreaterThanOrEqual(0);
      expect(stress.vitals.wanted).toBeLessThanOrEqual(5);
      expect(stress.activePedCount).toBeLessThanOrEqual(48);
    }
  });
  it('drives and steals cars on the streamed map',()=>{
    const view={load(){},unload(){}};
    const roam=new FreeRoam(view);
    const parked=roam.rides.find(ride=>!ride.driver&&Math.hypot(ride.x-roam.x,ride.z-roam.z)<22);
    expect(parked).toBeTruthy();
    roam.tick({...IDLE_INPUT,use:true},0.05);
    for(let i=0;i<120&&!roam.vehicle;i++)roam.tick(IDLE_INPUT,0.05);
    expect(roam.vehicle?.spec.name).toBeTruthy();
    const started=roam.x;
    for(let i=0;i<50;i++)roam.tick({...IDLE_INPUT,throttle:1},0.05);
    expect(Math.hypot(roam.x-started,roam.z-576)).toBeGreaterThan(3);
    if(roam.vehicle){roam.vehicle.vx=0;roam.vehicle.vz=0;}
    roam.tick({...IDLE_INPUT,use:true},0.05);
    expect(roam.vehicle).toBeNull();
    const driven=roam.rides.find(ride=>ride.driver);
    expect(driven).toBeTruthy();
    if(!driven)return;
    roam.world.x=driven.x+1.2;roam.world.z=driven.z;
    const before=roam.vitals.wanted;
    roam.tick({...IDLE_INPUT,use:true},0.05);
    expect(roam.vehicle).toBe(driven);
    expect(driven.driver).toBe(false);
    expect(roam.vitals.wanted).toBeGreaterThan(before);
  });
  it('keeps traffic in its lane',()=>{
    const ride=makeVehicle(1,'sedan',1602,400,0,true) as Ride;
    ride.traffic={axis:'z',road:1600,dir:1,cruise:12,lane:2};
    ride.vz=8;
    for(let i=0;i<360;i++)stepVehicle(ride,cruiseInput(ride,[ride]),1/60,false);
    expect(ride.z).toBeGreaterThan(460);
    expect(Math.abs(ride.x-1602)).toBeLessThan(3);
  });
});

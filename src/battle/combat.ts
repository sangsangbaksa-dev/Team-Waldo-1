/** Troop/tower combat and movement; independent of browser and renderer. */
import type { Unit, War } from './model';
import { UNIT_STATS } from './rules';
import { generalBonus, workshopLevel } from './base';
import { battlefieldCoverAt, resolveBattlefieldStep } from './battlefieldLayout';
import { UnitSpatialIndex } from './unitSpatialIndex';

interface CombatScratch {
  spatial: UnitSpatialIndex;
  reserveIds: Set<number>;
  home: Unit[];
}
// Derived, reusable memory belongs to this world, never to its save or another match.
const scratchByWar = new WeakMap<War, CombatScratch>();

function combatScratch(w: War): CombatScratch {
  let scratch = scratchByWar.get(w);
  if (!scratch) {
    scratch = { spatial: new UnitSpatialIndex(), reserveIds: new Set(), home: [] };
    scratchByWar.set(w, scratch);
  }
  return scratch;
}

const distance = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax-bx,az-bz);

function moveToward(w:War,u:Unit,x:number,z:number,dt:number):void {
  const d=distance(u.x,u.z,x,z);
  if (d<.01) return;
  const speed=UNIT_STATS[u.kind].speed*(1+w.factions[u.owner].research.logistics*.08)*(1+generalBonus(w,u,'speed'));
  const step=Math.min(d,speed*dt);
  const next=resolveBattlefieldStep(u.x,u.z,u.x+(x-u.x)/d*step,u.z+(z-u.z)/d*step,x,z);
  u.x=next.x;u.z=next.z;
}
/** Armor mitigates combat only. Storm damage bypasses armor. */
function attack(w:War,attacker:number,target:Unit,damage:number):void {
  if(target.hp<=0)return;
  const cover=battlefieldCoverAt(target.x,target.z);
  const actual=damage*(w.difficulty==='easy'&&attacker!==0?.72:1)*(1-w.factions[target.owner].research.armor*.08)*(1-cover)*(1-generalBonus(w,target,'armor'));
  w.stats[attacker].damageDealt+=Math.min(target.hp,actual);
  target.hp-=actual;
  if(target.hp<=0)w.stats[attacker].kills++;
}
export function updateCombat(w: War, dt: number): void {
  const { spatial, reserveIds, home } = combatScratch(w);
  // Siege towers protect their own base; fort upgrades also increase their damage.
  for (const f of w.factions) {
    if (!f.alive||f.hp<=0||f.turretCooldown>0) continue;
    let invader: Unit | undefined, nearest = 13;
    for (const unit of w.units) {
      if (unit.hp <= 0 || unit.owner === f.id || !w.factions[unit.owner].alive || w.factions[unit.owner].hp <= 0) continue;
      const d = distance(unit.x,unit.z,f.x,f.z);
      if (d < nearest) { nearest = d; invader = unit; }
    }
    if (invader) {
      attack(w,f.id,invader,5+3*f.fort+(f.id===0?workshopLevel(w,'fort')*2.5:0));f.turretCooldown=1.6;
    }
  }
  // Deterministic veteran reservation avoids stripping the HQ of all defenders.
  reserveIds.clear();
  for(const f of w.factions){
    if (f.reserve <= 0) continue;
    home.length = 0;
    for (const unit of w.units) {
      if (unit.owner === f.id && unit.hp > 0 && (f.id !== 0 || (unit.squad ?? 0) === 0)) home.push(unit);
    }
    home.sort((a,b)=>a.id-b.id);
    for (let i = 0; i < Math.min(home.length, f.reserve); i++) reserveIds.add(home[i].id);
  }
  // Spatial grid limits enemy lookups to 9 neighboring cells, avoiding O(N²)
  // scans when the 100 vs 500 battle starts (and as armies recruit).
  spatial.rebuild(w);
  for (const u of w.units) {
    const f=w.factions[u.owner];
    if (!f.alive||f.hp<=0||u.hp<=0) continue;
    const s=UNIT_STATS[u.kind];
    const combatMultiplier=(f.policy==='war'?1.18:1)*(1+f.research.weapons*.12)*(1+generalBonus(w,u,'damage'))*(u.owner===0?1+workshopLevel(w,'barracks')*.09:1);
    u.cooldown=Math.max(0,u.cooldown-dt);
    if (distance(u.x,u.z,0,0)>w.zone) u.hp-=1.8*dt;
    if (u.hp<=0) continue;
    const noticeRange=Math.max(12,s.range+3);
    const enemy = spatial.nearestEnemy(w, u, noticeRange);
    if (enemy) {
      const dx = u.x-enemy.x, dz = u.z-enemy.z;
      const nearest=Math.sqrt(dx*dx+dz*dz);
      if (nearest<=s.range) {
        if (u.cooldown<=0) {attack(w,u.owner,enemy,(s.damage+f.barracks*1.5)*combatMultiplier);u.cooldown=s.cooldown;}
      } else moveToward(w,u,enemy.x,enemy.z,dt);
      continue;
    }
    // Reserved troops defend a fixed ring around the HQ instead of marching out.
    if(reserveIds.has(u.id)){
      const angle=u.id*2.399,rx=f.x+Math.cos(angle)*9,rz=f.z+Math.sin(angle)*9;
      if(distance(u.x,u.z,rx,rz)>1.25)moveToward(w,u,rx,rz,dt);
      continue;
    }
    // Independent player squads never inherit the main army's destination.
    // An uncommanded split squad holds near HQ until explicitly moved.
    const squad = u.owner === 0 ? (u.squad === 1 || u.squad === 2 ? u.squad : 0) : 0;
    const independent = u.owner === 0 && (squad !== 0 || Boolean(w.squadOrders?.[0]));
    if (independent) {
      const command = w.squadOrders?.[squad] ?? { kind: 'home' as const };
      const destination = command.kind === 'move' ? command :
        command.kind === 'home' ? f :
        command.kind === 'outpost' ? w.outposts[command.id] : w.factions[command.id];
      if (destination) {
        if (command.kind === 'faction') {
          const opponent = w.factions[command.id];
          if (opponent?.alive && opponent.hp > 0) {
            if (distance(u.x,u.z,opponent.x,opponent.z) > Math.max(5,s.range))
              moveToward(w,u,opponent.x,opponent.z,dt);
            else if (u.cooldown <= 0) {
              const damage = (s.damage*.9+f.barracks*1.5)*combatMultiplier*(w.grandBattle?.075:1);
              w.stats[u.owner].damageDealt += Math.min(opponent.hp,damage);
              opponent.hp -= damage; u.cooldown = s.cooldown;
            }
          }
        } else {
          const spread = command.kind === 'outpost' ? (w.grandBattle?1.7:2) : (w.grandBattle?2.3:3.4);
          const grid=w.grandBattle?12:3;
          const dx = ((u.id % grid) - (grid-1)/2) * spread;
          const dz = ((Math.floor(u.id / grid) % grid) - (grid-1)/2) * spread;
          if (distance(u.x,u.z,destination.x+dx,destination.z+dz) > 1.8)
            moveToward(w,u,destination.x+dx,destination.z+dz,dt);
        }
      }
      continue;
    }
    const target=f.target===null?undefined:w.factions[f.target];
    if (target?.alive&&target.hp>0) {
      const d=distance(u.x,u.z,target.x,target.z);
      if (d>Math.max(5,s.range)) moveToward(w,u,target.x,target.z,dt);
      else if (u.cooldown<=0) {
        const damage=(s.damage*.9+f.barracks*1.5)*combatMultiplier*(w.difficulty==='easy'&&u.owner!==0?.72:1)*(w.grandBattle?.075:1);
        w.stats[u.owner].damageDealt+=Math.min(target.hp,damage);
        target.hp-=damage;u.cooldown=s.cooldown;
      }
    } else if (f.rally!==null&&w.outposts[f.rally]) {
      const p=w.outposts[f.rally],offset=w.grandBattle?(u.id%13-6)*1.5:(u.id%5)*1.3-2.6;
      const offsetZ=w.grandBattle?(Math.floor(u.id/13)%11-5)*1.5:offset*.5;
      if (distance(u.x,u.z,p.x+offset,p.z+offsetZ)>2)
        moveToward(w,u,p.x+offset,p.z+offsetZ,dt);
    } else {
      if (f.target!==null) f.target=null;
      const angle=u.id*2.4,x=f.x+Math.cos(angle)*6,z=f.z+Math.sin(angle)*6;
      if (distance(u.x,u.z,x,z)>1) moveToward(w,u,x,z,dt);
    }
  }
}

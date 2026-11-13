/** Objective capture runs after troop movement and before faction cleanup. */
import type { Outpost, War } from './model';
import { NAMES, OUTPOST_NAMES } from './rules';
import { addEvent } from './events';

const distance = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax-bx,az-bz);

export function updateOutposts(w: War,dt:number):void {
  for (const p of w.outposts) {
    let id: number | null = null, amount = 0, contested = false;
    for (const u of w.units) {
      if (u.hp<=0||!w.factions[u.owner].alive||w.factions[u.owner].hp<=0||distance(u.x,u.z,p.x,p.z)>=7.5) continue;
      if (id === null) id = u.owner;
      else if (id !== u.owner) { contested = true; break; }
      amount++;
    }
    if (id === null || contested) {
      p.progress=Math.max(0,p.progress-3*dt);
      if (p.progress===0) p.contender=null;
      continue;
    }
    if (p.owner===id) { p.progress=0;p.contender=null;continue; }
    if (p.contender!==id) {
      p.progress=Math.max(0,p.progress-8*dt);
      if (p.progress===0) p.contender=id;
      continue;
    }
    p.progress+=dt*(2.5+Math.min(amount,w.grandBattle?24:5)*1.8);
    if (p.progress>=100) {
      const previous=p.owner;
      p.owner=id;p.contender=null;p.progress=0;
      if(previous!==id){
        w.stats[id].captures++;
        addEvent(w,`${NAMES[id]} 세력이 ${OUTPOST_NAMES[p.id]} 점령`);
      }
    }
  }
}
/** Player-controlled capture presence; rival troops contest the flag. */
export function captureHeroPost(w: War, x: number, z: number, dt: number): Outpost | null {
  if (w.over || !w.factions[0].alive || !Number.isFinite(dt) || dt <= 0) return null;
  const p = w.outposts.find(post => post.owner !== 0 && distance(x, z, post.x, post.z) < 7.5);
  if (!p) return null;
  const contested = w.units.some(u => u.owner !== 0 && u.hp > 0 &&
    w.factions[u.owner].alive && distance(u.x, u.z, p.x, p.z) < 8.5);
  if (contested) return null;
  if (p.contender !== 0) { p.contender = 0; p.progress = 0; }
  p.progress = Math.min(100, p.progress + dt * 11);
  if (p.progress >= 100) {
    p.owner = 0; p.contender = null; p.progress = 0;
    w.stats[0].captures++;
    addEvent(w, NAMES[0] + ' 세력이 ' + OUTPOST_NAMES[p.id] + ' 점령');
  }
  return p;
}


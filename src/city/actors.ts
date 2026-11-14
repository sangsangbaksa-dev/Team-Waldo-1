// LAST CITY — 캐릭터·차량·탄환 갱신
import { ACTORS, BLOCKS, CIV, PITCH, POLICE, ROAD, SIZE, WEAPONS, type WeaponDef } from './defs';
import { clearLine, findPath, lanePoint, navBlocked, resolveCircle, solidAt } from './map';
import { VEHICLES, type Actor, type Faction, type Vehicle, type World } from './world';

const wrap = (a: number): number => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

// ---------- 보스 무기 ----------
export function switchWeapon(w: World, fi: number, idx: number): void { const f = w.factions[fi]; if (idx < 0 || idx >= f.slots.length || idx === f.cur) return; f.cur = idx; f.reloadT = 0; const b = w.boss(fi); if (b) b.cd = Math.max(b.cd, 0.18); }
export function reload(w: World, fi: number): void {
  const f = w.factions[fi], s = f.slots[f.cur], d = WEAPONS[s.id];
  if (f.reloadT > 0 || s.mag >= d.mag || (d.ammo > 0 && s.ammo <= s.mag)) return; f.reloadT = d.reload * f.mods.reload; const b = w.boss(fi); if (b && f.player) w.fx('reload', b.x, b.y);
}
function bossFire(w: World, a: Actor, f: Faction, want: boolean, dt: number): void {
  let s = f.slots[f.cur]; if (!s) { f.cur = 0; s = f.slots[0]; } const d = WEAPONS[s.id];
  a.cd -= dt;
  if (f.reloadT > 0) { f.reloadT -= dt; if (f.reloadT <= 0) s.mag = d.ammo > 0 ? Math.min(d.mag, s.ammo) : d.mag; return; }
  if (d.ammo > 0 && s.ammo <= 0) { f.slots.splice(f.cur, 1); f.cur = Math.min(f.cur, f.slots.length - 1); if (f.player) w.say(`${d.name} 탄약 소진`, '#aaa'); return; }
  if (s.mag <= 0) { reload(w, f.id); return; }
  if (!want || a.cd > 0) return;
  s.mag--; if (d.ammo > 0) s.ammo--;
  a.cd = 1 / (d.rate * f.mods.rate * (f.buffT > 0 ? 1.6 : 1));
  w.shoot(a.x + Math.cos(a.ang) * (a.r + 8), a.y + Math.sin(a.ang) * (a.r + 8), a.ang, s.id, f.id, a.id, f.mods.dmg, f.player && !w.opts.autoPlayer);
}

// ---------- 이동 ----------
function seek(w: World, a: Actor, tx: number, ty: number, sp: number): void {
  if (a.stuck) { a.stuck = 0; a.direct = clearLine(w.map, a.x, a.y, tx, ty); if (a.direct) a.path = null; }
  let gx = tx, gy = ty;
  if (!a.direct) {
    if (!a.path || Math.hypot(a.pgx - tx, a.pgy - ty) > 110 || a.pathI >= a.path.length) {
      if (a.repathT <= 0 && w.pathBudget > 0) { w.pathBudget--; a.path = findPath(w.map, a.x, a.y, tx, ty); a.pathI = 0; a.pgx = tx; a.pgy = ty; a.repathT = 0.7 + w.rng() * 0.7; }
    }
    if (a.path && a.pathI < a.path.length) { gx = a.path[a.pathI]; gy = a.path[a.pathI + 1]; if (Math.hypot(gx - a.x, gy - a.y) < 20) a.pathI += 2; }
  }
  const dx = gx - a.x, dy = gy - a.y, d = Math.hypot(dx, dy) || 1;
  a.vx += (dx / d * sp - a.vx) * 0.25; a.vy += (dy / d * sp - a.vy) * 0.25;
}
const stop = (a: Actor): void => { a.vx *= 0.6; a.vy *= 0.6; };

function targetPos(w: World, a: Actor): { x: number; y: number; vx: number; vy: number; ok: boolean } | null {
  if (a.tk === 1) { const t = w.byId.get(a.tid); if (!t || !t.alive || t.inVeh || w.hidden(t)) return null; return { x: t.x, y: t.y, vx: t.vx, vy: t.vy, ok: true }; }
  if (a.tk === 2) { const s = w.structures.find(q => q.id === a.tid); if (!s || !s.alive) return null; return { x: Math.max(s.x - 3, Math.min(a.x, s.x + s.w + 3)), y: Math.max(s.y - 3, Math.min(a.y, s.y + s.h + 3)), vx: 0, vy: 0, ok: true }; }
  if (a.tk === 3) { const v = w.vehicles.find(q => q.id === a.tid); if (!v || !v.alive || !v.driver || !w.hostile(a.f, v.f)) return null; return { x: v.x, y: v.y, vx: v.vx, vy: v.vy, ok: true }; }
  return null;
}
function think(w: World, a: Actor, range: number): void {
  a.stuck = 1;
  if (a.kind === 'worker' || a.f === CIV || a.order.type === 'move') { a.tk = 0; return; }
  if (a.weapon === 'u_heal') {
    let best = 0, br = 0.97; w.forNear(a.x, a.y, 300, t => { if (t.alive && t.f === a.f && t !== a && !ACTORS[t.kind].mech) { const r = t.hp / t.maxHp; if (r < br && Math.hypot(t.x - a.x, t.y - a.y) < 300) { br = r; best = t.id; } } });
    a.tk = best ? 1 : 0; a.tid = best; a.los = true; return;
  }
  const sight = Math.min(range + 130, 800); let bd = sight, bk: 0 | 1 | 2 | 3 = 0, bid = 0, blos = false;
  // 현재 목표 유지 선호
  w.forNear(a.x, a.y, sight, t => {
    if (!t.alive || w.hidden(t) || !w.hostile(a.f, t.f)) return; let d = Math.hypot(t.x - a.x, t.y - a.y); if (a.tk === 1 && a.tid === t.id) d -= 70; if (t.kind === 'worker') d += 120;
    if (d >= bd) return; const los = w.canSee(a.x, a.y, t.x, t.y); if (!los && (d > sight * 0.6 || blos)) return;
    bd = los ? d : Math.min(bd, d + 200); bk = 1; bid = t.id; blos = los;
  });
  for (const v of w.vehicles) if (v.alive && v.driver && w.hostile(a.f, v.f)) { const d = Math.hypot(v.x - a.x, v.y - a.y); if (d < bd && w.canSee(a.x, a.y, v.x, v.y)) { bd = d; bk = 3; bid = v.id; blos = true; } }
  const fac = a.f < 8 ? w.factions[a.f] : null, siege = !fac || (fac.player && !w.opts.autoPlayer) || fac.ai.goal === 'attack';
  if (!bk || !blos) for (const s of w.structures) if (s.alive && w.hostile(a.f, s.f) && (siege || s.kind === 'turret')) {
    const nx = Math.max(s.x - 3, Math.min(a.x, s.x + s.w + 3)), ny = Math.max(s.y - 3, Math.min(a.y, s.y + s.h + 3)), d = Math.hypot(nx - a.x, ny - a.y);
    if (d < bd && d < sight) { const los = w.canSee(a.x, a.y, nx, ny); if (los || !bk) { bd = d; bk = 2; bid = s.id; blos = los; } }
  }
  a.tk = bk; a.tid = bid; a.los = blos;
}
function workerFsm(w: World, a: Actor, sp: number, dt: number): void {
  const f = w.factions[a.f], hq = w.hq(a.f); if (!hq) { stop(a); return; }
  if (a.ws === 0) {
    let best = 0, bd = 1e9; const hx = hq.x + 60, hy = hq.y + 60;
    for (const c of w.crystals) if (c.amount > 0) { const d = Math.hypot(c.x - hx, c.y - hy) + Math.hypot(c.x - a.x, c.y - a.y) * 0.3 + ((c.id * 7 + a.id * 13) % 5) * 12; if (d < bd && d < 1700) { bd = d; best = c.id; } }
    if (!best) { stop(a); return; } a.crystal = best; a.ws = 1;
  }
  if (a.ws === 1) { const c = w.crystals.find(q => q.id === a.crystal); if (!c || c.amount <= 0) { a.ws = 0; return; } if (Math.hypot(c.x - a.x, c.y - a.y) < 28) { a.ws = 2; a.mineT = 2.2; } else seek(w, a, c.x, c.y, sp); }
  else if (a.ws === 2) { stop(a); a.mineT -= dt; if (a.mineT <= 0) { const c = w.crystals.find(q => q.id === a.crystal); const n = c ? Math.min(c.amount, 8 + 2 * f.up.eco) : 0; if (c) c.amount -= n; a.carry = n; a.ws = 3; } }
  else { const nx = Math.max(hq.x, Math.min(a.x, hq.x + hq.w)), ny = Math.max(hq.y, Math.min(a.y, hq.y + hq.h)); if (Math.hypot(nx - a.x, ny - a.y) < 44) { f.crystal += a.carry; if (f.player && a.carry) w.fx('crystal', a.x, a.y, a.carry); a.carry = 0; a.ws = 0; } else seek(w, a, hq.x + 60, hq.y + 60, sp); }
}

export function updateActors(w: World, dt: number): void {
  const inp = w.input;
  for (const a of w.actors) {
    if (!a.alive) continue; a.flash -= dt; a.runCd -= dt; a.repathT -= dt;
    if (a.inVeh) continue;
    const def = ACTORS[a.kind], fac = a.f < 8 ? w.factions[a.f] : null;
    let sp = def.speed;
    if (a.kind === 'boss' && fac) {
      sp *= fac.mods.speed;
      if (fac.player && !w.opts.autoPlayer) {
        if (w.inside) { w.moveInside(dt); a.vx = a.vy = 0; continue; }
        const m = Math.hypot(inp.mx, inp.my), k = m > 1 ? 1 / m : 1;
        if (inp.dash && fac.dashCd <= 0 && m > 0.1) { fac.dashT = 0.2; fac.dashCd = 2.4 * fac.mods.dash; w.fx('dash', a.x, a.y, 0, undefined, 0); }
        const s = sp * (fac.dashT > 0 ? 3.3 : 1); a.vx = inp.mx * k * s; a.vy = inp.my * k * s; a.ang = Math.atan2(inp.ay - a.y, inp.ax - a.x);
        bossFire(w, a, fac, inp.fire, dt);
        a.x += a.vx * dt; a.y += a.vy * dt; a.walk += Math.hypot(a.vx, a.vy) * dt; resolveCircle(w.map, a, a.r); continue;
      }
    }
    if (a.temp > 0 && a.f === POLICE && w.rng() < dt * 0.05) { a.alive = false; a.gone = true; w.byId.delete(a.id); continue; }
    // AI
    let wd: WeaponDef = WEAPONS[a.weapon];
    if (a.kind === 'boss' && fac) {
      let best = 0; for (let i = 1; i < fac.slots.length; i++) if (WEAPONS[fac.slots[i].id].tier > WEAPONS[fac.slots[best].id].tier) best = i;
      if (best !== fac.cur && fac.reloadT <= 0) fac.cur = best; wd = WEAPONS[fac.slots[fac.cur].id];
      if (a.hp < a.maxHp * 0.4 && fac.medkits > 0) w.useMedkit(a.f);
    }
    const range = Math.min(wd.range, a.kind === 'boss' ? 620 : 9999);
    a.thinkT -= dt; if (a.thinkT <= 0) { a.thinkT = 0.22 + w.rng() * 0.12; think(w, a, range); }
    let tp = a.tk ? targetPos(w, a) : null; if (a.tk && !tp) { a.tk = 0; a.thinkT = 0; }
    const o = a.order; let leader: { x: number; y: number } | null = null;
    if (o.type === 'follow') { const b = w.boss(a.f); if (b) { leader = b; if (tp && Math.hypot(b.x - a.x, b.y - a.y) > 640) tp = null; } }
    if (o.type === 'guard' && tp && Math.hypot(o.x - a.x, o.y - a.y) > 300) tp = null;
    let fired = false;
    if (tp) {
      const d = Math.hypot(tp.x - a.x, tp.y - a.y), heal = a.weapon === 'u_heal';
      if (d <= range * (heal ? 0.8 : 0.93) && a.los) {
        const lead = wd.speed > 0 ? d / wd.speed : 0; a.ang = Math.atan2(tp.y + tp.vy * lead - a.y, tp.x + tp.vx * lead - a.x);
        if (a.kind === 'boss' && fac) { // 좌우로 움직이며 교전
          const side = (Math.floor(w.time / 1.3 + a.id) % 2 ? 1 : -1), px = -Math.sin(a.ang) * side, py = Math.cos(a.ang) * side, back = d < range * 0.45 ? -0.6 : 0;
          a.vx += ((px + Math.cos(a.ang) * back) * sp * 0.7 - a.vx) * 0.2; a.vy += ((py + Math.sin(a.ang) * back) * sp * 0.7 - a.vy) * 0.2;
          if (w.time - a.hurtT < 0.3 && fac.dashCd <= 0) { fac.dashT = 0.2; fac.dashCd = 3.5; a.vx = px * sp * 3; a.vy = py * sp * 3; }
          bossFire(w, a, fac, true, dt); fired = true;
        } else {
          stop(a); a.cd -= dt;
          if (a.cd <= 0) {
            a.cd = 1 / (wd.rate * (fac && fac.buffT > 0 ? 1.6 : 1)) * (0.9 + w.rng() * 0.2);
            if (heal) { const t = w.byId.get(a.tid); if (t) { t.hp = Math.min(t.maxHp, t.hp + wd.dmg); w.events.push({ t: 'healbeam', x: a.x, y: a.y, a: t.x, b: t.y }); } }
            else w.shoot(a.x + Math.cos(a.ang) * (a.r + 6), a.y + Math.sin(a.ang) * (a.r + 6), a.ang, a.weapon, a.f, a.id, fac ? fac.mods.unitDmg * (1 + 0.15 * fac.up.dmg) : 1, false);
          }
        }
      } else if (o.type !== 'hold') seek(w, a, tp.x, tp.y, sp);
      else stop(a);
    } else if (o.type === 'mine') workerFsm(w, a, sp, dt);
    else if (o.type === 'follow') {
      if (!leader) stop(a);
      else { const ang = a.slot * 2.399, rad = 44 + (a.slot % 6) * 16, gx = leader.x + Math.cos(ang) * rad, gy = leader.y + Math.sin(ang) * rad, d = Math.hypot(gx - a.x, gy - a.y); if (d > 30) seek(w, a, navBlocked(w.map, gx, gy) ? leader.x : gx, navBlocked(w.map, gx, gy) ? leader.y : gy, sp * (d > 220 ? 1.25 : 1)); else stop(a); }
    } else if (o.type === 'amove' || o.type === 'move') { if (Math.hypot(o.x - a.x, o.y - a.y) < 34) { if (a.kind !== 'boss') a.order = { type: 'hold', x: a.x, y: a.y }; stop(a); } else seek(w, a, o.x, o.y, sp); }
    else if (o.type === 'guard') { if (Math.hypot(o.x - a.x, o.y - a.y) > 46) seek(w, a, o.x, o.y, sp); else stop(a); }
    else if (o.type === 'hunt') {
      const tf = w.factions[a.home], b = w.boss(a.home);
      if (!b || tf.wanted < 1) { a.order = { type: 'wander', x: a.x, y: a.y }; a.temp = 1; }
      else seek(w, a, b.x, b.y, sp);
    } else if (o.type === 'wander') {
      if (a.fleeT > 0) { a.fleeT -= dt; sp *= 2.3; }
      if (Math.hypot(o.x - a.x, o.y - a.y) < 30 || w.rng() < dt * 0.04) { for (let k = 0; k < 6; k++) { const x = a.x + (w.rng() - 0.5) * 900, y = a.y + (w.rng() - 0.5) * 900; if (!navBlocked(w.map, x, y)) { a.order = { type: 'wander', x, y }; break; } } }
      seek(w, a, o.x, o.y, sp);
    } else stop(a);
    if (a.kind === 'boss' && fac && !fired) bossFire(w, a, fac, false, dt);
    const v2 = a.vx * a.vx + a.vy * a.vy; if (v2 > 4 && !(tp && a.los)) a.ang += wrap(Math.atan2(a.vy, a.vx) - a.ang) * 0.2;
    a.x += a.vx * dt; a.y += a.vy * dt; a.walk += Math.sqrt(v2) * dt;
  }
  // 분리 + 지형 충돌
  for (const a of w.actors) {
    if (!a.alive || a.inVeh) continue; const pl = a.kind === 'boss' && a.f === 0;
    w.forNear(a.x, a.y, a.r + 28, b => {
      if (b.id <= a.id || !b.alive || b.inVeh) return; const dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r, d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 0.01) return; const d = Math.sqrt(d2), push = (min - d) * 0.5, wa = pl ? 0.15 : ACTORS[a.kind].mech ? 0.3 : 1, wb = ACTORS[b.kind].mech ? 0.3 : 1, t = wa + wb;
      a.x -= dx / d * push * 2 * wa / t; a.y -= dy / d * push * 2 * wa / t; b.x += dx / d * push * 2 * wb / t; b.y += dy / d * push * 2 * wb / t;
    });
    if (!pl || w.opts.autoPlayer) resolveCircle(w.map, a, a.r);
  }
}

// ---------- 탄환 ----------
export function updateBullets(w: World, dt: number): void {
  const bs = w.bullets;
  for (let i = bs.length - 1; i >= 0; i--) {
    const b = bs[i], d = WEAPONS[b.w], sp = Math.hypot(b.vx, b.vy), steps = Math.max(1, Math.ceil(sp * dt / 20)), sdt = dt / steps; let dead = false;
    b.px = b.x; b.py = b.y;
    for (let s = 0; s < steps && !dead; s++) {
      b.x += b.vx * sdt; b.y += b.vy * sdt; b.life -= sdt;
      if (b.x < 0 || b.y < 0 || b.x > SIZE || b.y > SIZE || b.life <= 0) { dead = true; if (d.splash) w.explode(b.x, b.y, d.splash, b.dmg, b.f, d.bdmg); break; }
      const so = solidAt(w.map, b.x, b.y);
      if (so) {
        if (so.struct) { const st = w.structures.find(q => q.id === so.struct); if (st && !w.hostile(b.f, st.f)) continue; if (st) { if (d.splash) w.explode(b.x, b.y, d.splash, b.dmg, b.f, d.bdmg); else { w.hurtStruct(st, b.dmg * d.bdmg, b.f); w.fx('spark', b.x, b.y); } dead = true; break; } }
        if (d.splash) w.explode(b.x - b.vx * sdt, b.y - b.vy * sdt, d.splash, b.dmg, b.f, d.bdmg); else w.fx('spark', b.x, b.y); dead = true; break;
      }
      w.forNear(b.x, b.y, 34, a => {
        if (dead || !a.alive || a.inVeh || a.id === b.src || w.hidden(a)) return; if (!(w.hostile(b.f, a.f) || (a.f === CIV && b.boss))) return;
        const dx = a.x - b.x, dy = a.y - b.y; if (dx * dx + dy * dy > (a.r + 4) * (a.r + 4)) return;
        if (d.pierce) { if (b.hitIds?.includes(a.id)) return; (b.hitIds ??= []).push(a.id); w.hurtActor(a, b.dmg, b.f); w.fx('hit', b.x, b.y); return; }
        if (d.splash) w.explode(b.x, b.y, d.splash, b.dmg, b.f, d.bdmg); else { w.hurtActor(a, b.dmg, b.f); w.fx('hit', b.x, b.y, b.boss && b.f === 0 ? 1 : 0, undefined, a.f); }
        dead = true;
      });
      if (dead) break;
      for (const v of w.vehicles) {
        if (!v.alive || v.f === b.f) continue; const dx = v.x - b.x, dy = v.y - b.y; if (dx * dx + dy * dy > v.r * v.r) continue;
        if (v.f >= 0 && !w.hostile(b.f, v.f) && !(v.f === CIV && b.boss)) continue;
        if (v.f === CIV) w.crime(b.f, 0.15);
        if (d.splash) w.explode(b.x, b.y, d.splash, b.dmg, b.f, d.bdmg); else { w.hurtVehicle(v, b.dmg * (d.pierce ? 1.5 : 1), b.f); w.fx('spark', b.x, b.y); if (v.driver && v.ai === 'traffic') { v.idle = 99; } }
        if (!d.pierce) dead = true; break;
      }
    }
    if (dead) { bs[i] = bs[bs.length - 1]; bs.pop(); }
  }
}

// ---------- 차량 ----------
function traffic(w: World, v: Vehicle): void {
  const horiz = v.dir % 2 === 0, [dx, dy] = DIRS[v.dir], p = horiz ? v.x : v.y, q = horiz ? v.y : v.x, sign = horiz ? dx : dy;
  const k = Math.round((q - ROAD / 2) / PITCH), c = k * PITCH + ROAD / 2, lane = c + (v.dir === 0 ? 30 : v.dir === 2 ? -30 : v.dir === 1 ? -30 : 30), err = Math.max(-1, Math.min(1, (lane - q) / 50));
  v.wx = horiz ? dx : err; v.wy = horiz ? err : dy; v.throttle = 0.55; v.brake = false;
  const m = Math.round((p - ROAD / 2) / PITCH), s = (p - (m * PITCH + ROAD / 2)) * sign, key = m * 16 + k;
  if (s > -90 && s < -40 && v.turned !== key) {
    v.turned = key; const opts: number[] = [];
    const ahead = m + sign; if (ahead >= 0 && ahead <= BLOCKS) opts.push(v.dir, v.dir);
    for (const nd of [(v.dir + 1) % 4, (v.dir + 3) % 4]) { const [ndx, ndy] = DIRS[nd], nk = k + (horiz ? ndy : ndx); if (nk >= 0 && nk <= BLOCKS) opts.push(nd); }
    v.nextTurn = opts.length ? opts[Math.floor(w.rng() * opts.length)] : (v.dir + 2) % 4;
  }
  if (v.nextTurn !== v.dir && v.turned === key) { const right = v.nextTurn === (v.dir + 1) % 4; if (s >= (right ? -32 : 28) || v.nextTurn === (v.dir + 2) % 4) v.dir = v.nextTurn; }
  // 전방 장애물
  const fx = v.x + Math.cos(v.ang) * 52, fy = v.y + Math.sin(v.ang) * 52; let blocked = false;
  w.forNear(fx, fy, 30, a => { if (a.alive && !a.inVeh && Math.hypot(a.x - fx, a.y - fy) < 26) blocked = true; });
  if (!blocked) for (const o of w.vehicles) if (o !== v && o.alive && Math.hypot(o.x - fx, o.y - fy) < 34) { blocked = true; break; }
  if (blocked) { v.throttle = 0; v.brake = true; }
}
function chase(w: World, v: Vehicle, dt: number): void {
  const tf = w.factions[v.nextTurn], b = w.boss(v.nextTurn);
  if (!b || tf.wanted < 1) { v.idle += dt; v.throttle = 0; v.brake = true; if (v.idle > 4) { v.alive = false; const d = w.byId.get(v.driver); if (d) { d.alive = false; d.gone = true; w.byId.delete(d.id); } } return; }
  v.idle = 0; const d = Math.hypot(b.x - v.x, b.y - v.y); let gx = b.x, gy = b.y;
  v.pathT -= dt;
  if (d > 260 || !clearLine(w.map, v.x, v.y, b.x, b.y)) {
    if (v.pathT <= 0 && w.pathBudget > 0) { w.pathBudget--; v.path = findPath(w.map, v.x, v.y, b.x, b.y); v.pathI = 0; v.pathT = 1.1; }
    if (v.path && v.pathI < v.path.length) { gx = v.path[v.pathI]; gy = v.path[v.pathI + 1]; if (Math.hypot(gx - v.x, gy - v.y) < 60) v.pathI += 2; }
  }
  v.wx = gx - v.x; v.wy = gy - v.y; const m = Math.hypot(v.wx, v.wy) || 1; v.wx /= m; v.wy /= m; v.throttle = d < 120 ? 0.3 : 1; v.brake = false;
  if (v.rev > 0) { v.rev -= dt; v.wx = -Math.cos(v.ang); v.wy = -Math.sin(v.ang); v.throttle = 0.8; }
  else if (Math.hypot(v.vx, v.vy) < 25) { v.stuck += dt; if (v.stuck > 1.2) { v.stuck = 0; v.rev = 0.9; } } else v.stuck = 0;
  v.cd -= dt; if (v.cd <= 0 && d < 400 && w.canSee(v.x, v.y, b.x, b.y)) { v.cd = 0.4; w.shoot(v.x, v.y, Math.atan2(b.y - v.y, b.x - v.x), 'u_pistol', POLICE, v.driver, 1, false); }
}
export function updateVehicles(w: World, dt: number): void {
  const inp = w.input;
  for (const v of w.vehicles) {
    if (!v.alive) continue; const drv = v.driver ? w.byId.get(v.driver) : undefined;
    if (v.driver && (!drv || !drv.alive)) { v.driver = 0; v.f = -1; v.ai = ''; }
    if (v.burn > 0) {
      v.burn -= dt;
      if (v.burn <= 0) { v.alive = false; if (drv && drv.alive) { drv.inVeh = 0; drv.x = v.x + 20; w.hurtActor(drv, 70, -1, false); } v.driver = 0; w.explode(v.x, v.y, 120, 95, -1, 0.6); w.fx('wreck', v.x, v.y, v.ang); continue; }
    }
    v.throttle = 0; v.brake = false;
    const player = drv && drv.kind === 'boss' && drv.f === 0 && !w.opts.autoPlayer;
    if (player && drv) {
      const m = Math.hypot(inp.mx, inp.my); v.wx = inp.mx; v.wy = inp.my; v.throttle = Math.min(1, m); v.brake = inp.brake;
      drv.ang = Math.atan2(inp.ay - v.y, inp.ax - v.x); const f = w.factions[0];
      if (v.kind === 'tank') { v.cd -= dt; if (inp.fire && v.cd <= 0) { v.cd = 1.2; w.shoot(v.x + Math.cos(drv.ang) * 40, v.y + Math.sin(drv.ang) * 40, drv.ang, 'v_cannon', 0, drv.id, f.mods.dmg, true); w.fx('recoil', v.x, v.y); } }
      else { drv.x = v.x; drv.y = v.y; const id = f.slots[f.cur].id; bossFire(w, drv, f, inp.fire && id !== 'rocket' && id !== 'sniper' && id !== 'railgun', dt); }
    } else if (v.ai === 'traffic') {
      if (v.idle > 50 || v.hp < v.maxHp * 0.55) { if (drv) { drv.inVeh = 0; drv.x = v.x + Math.cos(v.ang + 1.57) * 34; drv.y = v.y + Math.sin(v.ang + 1.57) * 34; drv.fleeT = 8; drv.order = { type: 'wander', x: drv.x, y: drv.y }; } v.driver = 0; v.f = -1; v.ai = ''; v.idle = 0; }
      else traffic(w, v);
    } else if (v.ai === 'chase') chase(w, v, dt);
    // 물리
    const fx = Math.cos(v.ang), fy = Math.sin(v.ang); let sf = v.vx * fx + v.vy * fy; let lx = v.vx - fx * sf, ly = v.vy - fy * sf;
    const turn = v.kind === 'tank' ? 2.2 : 3.4, max = v.ai === 'traffic' ? 210 : v.maxSpeed * (v.hp < v.maxHp * 0.3 ? 0.7 : 1);
    if (v.throttle > 0.05) {
      const want = Math.atan2(v.wy, v.wx), diff = wrap(want - v.ang);
      if (Math.abs(diff) > 2.2 && sf < 80) { sf -= v.accel * 0.7 * dt; v.ang -= Math.max(-1, Math.min(1, wrap(want - v.ang - Math.PI))) * turn * dt * Math.min(1, Math.abs(sf) / 120) * -1; if (sf < -max * 0.4) sf = -max * 0.4; }
      else { v.ang += Math.max(-1, Math.min(1, diff * 2)) * turn * dt * Math.min(1, Math.abs(sf) / 140 + 0.2); sf += v.accel * v.throttle * (1 - Math.min(0.7, Math.abs(diff) / 3)) * dt; }
    } else sf *= Math.max(0, 1 - 1.6 * dt);
    if (v.brake) sf *= Math.max(0, 1 - 3.5 * dt);
    sf *= Math.max(0, 1 - 0.25 * dt); if (sf > max) sf = max;
    const grip = v.brake ? 2.2 : 8; lx *= Math.max(0, 1 - grip * dt); ly *= Math.max(0, 1 - grip * dt);
    if (player && Math.hypot(lx, ly) > 70) w.fx('skid', v.x, v.y, v.ang);
    const nfx = Math.cos(v.ang), nfy = Math.sin(v.ang); v.vx = nfx * sf + lx; v.vy = nfy * sf + ly;
    const ox = v.x, oy = v.y; v.x += v.vx * dt; v.y += v.vy * dt;
    if (resolveCircle(w.map, v, v.r)) {
      const imp = Math.hypot(v.vx, v.vy); v.vx = (v.x - ox) / dt * 0.5; v.vy = (v.y - oy) / dt * 0.5;
      if (imp > 240) { w.hurtVehicle(v, (imp - 200) * 0.12, -1); if (player) w.fx('crash', v.x, v.y, imp); }
      if (v.ai === 'traffic') v.idle += dt * 6;
    }
    const spd = Math.hypot(v.vx, v.vy);
    for (const o of w.vehicles) if (o !== v && o.alive && o.id > v.id) { const dx = o.x - v.x, dy = o.y - v.y, d = Math.hypot(dx, dy), min = v.r + o.r; if (d < min && d > 0.01) { const p = (min - d) / 2; v.x -= dx / d * p; v.y -= dy / d * p; o.x += dx / d * p; o.y += dy / d * p; const rel = Math.hypot(v.vx - o.vx, v.vy - o.vy); if (rel > 200) { w.hurtVehicle(v, rel * 0.05, o.f); w.hurtVehicle(o, rel * 0.05, v.f); w.fx('crash', v.x, v.y, rel); } const mx = (v.vx + o.vx) / 2, my = (v.vy + o.vy) / 2; v.vx = mx; v.vy = my; o.vx = mx; o.vy = my; } }
    w.forNear(v.x, v.y, v.r + 26, a => {
      if (!a.alive || a.inVeh) return; const dx = a.x - v.x, dy = a.y - v.y, d = Math.hypot(dx, dy) || 1, min = v.r + a.r; if (d >= min) return;
      a.x = v.x + dx / d * min; a.y = v.y + dy / d * min;
      if (spd > 150 && a.runCd <= 0 && v.driver && (a.f === CIV || w.hostile(v.f, a.f))) { a.runCd = 0.5; w.hurtActor(a, (spd - 90) * (v.kind === 'tank' ? 0.9 : 0.42), v.f); w.fx('splat', a.x, a.y); if (!ACTORS[a.kind].mech) { a.vx += v.vx * 0.6; a.vy += v.vy * 0.6; } else { v.vx *= 0.5; v.vy *= 0.5; w.hurtVehicle(v, 30, a.f); } }
    });
    if (v.ai === 'traffic' && spd < 12) v.idle += dt; else if (v.ai === 'traffic' && v.idle < 90) v.idle = Math.max(0, v.idle - dt * 3);
    if (drv && drv.alive) { drv.x = v.x; drv.y = v.y; if (!player) drv.ang = v.ang; }
  }
}

// ---------- 시민·교통·경찰 ----------
export function updatePopulation(w: World, init: boolean): void {
  const pb = w.boss(0), z = w.zone; let peds = 0, cars = 0, cops = 0, ccars = 0;
  for (const a of w.actors) if (a.alive) { if (a.f === CIV && !a.inVeh) peds++; if (a.f === POLICE && a.order.type === 'hunt') cops++; }
  for (const v of w.vehicles) if (v.alive) { if (v.ai === 'traffic') cars++; if (v.ai === 'chase') ccars++; }
  const far = (x: number, y: number, d: number): boolean => init || !pb || Math.hypot(pb.x - x, pb.y - y) > d;
  const inZone = (x: number, y: number): boolean => Math.hypot(x - z.x, y - z.y) < z.r - 40;
  if (peds < 34) for (let k = 0; k < 4; k++) {
    const bl = w.map.blocks[Math.floor(w.rng() * w.map.blocks.length)]; if (bl.type === 'base') continue; const t = w.rng() * 400 + 20, side = Math.floor(w.rng() * 4);
    const x = bl.x + (side === 0 ? 14 : side === 1 ? 426 : t), y = bl.y + (side === 2 ? 14 : side === 3 ? 426 : t);
    if (navBlocked(w.map, x, y) || !far(x, y, 750) || !inZone(x, y)) continue;
    const c = w.spawnActor('civ', CIV, x, y); c.order = { type: 'wander', x, y }; c.slot = Math.floor(w.rng() * 6); break;
  }
  if (cars < 16) for (let k = 0; k < 4; k++) {
    const p = lanePoint(w.rng); if (!far(p.x, p.y, 850) || !inZone(p.x, p.y) || w.vehicles.some(v => Math.hypot(v.x - p.x, v.y - p.y) < 90)) continue;
    const r = w.rng(), v = w.spawnVehicle(r < 0.12 ? 'sports' : r < 0.3 ? 'truck' : 'sedan', p.x, p.y, p.dir * Math.PI / 2); v.dir = p.dir; v.nextTurn = p.dir; v.ai = 'traffic';
    const d = w.spawnActor('civ', CIV, p.x, p.y); d.inVeh = v.id; v.driver = d.id; v.f = CIV; break;
  }
  if (!pb) return; const stars = Math.floor(w.factions[0].wanted);
  const wantCops = [0, 2, 3, 4, 6, 8][stars], wantCars = [0, 0, 1, 2, 2, 3][stars];
  const spot = (): { x: number; y: number; dir: number } | null => { for (let k = 0; k < 12; k++) { const p = lanePoint(w.rng), d = Math.hypot(p.x - pb.x, p.y - pb.y); if (d > 620 && d < 1150) return p; } return null; };
  if (cops < wantCops) { const p = spot(); if (p) { const c = w.spawnActor(stars >= 3 ? 'swat' : 'cop', POLICE, p.x, p.y); c.order = { type: 'hunt', x: 0, y: 0 }; c.home = 0; } }
  if (ccars < wantCars) { const p = spot(); if (p && !w.vehicles.some(v => Math.hypot(v.x - p.x, v.y - p.y) < 90)) { const v = w.spawnVehicle('police', p.x, p.y, p.dir * Math.PI / 2); v.ai = 'chase'; v.nextTurn = 0; v.f = POLICE; const d = w.spawnActor('cop', POLICE, p.x, p.y); d.inVeh = v.id; v.driver = d.id; } }
}
export { VEHICLES };

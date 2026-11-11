import type { WeaponDef, WeaponLevel } from "../../data/schema";
import { damageEnemy, spawnProjectile } from "../spawn";
import { PROJ_BOOMERANG } from "../pool";
import type { WeaponState, World } from "../types";
import { nearestTarget } from "./target";
export function fireBeam(
  w: World,
  _s: WeaponState,
  _def: WeaponDef,
  lv: WeaponLevel,
): boolean {
  const j = nearestTarget(w, w.firstPerson ? lv.range || 240 : Infinity);
  if (j < 0) return false;
  const p = w.player,
    e = w.enemies;
  const angle = w.firstPerson
      ? Math.atan2(p.faceY, p.faceX)
      : Math.atan2(e.y[j] - p.y, e.x[j] - p.x),
    ux = Math.cos(angle),
    uy = Math.sin(angle),
    range = lv.range || 240;
  let hit = false;
  for (let i = 0; i < e.count; i++) {
    if (e.hp[i] <= 0) continue;
    const dx = e.x[i] - p.x,
      dy = e.y[i] - p.y,
      along = dx * ux + dy * uy,
      across = Math.abs(dx * uy - dy * ux);
    if (
      along >= 0 &&
      along <= range &&
      across < e.r[i] + 5 * lv.area * p.stats.area
    ) {
      hit = true;
      damageEnemy(w, i, lv.damage * p.stats.damage, ux, uy, 4);
    }
  }
  if (w.firstPerson && !hit) return false;
  w.events.push({
    t: "beam",
    x: p.x,
    y: p.y,
    tx: p.x + ux * range,
    ty: p.y + uy * range,
  });
  return true;
}
export function fireBoomerang(
  w: World,
  s: WeaponState,
  _def: WeaponDef,
  lv: WeaponLevel,
): boolean {
  const j = nearestTarget(w);
  if (j < 0) return false;
  const p = w.player;
  const a = Math.atan2(w.enemies.y[j] - p.y, w.enemies.x[j] - p.x);
  for (let k = 0; k < lv.count; k++) {
    const angle = a + (k - (lv.count - 1) / 2) * 0.35;
    const before = w.projectiles.count;
    spawnProjectile(
      w,
      s.def,
      p.x,
      p.y,
      Math.cos(angle) * lv.speed,
      Math.sin(angle) * lv.speed,
      5 * lv.area,
      lv.damage * p.stats.damage,
      lv.pierce,
      lv.life,
    );
    if (w.projectiles.count > before) w.projectiles.hp[before] = PROJ_BOOMERANG;
  }
  return true;
}
export function fireStorm(
  w: World,
  s: WeaponState,
  _def: WeaponDef,
  lv: WeaponLevel,
): boolean {
  for (let k = 0; k < lv.count; k++) {
    const a = (k * Math.PI * 2) / lv.count + w.time * 0.3;
    spawnProjectile(
      w,
      s.def,
      w.player.x,
      w.player.y,
      Math.cos(a) * lv.speed,
      Math.sin(a) * lv.speed,
      3 * lv.area,
      lv.damage * w.player.stats.damage,
      lv.pierce,
      lv.life,
    );
  }
  return true;
}

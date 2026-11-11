import { DT, type World } from '../types';
import { WEAPON_PATTERNS } from '../weapons';

/** 무기 쿨다운을 돌리고, 준비되면 패턴 구현을 불러 발사한다. */
export function weapons(world: World): void {
  const { player, data } = world;
  for (const w of player.weapons) {
    w.cooldown -= DT;
    if (w.cooldown > 0) continue;
    const def = data.weapons[w.def];
    const lv = def.levels[w.level - 1];
    if (WEAPON_PATTERNS[def.pattern](world, w, def, lv)) {
      w.cooldown = lv.cooldown * player.stats.cooldown;
      world.events.push({ t: 'fire', weapon: def.id, x: player.x, y: player.y });
    } else {
      w.cooldown = 0;
    }
  }
}

import balance from '../../data/balance.json';
import enemies from '../../data/enemies.json';
import passives from '../../data/passives.json';
import stages from '../../data/stages.json';
import weapons from '../../data/weapons.json';
import { buildGameData } from './load';
import type { GameData } from './schema';

export type * from './schema';
export { buildGameData } from './load';

/** 번들에 포함된 data/*.json을 검증해서 돌려준다. 브라우저와 Node(테스트, 도구) 양쪽에서 쓴다. */
export function loadGameData(): GameData {
  return buildGameData({ enemies, weapons, passives, stages, balance });
}

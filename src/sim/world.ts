import type { GameData } from '../data/schema';
import { createPool } from './pool';
import { createRng } from './rng';
import { SpatialHash } from './spatialHash';
import { cleanup } from './systems/cleanup';
import { collision } from './systems/collision';
import { enemyAI } from './systems/enemyAI';
import { applyCommands } from './systems/input';
import { movement } from './systems/movement';
import { pickups } from './systems/pickups';
import { progression, recomputeStats, xpForLevel } from './systems/progression';
import { projectiles } from './systems/projectiles';
import { separation } from './systems/separation';
import { spawner } from './systems/spawner';
import { createStageState, stage } from './systems/stage';
import { weapons } from './systems/weapons';
import { DT, type Command, type World } from './types';

const ENEMY_CAPACITY = 1500;
const PROJECTILE_CAPACITY = 2000;
const PICKUP_CAPACITY = 1000;
const CELL_SIZE = 32;

export function createWorld(data: GameData, seed: number): World {
  const b = data.balance.player;
  const world: World = {
    tick: 0,
    time: 0,
    rng: createRng(seed),
    data,
    player: {
      x: 0, y: 0, px: 0, py: 0,
      moveX: 0, moveY: 0, faceX: 1, faceY: 0,
      hp: b.hp,
      invuln: 0,
      level: 1,
      xp: 0,
      xpToNext: xpForLevel(data, 1),
      weapons: [{ def: data.weaponIndex[data.balance.startingWeapon], level: 1, cooldown: 0 }],
      passives: [],
      stats: { moveSpeed: b.moveSpeed, maxHp: b.hp, damage: 1, cooldown: 1, area: 1, pickupRange: b.pickupRange, xpGain: 1, armor: 0 },
    },
    enemies: createPool(ENEMY_CAPACITY),
    projectiles: createPool(PROJECTILE_CAPACITY),
    pickups: createPool(PICKUP_CAPACITY),
    hash: new SpatialHash(CELL_SIZE, ENEMY_CAPACITY),
    stage: createStageState(data.stages.stages[0].waves.length),
    events: [],
    paused: false,
    pendingChoices: null,
    pendingLevelUps: 0,
    over: false,
    stats: { kills: 0, score: 0, time: 0, level: 1, damageTaken: 0, victory: false },
    nextId: 1,
    maxEnemyRadius: Math.max(...data.enemies.map((e) => e.radius)),
  };
  recomputeStats(world.player, data);
  return world;
}

/**
 * sim을 한 틱(DT초) 진행한다. 시스템 순서는 고정이며 바꾸면 결정성 테스트가 깨질 수 있다.
 * 일시정지, 레벨업 선택 대기, 판 종료 상태에서는 명령만 처리하고 시간은 흐르지 않는다.
 */
export function step(world: World, commands: readonly Command[]): void {
  world.events.length = 0;
  applyCommands(world, commands);
  if (world.over || world.paused || world.pendingChoices) return;

  world.tick++;
  world.time += DT;

  stage(world);
  spawner(world);
  enemyAI(world);
  weapons(world);
  movement(world);
  projectiles(world);
  collision(world);
  separation(world);
  pickups(world);
  progression(world);
  cleanup(world);
}

/** 결정성 테스트와 리플레이 검증용 상태 해시 */
export function hashWorld(world: World): number {
  let h = 2166136261;
  const mix = (v: number) => {
    h = Math.imul(h ^ (Math.round(v * 100) | 0), 16777619);
  };
  const p = world.player;
  [world.tick, p.x, p.y, p.hp, p.xp, p.level, world.stats.kills, world.rng.s].forEach(mix);
  for (const pool of [world.enemies, world.projectiles, world.pickups]) {
    mix(pool.count);
    for (let i = 0; i < pool.count; i++) {
      mix(pool.id[i]);
      mix(pool.x[i]);
      mix(pool.y[i]);
      mix(pool.hp[i]);
    }
  }
  return h >>> 0;
}

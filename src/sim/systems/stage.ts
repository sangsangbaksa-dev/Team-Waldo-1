import { next } from '../rng';
import { spawnEnemy } from '../spawn';
import { DT, type StageState, type World } from '../types';

export function createStageState(waveCount: number): StageState {
  return {
    index: 0,
    time: 0,
    waveAcc: new Array<number>(waveCount).fill(0),
    waveFired: new Array<boolean>(waveCount).fill(false),
    minibossSpawned: false,
    bossSpawned: false,
    bossId: 0,
  };
}

function spawnAtEdge(world: World, kind: number, hpScale: number): number {
  // Keep the spawn pending when the enemy pool is full instead of consuming RNG
  // and permanently marking a boss that could not be created.
  if (world.enemies.count >= world.enemies.capacity) return 0;
  const a = next(world.rng) * Math.PI * 2;
  const r = world.data.balance.spawnRadius;
  return spawnEnemy(world, kind, world.player.x + Math.cos(a) * r, world.player.y + Math.sin(a) * r, hpScale);
}

/** 구간 시간 진행, 미니보스, 구간 전환, 마지막 보스. */
export function stage(world: World): void {
  const st = world.stage;
  const { stages, boss } = world.data.stages;
  const def = stages[st.index];
  if (st.bossSpawned) return;

  st.time += DT;

  // Once the stage times out, prioritize its transition or final boss over an overdue miniboss.
  if (st.time < def.duration && def.miniboss && !st.minibossSpawned && st.time >= def.miniboss.at) {
    const id = spawnAtEdge(world, world.data.enemyIndex[def.miniboss.enemy], def.miniboss.hpScale);
    if (id) {
      st.minibossSpawned = true;
      world.events.push({ t: 'bossSpawn', id, miniboss: true });
    }
  }

  if (st.time < def.duration) return;

  if (st.index < stages.length - 1) {
    const nextDef = stages[st.index + 1];
    st.index++;
    st.time = 0;
    st.waveAcc = new Array<number>(nextDef.waves.length).fill(0);
    st.waveFired = new Array<boolean>(nextDef.waves.length).fill(false);
    st.minibossSpawned = false;
    world.events.push({ t: 'stageStart', index: st.index });
  } else {
    const id = spawnAtEdge(world, world.data.enemyIndex[boss.enemy], boss.hpScale);
    if (!id) return; // Try again next tick once a slot has been freed.
    st.bossSpawned = true;
    st.bossId = id;
    world.events.push({ t: 'bossSpawn', id, miniboss: false });
  }
}

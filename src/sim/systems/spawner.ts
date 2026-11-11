import type { WaveDef } from '../../data/schema';
import { next, range } from '../rng';
import { spawnEnemy } from '../spawn';
import { DT, type World } from '../types';

function spawnGroup(world: World, wave: WaveDef, count: number, maxAlive: number): void {
  const { player, rng } = world;
  const kind = world.data.enemyIndex[wave.enemy];
  const radius = world.data.balance.spawnRadius;
  const baseAngle = next(rng) * Math.PI * 2;

  for (let k = 0; k < count; k++) {
    if (world.enemies.count >= maxAlive) return;
    let a: number;
    let r = radius;
    if (wave.pattern === 'ring') {
      a = baseAngle + (k / count) * Math.PI * 2;
    } else if (wave.pattern === 'swarm') {
      a = baseAngle + range(rng, -0.25, 0.25);
      r = radius + range(rng, 0, 60);
    } else {
      a = world.firstPerson && world.time < 14
        ? Math.atan2(player.faceY, player.faceX) + range(rng, -.57, .57)
        : next(rng) * Math.PI * 2;
    }
    spawnEnemy(world, kind, player.x + Math.cos(a) * r, player.y + Math.sin(a) * r);
  }
}

/** stages.json의 웨이브를 읽어 플레이어 주변 화면 밖에 적을 만든다. */
export function spawner(world: World): void {
  const st = world.stage;
  if (st.bossSpawned) return;
  const def = world.data.stages.stages[st.index];

  def.waves.forEach((wave, i) => {
    if ('at' in wave) {
      if (!st.waveFired[i] && st.time >= wave.at) {
        st.waveFired[i] = true;
        spawnGroup(world, wave, wave.count, def.maxAlive);
      }
    } else if (st.time >= wave.from && st.time < wave.to) {
      st.waveAcc[i] += wave.rate * DT;
      const n = Math.floor(st.waveAcc[i]);
      if (n > 0) {
        st.waveAcc[i] -= n;
        spawnGroup(world, wave, n, def.maxAlive);
      }
    }
  });
}

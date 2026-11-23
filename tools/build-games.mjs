// 허브와 따로 빌드되는 게임(games/<id>)을 dist/<id>/ 로 빌드해 허브 배포에 함께 싣습니다.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const games = ['parry-gladiator', 'dead-ground'];

for (const id of games) {
  const cwd = resolve(root, 'games', id);
  const env = { ...process.env, VITE_ROOM_TRANSPORT: 'relay' };
  for (const args of [['ci'], ['run', 'build', '--', '--outDir', resolve(root, 'dist', id), '--emptyOutDir']]) {
    const result = spawnSync('npm', args, { cwd, env, stdio: 'inherit' });
    if (result.status !== 0) {
      console.error(`games/${id}: npm ${args.join(' ')} failed`);
      process.exit(result.status ?? 1);
    }
  }
}

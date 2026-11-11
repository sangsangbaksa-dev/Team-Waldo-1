// CI용: data/*.json이 스키마와 id 참조를 통과하는지 확인한다.
import { loadGameData } from '../src/data';

try {
  const d = loadGameData();
  console.log(
    `data OK: 적 ${d.enemies.length}종, 무기 ${d.weapons.length}종, 패시브 ${d.passives.length}종, 구간 ${d.stages.stages.length}개`,
  );
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}

import { z } from 'zod';
import {
  BalanceSchema,
  EnemySchema,
  PassiveSchema,
  StagesFileSchema,
  WeaponSchema,
  type GameData,
} from './schema';

export interface RawData {
  enemies: unknown;
  weapons: unknown;
  passives: unknown;
  stages: unknown;
  balance: unknown;
}

function parse<T>(file: string, schema: z.ZodType<T>, raw: unknown): T {
  const r = schema.safeParse(raw);
  if (!r.success) {
    const lines = r.error.issues.map((i) => `  ${file} → ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`데이터 검증 실패\n${lines.join('\n')}`);
  }
  return r.data;
}

function indexById(file: string, list: { id: string }[]): Record<string, number> {
  const index: Record<string, number> = {};
  list.forEach((item, i) => {
    if (item.id in index) throw new Error(`${file}: id "${item.id}"가 중복됩니다.`);
    index[item.id] = i;
  });
  return index;
}

/** JSON을 검증하고 id 참조를 확인해 GameData로 만든다. 실패하면 어느 파일 어느 필드인지 담아 던진다. */
export function buildGameData(raw: RawData): GameData {
  const enemies = parse('enemies.json', z.array(EnemySchema).min(1), raw.enemies);
  const weapons = parse('weapons.json', z.array(WeaponSchema).min(1), raw.weapons);
  const passives = parse('passives.json', z.array(PassiveSchema), raw.passives);
  const stages = parse('stages.json', StagesFileSchema, raw.stages);
  const balance = parse('balance.json', BalanceSchema, raw.balance);

  const enemyIndex = indexById('enemies.json', enemies);
  const weaponIndex = indexById('weapons.json', weapons);
  const passiveIndex = indexById('passives.json', passives);

  const needEnemy = (id: string, where: string) => {
    if (!(id in enemyIndex)) throw new Error(`stages.json → ${where}: 적 "${id}"가 enemies.json에 없습니다.`);
  };
  stages.stages.forEach((s) => {
    s.waves.forEach((w, i) => needEnemy(w.enemy, `${s.id}.waves[${i}]`));
    if (s.miniboss) needEnemy(s.miniboss.enemy, `${s.id}.miniboss`);
  });
  needEnemy(stages.boss.enemy, 'boss');
  if (!(balance.startingWeapon in weaponIndex)) {
    throw new Error(`balance.json → startingWeapon: 무기 "${balance.startingWeapon}"가 weapons.json에 없습니다.`);
  }

  return { enemies, weapons, passives, stages, balance, enemyIndex, weaponIndex, passiveIndex };
}

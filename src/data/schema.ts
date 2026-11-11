// data/*.json의 유일한 정의. TS 타입은 여기서 추론한다.
import { z } from "zod";

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const EnemySchema = z.object({
  id: z.string().min(1),
  base: z.string(),
  sprite: z.string(),
  palette: z.string(),
  /** 스프라이트가 준비되기 전까지 쓰는 임시 색 */
  placeholderColor: color.default("#ff00ff"),
  hp: z.number().positive(),
  speed: z.number().nonnegative(),
  damage: z.number().nonnegative(),
  radius: z.number().positive(),
  xp: z.number().nonnegative(),
  behavior: z.enum(["chase", "dash", "ranged", "swarm", "tank"]),
  knockbackResist: z.number().min(0).max(1).default(0),
});

export const WeaponLevelSchema = z.object({
  damage: z.number().positive(),
  cooldown: z.number().positive(),
  count: z.number().int().positive(),
  speed: z.number().nonnegative(),
  pierce: z.number().int().nonnegative(),
  area: z.number().positive(),
  life: z.number().positive(),
  /** orbit: 플레이어로부터의 거리, aura: 반경. projectile은 쓰지 않는다 */
  range: z.number().nonnegative().default(0),
});

export const WeaponSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  icon: z.string(),
  pattern: z.enum([
    "projectile",
    "orbit",
    "aura",
    "beam",
    "boomerang",
    "storm",
  ]),
  targeting: z.enum(["nearest", "random", "facing", "none"]),
  placeholderColor: color.default("#ffffff"),
  levels: z.array(WeaponLevelSchema).min(1),
});

export const StatSchema = z.enum([
  "moveSpeed",
  "maxHp",
  "damage",
  "cooldown",
  "area",
  "pickupRange",
  "xpGain",
  "armor",
]);

export const PassiveSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  icon: z.string(),
  maxLevel: z.number().int().positive(),
  stat: StatSchema,
  op: z.enum(["add", "mul"]),
  perLevel: z.number(),
});

const spawnPattern = z.enum(["random_edge", "ring", "swarm"]);

export const WaveSchema = z.union([
  // 지속 웨이브: from~to 초 동안 초당 rate 마리
  z.object({
    from: z.number().nonnegative(),
    to: z.number().positive(),
    enemy: z.string(),
    rate: z.number().positive(),
    pattern: spawnPattern,
  }),
  // 일회성 웨이브: at 초에 count 마리
  z.object({
    at: z.number().nonnegative(),
    enemy: z.string(),
    count: z.number().int().positive(),
    pattern: spawnPattern,
  }),
]);

export const StageSchema = z.object({
  id: z.string().min(1),
  duration: z.number().positive(),
  maxAlive: z.number().int().positive(),
  waves: z.array(WaveSchema),
  miniboss: z
    .object({
      enemy: z.string(),
      at: z.number().nonnegative(),
      hpScale: z.number().positive().default(1),
    })
    .optional(),
});

export const StagesFileSchema = z.object({
  map: z.string(),
  stages: z.array(StageSchema).min(1),
  boss: z.object({
    enemy: z.string(),
    hpScale: z.number().positive().default(1),
  }),
});

export const BalanceSchema = z.object({
  player: z.object({
    hp: z.number().positive(),
    moveSpeed: z.number().positive(),
    pickupRange: z.number().positive(),
    radius: z.number().positive(),
    invulnTime: z.number().nonnegative(),
  }),
  xpCurve: z.object({ base: z.number().positive(), growth: z.number().min(1) }),
  choicesPerLevel: z.number().int().positive(),
  maxWeapons: z.number().int().positive(),
  maxPassives: z.number().int().positive(),
  startingWeapon: z.string(),
  spawnRadius: z.number().positive(),
  score: z.object({
    perKillXp: z.number(),
    perSecond: z.number(),
    bossBonus: z.number(),
  }),
});

export type EnemyDef = z.infer<typeof EnemySchema>;
export type WeaponDef = z.infer<typeof WeaponSchema>;
export type WeaponLevel = z.infer<typeof WeaponLevelSchema>;
export type PassiveDef = z.infer<typeof PassiveSchema>;
export type Stat = z.infer<typeof StatSchema>;
export type WaveDef = z.infer<typeof WaveSchema>;
export type StageDef = z.infer<typeof StageSchema>;
export type StagesFile = z.infer<typeof StagesFileSchema>;
export type Balance = z.infer<typeof BalanceSchema>;

/** 검증이 끝난 게임 데이터. sim은 이것만 읽는다. */
export interface GameData {
  enemies: EnemyDef[];
  weapons: WeaponDef[];
  passives: PassiveDef[];
  stages: StagesFile;
  balance: Balance;
  enemyIndex: Record<string, number>;
  weaponIndex: Record<string, number>;
  passiveIndex: Record<string, number>;
}

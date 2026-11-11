// sim과 바깥(render, scenes, tools)이 공유하는 타입. 바꿀 때는 리드 리뷰.
import type { GameData } from "../data/schema";
import type { Pool } from "./pool";
import type { Rng } from "./rng";
import type { SpatialHash } from "./spatialHash";

/** sim 틱 주파수와 한 틱의 길이(초) */
export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;

export type EntityId = number;

/** 바깥에서 sim으로 들어가는 유일한 입력 */
export type Command =
  | { t: "move"; x: number; y: number }
  | { t: "look"; x: number; y: number }
  | { t: "choose"; index: number }
  | { t: "pause" }
  | { t: "resume" };

export interface UpgradeChoice {
  kind: "weapon" | "passive" | "heal";
  /** 무기/패시브 id. heal은 'heal' */
  id: string;
  name: string;
  /** 선택하면 도달하는 레벨 */
  level: number;
  isNew: boolean;
}

export interface RunStats {
  kills: number;
  score: number;
  time: number;
  level: number;
  damageTaken: number;
  victory: boolean;
}

/** sim에서 바깥으로 나가는 연출용 이벤트. 매 틱 world.events에 쌓이고 다음 틱에 비워진다. */
export type SimEvent =
  | { t: "beam"; x: number; y: number; tx: number; ty: number }
  | { t: "hit"; target: EntityId; x: number; y: number; dmg: number }
  | { t: "kill"; target: EntityId; kind: number; x: number; y: number }
  | { t: "playerHurt"; dmg: number; hp: number }
  | { t: "fire"; weapon: string; x: number; y: number }
  | { t: "pickup"; value: number }
  | { t: "levelUp"; level: number; choices: UpgradeChoice[] }
  | { t: "stageStart"; index: number }
  | { t: "bossSpawn"; id: EntityId; miniboss: boolean }
  | { t: "runEnd"; victory: boolean; stats: RunStats };

export interface WeaponState {
  /** data.weapons 인덱스 */
  def: number;
  /** 1부터 시작 */
  level: number;
  cooldown: number;
}

export interface PassiveState {
  def: number;
  level: number;
}

/** 패시브가 반영된 최종 스탯. 레벨업 때만 다시 계산한다. */
export interface PlayerStats {
  moveSpeed: number;
  maxHp: number;
  damage: number;
  cooldown: number;
  area: number;
  pickupRange: number;
  xpGain: number;
  armor: number;
}

export interface PlayerState {
  x: number;
  y: number;
  px: number;
  py: number;
  moveX: number;
  moveY: number;
  /** 마지막으로 움직인 방향 (facing 타깃팅용) */
  faceX: number;
  faceY: number;
  hp: number;
  invuln: number;
  level: number;
  xp: number;
  xpToNext: number;
  weapons: WeaponState[];
  passives: PassiveState[];
  stats: PlayerStats;
}

export interface StageState {
  index: number;
  /** 현재 구간에서 흐른 시간(초) */
  time: number;
  waveAcc: number[];
  waveFired: boolean[];
  minibossSpawned: boolean;
  bossSpawned: boolean;
  bossId: EntityId;
}

export interface World {
  tick: number;
  time: number;
  rng: Rng;
  data: GameData;
  player: PlayerState;
  enemies: Pool;
  projectiles: Pool;
  pickups: Pool;
  hash: SpatialHash;
  stage: StageState;
  events: SimEvent[];
  /** 사용자가 건 일시정지 */
  paused: boolean;
  /** 레벨업 선택 대기 중이면 non-null. 이 동안 sim은 멈춘다. */
  pendingChoices: UpgradeChoice[] | null;
  pendingLevelUps: number;
  over: boolean;
  stats: RunStats;
  nextId: EntityId;
  maxEnemyRadius: number;
}

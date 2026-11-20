// OUTLAW CITY — 공용 타입과 상수. 모든 모듈(world/vehicle/peds/traffic/police/missions/view/audio/game)이 이 계약을 기준으로 맞물립니다.
// 좌표계: x, z 는 수평면, y 는 위. 방향각(yaw, h)은 앞 방향이 (cos, sin) 입니다(= x 축에서 z 축 쪽으로 증가). 단위는 미터·초·라디안.
// 이 파일의 타입을 바꾸면 모든 모듈이 영향을 받으니, 필드를 "추가"하는 것 외에는 하지 마세요.

export const TAU = Math.PI * 2;
export const GRAVITY = 24;
export const PLAYER_ID = 1;

// ---------- 무기 ----------
export type WeaponId = 'fist' | 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'sniper' | 'rocket' | 'bat' | 'grenade' | 'minigun' | 'railgun';
export interface WeaponDef {
  id: WeaponId; name: string;
  /** 한 발(펠릿) 피해 */ dmg: number; pellets: number;
  /** 발사 간격(초) */ cd: number; mag: number; /** 최대 예비 탄 */ reserve: number; reload: number; auto: boolean;
  /** 탄퍼짐(라디안) */ spread: number; range: number; /** 머리 배율 */ head: number; recoil: number;
  /** 총소리가 범죄/경계로 들리는 반경(m) */ noise: number; /** 총기점 가격 */ price: number; melee: boolean;
}
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  fist:    { id: 'fist',    name: '주먹',     dmg: 14, pellets: 1, cd: 0.42, mag: 0,  reserve: 0,   reload: 0,   auto: false, spread: 0,     range: 1.9, head: 1,   recoil: 0,     noise: 6,   price: 0,    melee: true },
  pistol:  { id: 'pistol',  name: '권총',     dmg: 24, pellets: 1, cd: 0.2,  mag: 12, reserve: 96,  reload: 1.3, auto: false, spread: 0.012, range: 120, head: 2.0, recoil: 0.02,  noise: 55,  price: 250,  melee: false },
  smg:     { id: 'smg',     name: '기관단총', dmg: 16, pellets: 1, cd: 0.08, mag: 30, reserve: 180, reload: 1.7, auto: true,  spread: 0.03,  range: 100, head: 1.7, recoil: 0.014, noise: 70,  price: 900,  melee: false },
  shotgun: { id: 'shotgun', name: '샷건',     dmg: 12, pellets: 9, cd: 0.85, mag: 6,  reserve: 36,  reload: 2.4, auto: false, spread: 0.08,  range: 45,  head: 1.4, recoil: 0.09,  noise: 85,  price: 1400, melee: false },
  rifle:   { id: 'rifle',   name: '돌격소총', dmg: 28, pellets: 1, cd: 0.11, mag: 30, reserve: 150, reload: 2.0, auto: true,  spread: 0.016, range: 220, head: 1.8, recoil: 0.02,  noise: 100, price: 2800, melee: false },
  sniper:  { id: 'sniper',  name: '저격총',   dmg: 95, pellets: 1, cd: 1.3,  mag: 5,  reserve: 30,  reload: 2.7, auto: false, spread: 0.0015, range: 500, head: 2.2, recoil: 0.1,  noise: 130, price: 4200, melee: false },
  rocket:  { id: 'rocket',  name: '로켓포',   dmg: 260, pellets: 1, cd: 1.8, mag: 1,  reserve: 6,   reload: 2.8, auto: false, spread: 0,     range: 300, head: 1,   recoil: 0.12,  noise: 150, price: 7000, melee: false },
  bat:     { id: 'bat',     name: '야구방망이', dmg: 38, pellets: 1, cd: 0.55, mag: 0, reserve: 0,   reload: 0,   auto: false, spread: 0,     range: 2.4, head: 1,   recoil: 0,     noise: 10,  price: 120,  melee: true },
  grenade: { id: 'grenade', name: '수류탄',   dmg: 220, pellets: 1, cd: 0.9, mag: 1,  reserve: 8,   reload: 0.9, auto: false, spread: 0,     range: 40,  head: 1,   recoil: 0.03,  noise: 90,  price: 1200, melee: false },
  minigun: { id: 'minigun', name: '미니건',   dmg: 15, pellets: 1, cd: 0.045, mag: 200, reserve: 600, reload: 4.2, auto: true, spread: 0.055, range: 150, head: 1.3, recoil: 0.008, noise: 130, price: 14000, melee: false },
  railgun: { id: 'railgun', name: '레일건',   dmg: 420, pellets: 1, cd: 1.5, mag: 4,  reserve: 16,  reload: 3.2, auto: false, spread: 0,     range: 600, head: 1.5, recoil: 0.1,   noise: 60,  price: 18000, melee: false },
};
export const WEAPON_ORDER: WeaponId[] = ['fist', 'pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'rocket', 'bat', 'grenade', 'minigun', 'railgun'];
export interface Gun { id: WeaponId; mag: number; reserve: number }

// ---------- 차량 ----------
export type VehicleKind = 'sedan' | 'sports' | 'suv' | 'taxi' | 'truck' | 'van' | 'hatch' | 'police' | 'buggy' | 'tank' | 'gt' | 'muscle' | 'hyper' | 'ambulance';
export interface VehicleDef {
  kind: VehicleKind; name: string;
  /** vehicles.glb 안의 노드 이름 */ model: string;
  hp: number; /** 질량(상대값, 충돌 반응) */ mass: number;
  /** 최고 속도 m/s */ top: number; /** 가속 m/s² */ accel: number; /** 제동 m/s² */ brake: number;
  /** 옆 방향 그립(클수록 안 미끄러짐) */ grip: number; /** 조향 민감도 배율 */ turn: number;
  halfL: number; halfW: number; height: number; seats: number;
}
export const VEHICLES: Record<VehicleKind, VehicleDef> = {
  sedan:  { kind: 'sedan',  name: '세단',     model: 'sedan',  hp: 260, mass: 1.0, top: 44, accel: 13, brake: 40, grip: 7.5, turn: 1.0,  halfL: 2.35, halfW: 1.0,  height: 1.5, seats: 4 },
  sports: { kind: 'sports', name: '스포츠카', model: 'sports', hp: 220, mass: 0.9, top: 62, accel: 19, brake: 48, grip: 8.5, turn: 1.1,  halfL: 2.25, halfW: 1.0,  height: 1.2, seats: 2 },
  suv:    { kind: 'suv',    name: 'SUV',      model: 'suv',    hp: 340, mass: 1.5, top: 42, accel: 11, brake: 38, grip: 7.0, turn: 0.9,  halfL: 2.4,  halfW: 1.05, height: 1.9, seats: 5 },
  taxi:   { kind: 'taxi',   name: '택시',     model: 'taxi',   hp: 260, mass: 1.0, top: 42, accel: 12, brake: 40, grip: 7.5, turn: 1.0,  halfL: 2.35, halfW: 1.0,  height: 1.5, seats: 4 },
  truck:  { kind: 'truck',  name: '트럭',     model: 'truck',  hp: 520, mass: 3.2, top: 32, accel: 7,  brake: 30, grip: 6.0, turn: 0.65, halfL: 3.6,  halfW: 1.2,  height: 2.6, seats: 2 },
  van:    { kind: 'van',    name: '밴',       model: 'van',    hp: 340, mass: 1.8, top: 36, accel: 9,  brake: 34, grip: 6.5, turn: 0.8,  halfL: 2.8,  halfW: 1.1,  height: 2.1, seats: 3 },
  hatch:  { kind: 'hatch',  name: '해치백',   model: 'hatch',  hp: 200, mass: 0.8, top: 40, accel: 14, brake: 38, grip: 8.0, turn: 1.1,  halfL: 2.1,  halfW: 0.95, height: 1.45, seats: 4 },
  police: { kind: 'police', name: '경찰차',   model: 'police', hp: 340, mass: 1.2, top: 54, accel: 16, brake: 46, grip: 8.0, turn: 1.05, halfL: 2.4,  halfW: 1.0,  height: 1.5, seats: 4 },
  buggy:  { kind: 'buggy',  name: '버기',     model: 'buggy',  hp: 180, mass: 0.7, top: 46, accel: 17, brake: 36, grip: 6.5, turn: 1.15, halfL: 1.9,  halfW: 1.0,  height: 1.4, seats: 2 },
  gt:     { kind: 'gt',     name: 'GT 쿠페',  model: 'gt',     hp: 240, mass: 1.0, top: 70, accel: 21, brake: 52, grip: 9.0, turn: 1.12, halfL: 2.3,  halfW: 1.0,  height: 1.2, seats: 2 },
  muscle: { kind: 'muscle', name: '머슬카',   model: 'long',   hp: 300, mass: 1.3, top: 66, accel: 20, brake: 46, grip: 7.8, turn: 1.0,  halfL: 2.5,  halfW: 1.05, height: 1.3, seats: 2 },
  hyper:  { kind: 'hyper',  name: '하이퍼카', model: 'wide',   hp: 200, mass: 0.9, top: 84, accel: 26, brake: 58, grip: 10,  turn: 1.15, halfL: 2.3,  halfW: 1.1,  height: 1.1, seats: 2 },
  ambulance: { kind: 'ambulance', name: '구급차', model: 'van', hp: 380, mass: 1.9, top: 40, accel: 11, brake: 36, grip: 6.8, turn: 0.85, halfL: 2.8, halfW: 1.1, height: 2.1, seats: 3 },
  tank:   { kind: 'tank',   name: '전차',     model: 'tank',   hp: 2200, mass: 9.0, top: 16, accel: 5,  brake: 20, grip: 12,  turn: 0.5,  halfL: 3.4,  halfW: 1.6,  height: 2.4, seats: 1 },
};
export const CIVILIAN_CARS: VehicleKind[] = ['sedan', 'sedan', 'hatch', 'hatch', 'suv', 'taxi', 'van', 'truck', 'sports'];

// ---------- 보행자 ----------
export type PedKind = 'player' | 'civ' | 'cop' | 'swat' | 'soldier' | 'gang' | 'boss';
/** 세력: 서로 적대 관계 판정에 씁니다 */
export type Team = 'player' | 'civ' | 'cop' | 'gang';
export interface PedInput {
  /** 로컬 이동: mz 앞(+), mx 오른쪽(+). -1~1 */ mx: number; mz: number; yaw: number; pitch: number;
  sprint: boolean; fire: boolean; aim: boolean; jump: boolean; reload: boolean; /** 이번 프레임에 눌림(엣지) */ enter: boolean; /** 무기 슬롯 변경 요청(WEAPON_ORDER 인덱스), 없으면 -1 */ slot: number; crouch: boolean;
}
export const blankPedInput = (): PedInput => ({ mx: 0, mz: 0, yaw: 0, pitch: 0, sprint: false, fire: false, aim: false, jump: false, reload: false, enter: false, slot: -1, crouch: false });
export type PedMode = 'idle' | 'wander' | 'flee' | 'cower' | 'attack' | 'chase' | 'guard' | 'follow' | 'scripted';
export interface Ped {
  id: number; kind: PedKind; team: Team; variant: number; name: string;
  x: number; y: number; z: number; vx: number; vz: number; vy: number; grounded: boolean;
  yaw: number; pitch: number; hp: number; maxHp: number; armor: number; alive: boolean; diedAt: number;
  guns: (Gun | null)[]; /** guns 인덱스 = WEAPON_ORDER 인덱스 */ cur: number; reload: number; cd: number; fireHeld: boolean; aiming: boolean;
  /** 타고 있는 차량 id(0 이면 걷는 중)와 좌석(0 운전석) */ vehicle: number; seat: number;
  input: PedInput; mode: PedMode;
  /** AI 작업 메모(모듈이 자유롭게 씀) */ tx: number; tz: number; timer: number; target: number; fear: number; aux: number; aux2: number;
  /** 연출용 */ walk: number; speed: number; muzzle: number; kick: number; hurt: number; hurtYaw: number; lastHitBy: number; crouch: boolean; punchT: number;
  /** 미션이 소유한 개체(스트리밍으로 지워지지 않음) */ keep: boolean; /** 이 개체에 붙는 임의 태그(미션용) */ tag: string;
  /** 돈을 얼마 떨어뜨릴지 */ loot: number;
}

export interface CarInput { throttle: number; brake: number; steer: number; handbrake: boolean; horn: boolean }
export const blankCarInput = (): CarInput => ({ throttle: 0, brake: 0, steer: 0, handbrake: false, horn: false });
export type VehicleMode = 'parked' | 'traffic' | 'police' | 'flee' | 'scripted' | 'none';
export interface Vehicle {
  id: number; kind: VehicleKind; color: number;
  x: number; y: number; z: number; h: number;
  /** 월드 속도 */ vx: number; vz: number; /** 앞 방향 속도(후진은 음수)와 옆 미끄러짐 속도 */ vf: number; vl: number; yawRate: number;
  steer: number; hp: number; maxHp: number; alive: boolean; /** 불이 붙어 폭발까지 남은 시간(0 이면 안 탐) */ burn: number; wrecked: boolean;
  driver: number; passengers: number[]; input: CarInput; mode: VehicleMode;
  /** 교통 AI 작업 메모 */ lane: number; nextLane: number; path: number[]; timer: number; stuck: number; target: number; aux: number;
  siren: boolean; hornT: number; /** 최근 충돌 세기(소리·연출) */ crashT: number; /** 시각 효과용 */ pitch: number; roll: number; wheel: number;
  /** 플레이어가 훔쳤는지 */ stolen: boolean; keep: boolean; tag: string; /** 잠김(도난 불가) */ locked: boolean;
  /** 스파이크 스트립에 타이어가 터졌는지(도색·정비소에서 복구) */ flat?: boolean;
}

// ---------- 줍기·탄 ----------
export type PickupKind = 'cash' | 'health' | 'armor' | 'weapon' | 'package' | 'ammo';
export interface Pickup { id: number; kind: PickupKind; x: number; y: number; z: number; amount: number; weapon: WeaponId | null; taken: boolean; /** 다시 생기기까지(0 이면 영구 소멸) */ respawn: number; /** 일회성 수집품 번호(-1 이면 아님) */ collect: number }
export interface Projectile { id: number; kind: 'rocket' | 'grenade'; x: number; y: number; z: number; vx: number; vy: number; vz: number; owner: number; life: number }

// ---------- 이벤트(화면·소리·HUD 가 읽음) ----------
export type SimEvent =
  | { t: 'shot'; id: number; weapon: WeaponId; ox: number; oy: number; oz: number; ex: number; ey: number; ez: number }
  | { t: 'hit'; victim: number; attacker: number; dmg: number; head: boolean; x: number; y: number; z: number; kind: 'ped' | 'vehicle' | 'wall' | 'ground' }
  | { t: 'explosion'; x: number; y: number; z: number; r: number }
  | { t: 'crash'; id: number; power: number; x: number; z: number }
  | { t: 'death'; id: number; by: number; weapon: WeaponId | 'vehicle' | 'explosion' | 'fall' | 'fire' }
  | { t: 'wreck'; id: number }
  | { t: 'enter'; ped: number; vehicle: number } | { t: 'exit'; ped: number; vehicle: number }
  | { t: 'honk'; id: number } | { t: 'scream'; id: number }
  | { t: 'pickup'; ped: number; kind: PickupKind; amount: number }
  | { t: 'wanted'; stars: number; prev: number }
  | { t: 'cash'; amount: number; total: number }
  | { t: 'msg'; text: string; sec: number }
  | { t: 'mission'; id: string; what: 'start' | 'pass' | 'fail' | 'stage'; text: string }
  /** 스타일 보너스 팝업(아슬아슬한 통과·체공·드리프트·연속 헤드샷 등). combo 는 현재 배율 */
  | { t: 'style'; text: string; amount: number; combo: number }
  /** 사이드 활동 진행 알림(택시 손님·현금수송차·스턴트 점프 등) */
  | { t: 'activity'; kind: string; what: 'start' | 'stage' | 'pass' | 'fail'; text: string }
  | { t: 'busted' } | { t: 'wasted' } | { t: 'respawn' } | { t: 'save' };

// ---------- 범죄·수배 ----------
export type CrimeKind = 'assault' | 'murder' | 'copAssault' | 'copMurder' | 'carTheft' | 'shooting' | 'explosion' | 'roadkill' | 'bank';
export interface Crime { kind: CrimeKind; x: number; z: number; by: number; victim: number; /** 얼마나 심각한가(수배 점수에 더해짐) */ weight: number; t: number }
export interface Wanted {
  /** 체포 진행도(0~1). 접촉이 끊기거나 공격하면 즉시 0 */ bustT?: number;
  /** 누적 수배 점수(시간에 따라 감소) */ heat: number; stars: number;
  /** 경찰에게 마지막으로 목격된 뒤 흐른 시간 */ unseenT: number; lastX: number; lastZ: number; /** 별을 잃기까지 남은 은신 시간 */ evadeT: number;
  /** 이번 수배에서 빌린 경찰 수(스폰 예산) */ cops: number;
}

// ---------- 도시 지도 ----------
export type District = 'downtown' | 'commercial' | 'residential' | 'industrial' | 'park';
export type BuildingKind = 'tower' | 'office' | 'shop' | 'house' | 'apartment' | 'warehouse' | 'garage' | 'factory';
export interface Building {
  id: number; x: number; z: number; /** x 방향 폭, z 방향 깊이 */ w: number; d: number; h: number; kind: BuildingKind; district: District;
  /** 외벽 질감 번호 0~5 */ tex: number; color: number; roof: 'flat' | 'gable' | 'tank'; neon: boolean;
  /** 이 건물이 막는지(false 면 장식 지붕 등) */ solid: boolean;
}
export type PropKind = 'lamp' | 'tree_round' | 'tree_pine' | 'bench' | 'bin' | 'hydrant' | 'mailbox' | 'bus_stop' | 'kiosk' | 'vending' | 'phone_booth' | 'street_sign' | 'bollards' | 'billboard' | 'cone' | 'barrier' | 'dumpster' | 'planter' | 'parasol' | 'food_cart' | 'bike_rack' | 'newsstand';
export interface Prop { kind: PropKind; x: number; z: number; ry: number; /** 충돌 반경(0 이면 통과) */ r: number; scale: number }
/** 차선 그래프의 한 노드. next 로 따라가면 같은 방향 차선이 이어집니다. */
export interface LaneNode {
  id: number; x: number; z: number; /** 이 노드에서 next 로 향하는 진행 방향(rad) */ h: number; next: number[];
  /** 제한 속도 m/s */ limit: number;
  /** 교차로 정지선이면 신호 그룹(0 또는 1), 아니면 -1 */ light: number; /** 도로 번호(같은 도로 구간끼리 같음) */ road: number;
}
export interface RoadSeg { id: number; ax: number; az: number; bx: number; bz: number; width: number; major: boolean }
export type PoiKind = 'dealer' | 'arena' | 'safehouse' | 'gunshop' | 'paynspray' | 'hospital' | 'police' | 'bank' | 'casino' | 'garage' | 'chopshop' | 'club' | 'dock' | 'park' | 'start';
export interface Poi { id: string; kind: PoiKind; name: string; x: number; z: number; /** 상호작용 반경 */ r: number; /** 건물 id(없으면 -1) */ building: number }
export interface Ramp { x: number; z: number; h: number; w: number; len: number }
export interface CityMap {
  seed: number; /** 지도 반쪽 크기(m): 지도는 [-half, half]² */ half: number;
  pitch: number; roadW: number; sidewalkW: number; blockSize: number; /** 도로 중심선의 좌표(x 와 z 에 같은 값) */ gx: number[];
  buildings: Building[]; props: Prop[]; roads: RoadSeg[]; lanes: LaneNode[]; pois: Poi[]; ramps: Ramp[];
  parks: Array<{ x: number; z: number; w: number; d: number }>;
  /** 보행자가 걸을 수 있는 인도 위 점들(스폰·배회용) */ walkPoints: Array<{ x: number; z: number }>;
  /** 충돌 판정용 내부 자료구조(world.ts 가 채움) */ grid: unknown;
}

// ---------- 미션 ----------
export interface Marker { x: number; z: number; r: number; color: number; label: string; /** 지도에 표시 */ blip: boolean; kind: 'goal' | 'target' | 'item' | 'shop' }
export interface MissionState {
  /** 진행 중인 미션 id(없으면 '') */ active: string; stage: number; timer: number; text: string; markers: Marker[];
  completed: string[]; /** 미션이 자유롭게 쓰는 메모 */ data: Record<string, number>; ids: Record<string, number>;
  failed: string; /** 마지막 알림이 사라질 때까지 */ banner: string; bannerT: number;
}

export const blankMissionState = (): MissionState => ({ active: '', stage: 0, timer: 0, text: '', markers: [], completed: [], data: {}, ids: {}, failed: '', banner: '', bannerT: 0 });

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
export const wrapAngle = (a: number): number => Number.isFinite(a) ? Math.atan2(Math.sin(a), Math.cos(a)) : 0;
export const angleDiff = (from: number, to: number): number => wrapAngle(to - from);
/** 작은 시드 난수(mulberry32). */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- 사이드 활동·스타일 ----------
export interface StyleState { /** 연속 콤보 수 */ combo: number; /** 현금 배율(1~5) */ mult: number; /** 콤보가 끊기기까지 남은 시간 */ timer: number; /** 누적 스타일 보너스(현금) */ total: number; /** 마지막 팝업 문구 */ last: string }
export interface ActivityState {
  style: StyleState;
  /** 성공한 스턴트 점프 번호(0~11) */ stunts: number[];
  /** 지금 진행 중인 사이드 활동 종류('' 이면 없음): 'taxi' | 'armored' | 'bounty' | 'rampage' | 'vigilante' | ... */ active: string;
  /** 활동이 자유롭게 쓰는 메모 */ data: Record<string, number>; ids: Record<string, number>; text: string; markers: Marker[]; timer: number;
  /** 통계 */ stats: { taxiFares: number; armoredTrucks: number; bounties: number; rampages: number; races: number; nearMisses: number; maxAirtime: number; maxDrift: number };
}
export const blankActivityState = (): ActivityState => ({ style: { combo: 0, mult: 1, timer: 0, total: 0, last: '' }, stunts: [], active: '', data: {}, ids: {}, text: '', markers: [], timer: 0, stats: { taxiFares: 0, armoredTrucks: 0, bounties: 0, rampages: 0, races: 0, nearMisses: 0, maxAirtime: 0, maxDrift: 0 } });

// ---------- 일거리(배달·응급 이송·자경단·현상 의뢰·차량 회수·격투장) ----------
export interface JobState {
  /** 진행 중인 일 id(없으면 '') */ active: string; title: string; stage: number; timer: number; text: string; markers: Marker[];
  data: Record<string, number>; ids: Record<string, number>;
}
export const blankJobState = (): JobState => ({ active: '', title: '', stage: 0, timer: 0, text: '', markers: [], data: {}, ids: {} });

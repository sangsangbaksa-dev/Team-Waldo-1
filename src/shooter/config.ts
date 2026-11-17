// ZERO ZONE — 배틀로열 총게임의 규칙 상수: 무기, AI 난이도, 줄어드는 자기장 일정. 단위는 미터와 초입니다.

export type WeaponId = 'pistol' | 'smg' | 'rifle' | 'shotgun' | 'sniper';
export interface WeaponDef {
  id: WeaponId; name: string;
  /** 한 발(펠릿)의 피해 */ dmg: number; pellets: number;
  /** 발사 간격(초) */ cd: number; mag: number; reload: number; auto: boolean;
  /** 기본 탄퍼짐(라디안, 가만히 서서 쏠 때) */ spread: number;
  /** 이 거리 너머부터는 피해가 줄고, 최대 사거리에서 40% 가 됩니다 */ falloff: number; range: number;
  /** 머리 배율 */ head: number; recoil: number;
  /** 줍는 쪽 점수: 봇이 무기를 고를 때 씁니다 */ rank: number;
}
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol:  { id: 'pistol',  name: '권총',   dmg: 22, pellets: 1, cd: 0.16, mag: 12, reload: 1.2, auto: false, spread: 0.012, falloff: 25,  range: 120, head: 1.8, recoil: 0.022, rank: 1 },
  smg:     { id: 'smg',     name: '기관단총', dmg: 14, pellets: 1, cd: 0.075, mag: 30, reload: 1.6, auto: true,  spread: 0.032, falloff: 22,  range: 100, head: 1.6, recoil: 0.014, rank: 2 },
  shotgun: { id: 'shotgun', name: '샷건',   dmg: 11, pellets: 9, cd: 0.8,  mag: 6,  reload: 2.3, auto: false, spread: 0.075, falloff: 12,  range: 45,  head: 1.4, recoil: 0.09,  rank: 3 },
  rifle:   { id: 'rifle',   name: '돌격소총', dmg: 26, pellets: 1, cd: 0.105, mag: 30, reload: 2.0, auto: true,  spread: 0.016, falloff: 60,  range: 220, head: 1.7, recoil: 0.02,  rank: 4 },
  sniper:  { id: 'sniper',  name: '저격총', dmg: 80, pellets: 1, cd: 1.05, mag: 5,  reload: 2.3, auto: false, spread: 0.0015, falloff: 400, range: 500, head: 1.9, recoil: 0.1,   rank: 5 },
};
/** 사격 손맛: 한 발마다 시점이 실제로 튀는 정도(라디안 = 반동 × kickPitch), 손을 떼면 되돌아오는 비율과 속도 */
export const FEEL = { kickPitch: 0.5, kickYaw: 0.32, adsKick: 0.7, recover: 7, recoverShare: 0.65, sprintFov: 1.07, strafeRoll: 0.012 };
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

/** 총기 파츠: 슬롯마다 하나씩 달 수 있고, 무기마다 달 수 있는 슬롯이 정해져 있습니다. */
export type PartSlot = 'sight' | 'muzzle' | 'grip' | 'mag';
export type PartId = 'reddot' | 'scope2' | 'scope4' | 'suppressor' | 'comp' | 'grip' | 'extmag';
export interface PartDef { id: PartId; name: string; slot: PartSlot; /** 조준 시 배율(조준경만) */ zoom: number }
export const PARTS: Record<PartId, PartDef> = {
  reddot:     { id: 'reddot',     name: '레드닷 사이트', slot: 'sight',  zoom: 1.0 },
  scope2:     { id: 'scope2',     name: '2배율 조준경', slot: 'sight',  zoom: 2.0 },
  scope4:     { id: 'scope4',     name: '4배율 조준경', slot: 'sight',  zoom: 4.0 },
  suppressor: { id: 'suppressor', name: '소음기',       slot: 'muzzle', zoom: 1 },
  comp:       { id: 'comp',       name: '보정기',       slot: 'muzzle', zoom: 1 },
  grip:       { id: 'grip',       name: '수직 손잡이',  slot: 'grip',   zoom: 1 },
  extmag:     { id: 'extmag',     name: '확장 탄창',    slot: 'mag',    zoom: 1 },
};
export const PART_IDS = Object.keys(PARTS) as PartId[];
export const PART_FITS: Record<WeaponId, PartSlot[]> = {
  pistol: ['muzzle', 'mag'], smg: ['sight', 'muzzle', 'grip', 'mag'], rifle: ['sight', 'muzzle', 'grip', 'mag'], shotgun: ['sight', 'muzzle', 'mag'], sniper: ['sight', 'muzzle', 'mag'],
};
export type Attachments = Partial<Record<PartSlot, PartId>>;
const PART_TIER: Partial<Record<PartId, number>> = { reddot: 1, scope2: 2, scope4: 3 };
/** 이 파츠를 달면 어떻게 되는지: 빈 칸이면 new, 더 좋은 조준경이면 upgrade(자동), 같은 슬롯의 다른 파츠면 swap(E 로 교체), 이미 같은 파츠면 same */
export function partFit(att: Attachments, part: PartId): 'new' | 'upgrade' | 'swap' | 'same' {
  const slot = PARTS[part].slot, old = att[slot]; if (!old) return 'new'; if (old === part) return 'same';
  return (PART_TIER[part] ?? 0) > (PART_TIER[old] ?? 0) ? 'upgrade' : 'swap';
}
/** 확장 탄창이 늘려 주는 비율 */
export const EXT_MAG = 1.4;
export function magOf(id: WeaponId, att: Attachments | undefined): number { return Math.round(WEAPONS[id].mag * (att?.mag === 'extmag' ? EXT_MAG : 1)); }
/** 파츠가 바꾸는 사격 특성: 탄퍼짐·반동 배율 */
export function partHandling(att: Attachments | undefined): { spread: number; kick: number } {
  let spread = 1, kick = 1;
  if (att?.grip === 'grip') { spread *= 0.86; kick *= 0.78; }
  if (att?.muzzle === 'comp') { spread *= 0.94; kick *= 0.62; }
  if (att?.muzzle === 'suppressor') { kick *= 0.9; }
  return { spread, kick };
}
/** 헬멧 등급(1~3)이 머리 피해를 줄이는 비율 */
export const HELMET_CUT = [0, 0.3, 0.5, 0.65];
export const HELMET_NAMES = ['', '1레벨 헬멧', '2레벨 헬멧', '3레벨 헬멧'];
/** 에너지 드링크: 부스트 시간(초) 동안 체력이 서서히 차오르고 이동이 조금 빨라집니다 */
export const BOOST = { time: 22, heal: 2.6, speed: 1.08, cap: 100 };

export const PLAYER = { radius: 0.4, eye: 1.65, height: 1.8, head: 1.45, walk: 4.6, sprint: 7.2, hp: 100, medkit: 55, armor: 50, pickup: 1.6 };
export const MAP_HALF = { br: 290, duel: 115 } as const;
/** 솔로 배틀로열은 100명(나 + AI 99명)이 같은 비행기에서 뛰어내립니다. */
export const BR_PLAYERS = 100;
/** 낙하: 비행기 고도·속도, 자유낙하와 낙하산의 하강·수평 속도(m/s). 낙하산은 open 미터 아래에서 자동으로 펴집니다. */
export const AIR = { alt: 320, plane: 34, fall: 48, dive: 62, fallH: 8, fallFast: 24, diveH: 17, open: 105, manualOpen: 260, chute: 7, chuteFast: 10.5, chuteH: 6, chuteGo: 12, chuteRun: 17, delay: 52 };
export type Mode = 'br' | 'duel';

export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert';
export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard', 'expert'];
export interface BotTuning {
  label: string; blurb: string;
  /** 적을 발견하고 쏘기 시작하기까지 걸리는 시간(초) */ react: number;
  /** 조준 오차(라디안, 거리에 따라 커집니다) */ aimErr: number;
  /** 시야 거리와 시야각(라디안, 한쪽) */ sight: number; fov: number;
  /** 최대 회전 속도(rad/s) */ turn: number;
  /** 이동 속도 배율 */ speed: number;
  /** 교전 중 좌우로 움직이는 정도 0~1 */ strafe: number;
  /** 연사 하나를 쏜 뒤 쉬는 시간(초)과 한 번에 쏘는 시간 */ burst: number; pause: number;
  /** 머리를 노리는 확률 */ headAim: number;
  /** 자기장 가장자리에서 얼마나 미리 안으로 움직이는지(미터) */ zoneMargin: number;
  /** 주변 전리품을 찾는 반경 */ lootRadius: number;
}
export const BOTS: Record<Difficulty, BotTuning> = {
  easy:   { label: '쉬움',    blurb: '반응이 느리고 자주 빗맞힙니다.',            react: 0.95, aimErr: 0.085, sight: 45,  fov: 0.95, turn: 2.6, speed: 0.82, strafe: 0.0,  burst: 0.5,  pause: 0.9,  headAim: 0.02, zoneMargin: 2,  lootRadius: 45 },
  normal: { label: '보통',    blurb: '평범한 실력. 가끔 옆으로 움직입니다.',       react: 0.55, aimErr: 0.05,  sight: 62,  fov: 1.05, turn: 3.8, speed: 0.92, strafe: 0.4,  burst: 0.8,  pause: 0.5,  headAim: 0.1,  zoneMargin: 8,  lootRadius: 60 },
  hard:   { label: '어려움',  blurb: '빠르게 조준하고 좌우로 움직이며 쏩니다.',   react: 0.3,  aimErr: 0.026, sight: 85,  fov: 1.15, turn: 5.6, speed: 1.0,  strafe: 0.8,  burst: 1.2,  pause: 0.25, headAim: 0.3,  zoneMargin: 16, lootRadius: 80 },
  expert: { label: '매우 어려움', blurb: '거의 놓치지 않습니다. 자기장도 미리 읽습니다.', react: 0.16, aimErr: 0.012, sight: 110, fov: 1.25, turn: 8.5, speed: 1.04, strafe: 1.0,  burst: 1.8,  pause: 0.12, headAim: 0.55, zoneMargin: 26, lootRadius: 100 },
};

export interface ZonePhase { wait: number; shrink: number; radius: number; dps: number }
/** 줄어드는 자기장 일정. 마지막 단계가 끝나면 작은 원에 머무르며 피해가 계속 늘어납니다. */
export const ZONES: Record<Mode, ZonePhase[]> = {
  br: [
    { wait: 28, shrink: 38, radius: 225, dps: 1.2 }, { wait: 24, shrink: 32, radius: 140, dps: 2.2 }, { wait: 20, shrink: 28, radius: 70, dps: 3.5 },
    { wait: 16, shrink: 24, radius: 36, dps: 6 }, { wait: 12, shrink: 20, radius: 14, dps: 10 }, { wait: 8, shrink: 16, radius: 5, dps: 16 },
  ],
  duel: [
    { wait: 20, shrink: 28, radius: 85, dps: 1.5 }, { wait: 16, shrink: 24, radius: 52, dps: 3 }, { wait: 12, shrink: 20, radius: 28, dps: 6 }, { wait: 8, shrink: 16, radius: 10, dps: 12 },
  ],
};

export const BOT_NAMES = ['Shadow', 'Viper', 'Rook', 'Ember', 'Nova', 'Drift', 'Kestrel', 'Onyx', 'Havoc', 'Lynx', 'Cobalt', 'Raven', 'Slate', 'Pike', 'Zephyr', 'Mako', 'Tundra', 'Flint', 'Saber'];
export const TEAM_COLORS = [0xc0392b, 0x2e86de, 0x27ae60, 0xe1a21a, 0x8e44ad, 0x16a0a0, 0xd35400, 0x7f8c8d, 0xc2185b, 0x4a6572];
export const SKIN_TONES = [0xf1c9a5, 0xd9a47a, 0xa8744f, 0x7a5236, 0xf5d6b8];

/** 작은 시드 난수(mulberry32). 같은 시드면 두 브라우저가 같은 지도를 만듭니다. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

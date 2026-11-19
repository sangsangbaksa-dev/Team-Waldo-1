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

/** 총기 파츠: 슬롯마다 하나씩 달 수 있고, 무기마다 달 수 있는 슬롯과 파츠가 정해져 있습니다. */
export type PartSlot = 'sight' | 'muzzle' | 'grip' | 'mag' | 'stock';
export type PartId = 'reddot' | 'holo' | 'scope2' | 'scope4' | 'scope8' | 'suppressor' | 'comp' | 'flash' | 'grip' | 'angled' | 'extmag' | 'quickmag' | 'extquick' | 'tactical' | 'cheek';
/** 파츠가 바꾸는 값(곱셈 배율). spread 탄퍼짐, kick 반동, reload 장전 시간, mag 탄창 크기, ads 조준 중 탄퍼짐 */
export interface PartMod { spread?: number; kick?: number; reload?: number; mag?: number; ads?: number }
export interface PartDef {
  id: PartId; name: string; slot: PartSlot; /** 조준 시 배율(조준경만) */ zoom: number;
  /** 조립 화면의 점수(무기마다 LOADOUT_BUDGET 안에서 고릅니다) */ cost: number; mod: PartMod; blurb: string;
  /** 이 무기에만 달 수 있습니다(없으면 슬롯이 있는 모든 무기) */ only?: WeaponId[];
}
export const PARTS: Record<PartId, PartDef> = {
  reddot:     { id: 'reddot',     name: '레드닷 사이트',   slot: 'sight',  zoom: 1.0,  cost: 1, mod: { ads: 0.85 }, blurb: '가볍고 빠른 근거리 조준' },
  holo:       { id: 'holo',       name: '홀로그램 사이트', slot: 'sight',  zoom: 1.25, cost: 1, mod: { ads: 0.82 }, blurb: '넓은 시야로 빠르게 겨눕니다' },
  scope2:     { id: 'scope2',     name: '2배율 조준경',    slot: 'sight',  zoom: 2.0,  cost: 2, mod: { ads: 0.8 }, blurb: '중거리 교전에 알맞습니다' },
  scope4:     { id: 'scope4',     name: '4배율 조준경',    slot: 'sight',  zoom: 4.0,  cost: 3, mod: { ads: 0.75 }, blurb: '멀리 있는 적도 또렷하게' },
  scope8:     { id: 'scope8',     name: '8배율 조준경',    slot: 'sight',  zoom: 8.0,  cost: 4, mod: { ads: 0.7 }, blurb: '초장거리 저격용', only: ['rifle', 'sniper'] },
  suppressor: { id: 'suppressor', name: '소음기',          slot: 'muzzle', zoom: 1,    cost: 2, mod: { kick: 0.9 }, blurb: '총소리와 발사 불빛을 숨깁니다 · 반동 소폭 감소' },
  comp:       { id: 'comp',       name: '보정기',          slot: 'muzzle', zoom: 1,    cost: 2, mod: { spread: 0.94, kick: 0.62 }, blurb: '반동을 크게 잡아 줍니다' },
  flash:      { id: 'flash',      name: '소염기',          slot: 'muzzle', zoom: 1,    cost: 1, mod: { spread: 0.97, kick: 0.85 }, blurb: '발사 불빛을 줄이고 반동을 조금 낮춥니다' },
  grip:       { id: 'grip',       name: '수직 손잡이',     slot: 'grip',   zoom: 1,    cost: 2, mod: { spread: 0.86, kick: 0.78 }, blurb: '연사할 때 총구 흔들림을 잡습니다' },
  angled:     { id: 'angled',     name: '앵글 손잡이',     slot: 'grip',   zoom: 1,    cost: 1, mod: { spread: 0.93, kick: 0.92, ads: 0.9 }, blurb: '조준 자세가 안정됩니다' },
  extmag:     { id: 'extmag',     name: '확장 탄창',       slot: 'mag',    zoom: 1,    cost: 2, mod: { mag: 1.4 }, blurb: '탄창 용량 +40%' },
  quickmag:   { id: 'quickmag',   name: '퀵드로우 탄창',   slot: 'mag',    zoom: 1,    cost: 2, mod: { reload: 0.7 }, blurb: '장전 시간 -30%' },
  extquick:   { id: 'extquick',   name: '확장 퀵드로우 탄창', slot: 'mag', zoom: 1,    cost: 3, mod: { mag: 1.25, reload: 0.82 }, blurb: '탄창 +25% · 장전 -18%' },
  tactical:   { id: 'tactical',   name: '전술 개머리판',   slot: 'stock',  zoom: 1,    cost: 2, mod: { spread: 0.92, kick: 0.9 }, blurb: '어깨에 단단히 붙어 반동을 줄입니다', only: ['smg', 'rifle'] },
  cheek:      { id: 'cheek',      name: '볼받침',          slot: 'stock',  zoom: 1,    cost: 2, mod: { spread: 0.9, ads: 0.92 }, blurb: '조준 때 총이 흔들리지 않습니다', only: ['sniper'] },
};
export const PART_IDS = Object.keys(PARTS) as PartId[];
export const PART_FITS: Record<WeaponId, PartSlot[]> = {
  pistol: ['muzzle', 'mag'], smg: ['sight', 'muzzle', 'grip', 'mag', 'stock'], rifle: ['sight', 'muzzle', 'grip', 'mag', 'stock'], shotgun: ['sight', 'muzzle', 'mag'], sniper: ['sight', 'muzzle', 'mag', 'stock'],
};
export const PART_SLOTS: PartSlot[] = ['sight', 'muzzle', 'grip', 'mag', 'stock'];
export const SLOT_NAMES: Record<PartSlot, string> = { sight: '조준경', muzzle: '총구', grip: '손잡이', mag: '탄창', stock: '개머리판' };
/** 이 무기에 이 파츠를 달 수 있는가(슬롯과 전용 무기 둘 다 맞아야 함). 샷건의 탄창 칸은 확장 튜브(확장 탄창)만 받습니다. */
export function canFit(weapon: WeaponId, part: PartId): boolean {
  const d = PARTS[part]; if (!PART_FITS[weapon].includes(d.slot)) return false; if (d.only && !d.only.includes(weapon)) return false;
  if (weapon === 'shotgun' && d.slot === 'mag') return part === 'extmag';
  return true;
}
/** 한 슬롯에 고를 수 있는 파츠 목록 */
export function partsFor(weapon: WeaponId, slot: PartSlot): PartDef[] { return PART_IDS.filter(p => PARTS[p].slot === slot && canFit(weapon, p)).map(p => PARTS[p]); }
export type Attachments = Partial<Record<PartSlot, PartId>>;
const PART_TIER: Partial<Record<PartId, number>> = { reddot: 1, holo: 1.5, scope2: 2, scope4: 3, scope8: 4 };
/** 이 파츠를 달면 어떻게 되는지: 빈 칸이면 new, 더 좋은 조준경이면 upgrade(자동), 같은 슬롯의 다른 파츠면 swap(E 로 교체), 이미 같은 파츠면 same */
export function partFit(att: Attachments, part: PartId): 'new' | 'upgrade' | 'swap' | 'same' {
  const slot = PARTS[part].slot, old = att[slot]; if (!old) return 'new'; if (old === part) return 'same';
  return (PART_TIER[part] ?? 0) > (PART_TIER[old] ?? 0) ? 'upgrade' : 'swap';
}
/** 확장 탄창이 늘려 주는 비율 */
export const EXT_MAG = 1.4;
export function magOf(id: WeaponId, att: Attachments | undefined): number { return Math.round(WEAPONS[id].mag * partHandling(att).mag); }
/** 파츠가 바꾸는 사격 특성: 탄퍼짐·반동·장전·탄창 배율 */
export function partHandling(att: Attachments | undefined): { spread: number; kick: number; reload: number; mag: number } {
  const h = { spread: 1, kick: 1, reload: 1, mag: 1 };
  if (att) for (const p of Object.values(att)) { const m = PARTS[p]?.mod; if (!m) continue; h.spread *= m.spread ?? 1; h.kick *= m.kick ?? 1; h.reload *= m.reload ?? 1; h.mag *= m.mag ?? 1; }
  return h;
}
/** 조준(ADS) 중 탄퍼짐 배율: 맨 총은 0.4, 조준경·손잡이·개머리판이 더 줄입니다 */
export function adsSpread(att: Attachments | undefined): number {
  let v = 0.4; if (att) for (const p of Object.values(att)) v *= PARTS[p]?.mod.ads ?? 1; return v;
}
/** 조립 화면에 보여 주는 능력치. 값이 클수록 좋은 쪽으로 맞추지 않고 실제 수치를 그대로 돌려줍니다. */
export interface GunStats { dmg: number; rpm: number; range: number; mag: number; reload: number; kick: number; spread: number; ads: number; zoom: number }
export function gunStats(id: WeaponId, att: Attachments | undefined): GunStats {
  const d = WEAPONS[id], h = partHandling(att), zoom = att?.sight ? PARTS[att.sight].zoom : 1;
  return { dmg: d.dmg * d.pellets, rpm: 60 / d.cd, range: d.range, mag: magOf(id, att), reload: d.reload * h.reload, kick: d.recoil * h.kick, spread: d.spread * h.spread, ads: d.spread * h.spread * adsSpread(att), zoom };
}
/** 조립 화면의 파츠 점수(무기 한 자루당 쓸 수 있는 점수) */
export const LOADOUT_BUDGET = 8;
export const attCost = (att: Attachments | undefined): number => (att ? Object.values(att).reduce((s, p) => s + (PARTS[p]?.cost ?? 0), 0) : 0);
export type Loadout = Partial<Record<WeaponId, Attachments>>;
/** 저장된 값을 믿지 않고 걸러 냅니다: 없는 파츠·안 맞는 파츠·예산을 넘는 파츠는 버립니다. */
export function cleanLoadout(raw: unknown): Loadout {
  const out: Loadout = {}; if (typeof raw !== 'object' || raw === null) return out;
  for (const id of WEAPON_IDS) {
    const r = (raw as Record<string, unknown>)[id]; if (typeof r !== 'object' || r === null) continue;
    const att: Attachments = {}; let cost = 0;
    for (const slot of PART_SLOTS) { const p = (r as Record<string, unknown>)[slot]; if (typeof p !== 'string' || !(p in PARTS)) continue; const part = p as PartId; if (PARTS[part].slot !== slot || !canFit(id, part) || cost + PARTS[part].cost > LOADOUT_BUDGET) continue; att[slot] = part; cost += PARTS[part].cost; }
    if (Object.keys(att).length) out[id] = att;
  }
  return out;
}
/** 헬멧 등급(1~3)이 머리 피해를 줄이는 비율 */
export const HELMET_CUT = [0, 0.3, 0.5, 0.65];
export const HELMET_NAMES = ['', '1레벨 헬멧', '2레벨 헬멧', '3레벨 헬멧'];
/** 에너지 드링크: 부스트 시간(초) 동안 체력이 서서히 차오르고 이동이 조금 빨라집니다 */
/** 치료 도구: 붕대(짧게, 80%까지)·구급상자(오래, 100%까지). 시전 중에는 느리게 걷고, 사격·피격 시 중단됩니다. */
export const HEAL = { bandage: { time: 3.2, amount: 25, cap: 80, max: 6, pick: 2, name: '붕대' }, kit: { time: 6, amount: 100, cap: 100, max: 2, pick: 1, name: '구급상자' }, walk: 0.7 };
/** 방탄복 등급(1~3): 내구도(점)와 피해를 막아 주는 비율 */
export const ARMOR_PTS = [0, 50, 80, 100], ARMOR_ABS = [0, 0.35, 0.5, 0.62], ARMOR_NAMES = ['', '방탄복 Lv1', '방탄복 Lv2', '방탄복 Lv3'];
export const BOOST = { time: 22, heal: 2.6, speed: 1.08, cap: 100 };

export const PLAYER = { radius: 0.4, eye: 1.65, height: 1.8, head: 1.45, walk: 4.6, sprint: 7.2, hp: 100, crouchEye: 1.05, crouchHeight: 1.2, crouchHead: 0.92, crouchSpeed: 0.55, medkit: 55, armor: 50, pickup: 1.6 };
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

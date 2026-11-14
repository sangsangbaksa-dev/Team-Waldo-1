// LAST CITY — 정적 데이터 정의 (무기·유닛·건물·사업체·특성)
export const BLOCKS = 9;
export const BLOCK = 440;
export const ROAD = 120;
export const PITCH = BLOCK + ROAD;
export const SIZE = BLOCKS * PITCH + ROAD; // 5160
export const NAV = 40;
export const NAVN = SIZE / NAV; // 129
export const POLICE = 8;
export const CIV = 9;
export const FACTION_COUNT = 8;

export type Difficulty = 'd1' | 'd2' | 'd3' | 'd4' | 'd5';
export const DIFFICULTY_ORDER: Difficulty[] = ['d1', 'd2', 'd3', 'd4', 'd5'];
export const DIFFICULTY: Record<Difficulty, { label: string; desc: string; income: number; dmg: number; cap: number; attackArmy: number }> = {
  d1: { label: '1단계 · 입문', desc: '라이벌이 아주 느리게 크고 약하게 공격합니다.', income: 0.35, dmg: 0.45, cap: 10, attackArmy: 16 },
  d2: { label: '2단계 · 쉬움', desc: '라이벌 성장이 느리고 공격이 드뭅니다.', income: 0.5, dmg: 0.6, cap: 14, attackArmy: 14 },
  d3: { label: '3단계 · 보통', desc: '경제와 전투를 함께 굴리면 충분히 이길 수 있습니다.', income: 0.65, dmg: 0.72, cap: 17, attackArmy: 13 },
  d4: { label: '4단계 · 어려움', desc: '기존 난이도. 라이벌이 꾸준히 확장하고 압박합니다.', income: 0.78, dmg: 0.85, cap: 20, attackArmy: 11 },
  d5: { label: '5단계 · 극한', desc: '라이벌이 빠르게 확장하고 일찍 쳐들어옵니다. 숙련자용.', income: 1.0, dmg: 1.05, cap: 28, attackArmy: 9 },
};

export const FACTIONS = [
  { name: '에메랄드 왕국', color: '#3ddc97', dark: '#16805a' },
  { name: '레드 바이퍼', color: '#ff5d5d', dark: '#9c2a2a' },
  { name: '블루 타이탄', color: '#4da3ff', dark: '#1f5fa8' },
  { name: '골든 카르텔', color: '#ffc93c', dark: '#a67a10' },
  { name: '퍼플 신디케이트', color: '#b77bff', dark: '#6a37ab' },
  { name: '오렌지 팬텀', color: '#ff8f45', dark: '#a8551c' },
  { name: '사이언 용병단', color: '#35d9e6', dark: '#16808a' },
  { name: '핑크 로터스', color: '#ff7dbd', dark: '#a53a72' },
];

export type WeaponId = 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'sniper' | 'rocket' | 'minigun' | 'railgun'
  | 'u_rifle' | 'u_rocket' | 'u_sniper' | 'u_heal' | 'u_mg' | 'u_cannon' | 'u_turret' | 'u_pistol' | 'u_smg' | 'v_cannon';
export interface WeaponDef {
  name: string; dmg: number; rate: number; range: number; speed: number; spread: number; pellets: number;
  mag: number; reload: number; ammo: number; splash: number; bdmg: number; tier: number; price: number; pierce?: boolean;
  snd: 'pistol' | 'smg' | 'rifle' | 'shotgun' | 'sniper' | 'rocket' | 'cannon' | 'rail';
  color: string;
}
const W = (name: string, dmg: number, rate: number, range: number, speed: number, spread: number, mag: number, reload: number, snd: WeaponDef['snd'], extra: Partial<WeaponDef> = {}): WeaponDef =>
  ({ name, dmg, rate, range, speed, spread, pellets: 1, mag, reload, ammo: -1, splash: 0, bdmg: 0.5, tier: 0, price: 0, snd, color: '#ffe9a8', ...extra });
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: W('권총', 15, 3.6, 520, 1300, 0.035, 12, 1.0, 'pistol'),
  smg: W('기관단총', 10, 11, 470, 1300, 0.085, 32, 1.3, 'smg', { tier: 1, price: 400 }),
  shotgun: W('산탄총', 10, 1.4, 330, 1150, 0.2, 6, 1.7, 'shotgun', { pellets: 8, tier: 1, price: 600 }),
  rifle: W('돌격소총', 18, 7.5, 640, 1500, 0.03, 30, 1.5, 'rifle', { tier: 2, price: 1000 }),
  sniper: W('저격총', 110, 0.85, 1050, 2600, 0.003, 5, 2.1, 'sniper', { tier: 2, price: 1500, bdmg: 0.3 }),
  rocket: W('로켓 런처', 130, 0.75, 780, 640, 0.01, 1, 1.5, 'rocket', { tier: 3, price: 2600, splash: 120, bdmg: 2.6, ammo: 14, color: '#ffb066' }),
  minigun: W('미니건', 12, 22, 600, 1450, 0.075, 200, 2.8, 'smg', { tier: 4, ammo: 700, bdmg: 0.7 }),
  railgun: W('레일건', 260, 0.55, 1150, 3600, 0, 3, 2.3, 'rail', { tier: 4, ammo: 18, pierce: true, bdmg: 1.6, color: '#8ff6ff' }),
  u_rifle: W('소총', 7, 3, 400, 1200, 0.06, 0, 0, 'rifle'),
  u_rocket: W('바주카', 42, 0.5, 470, 560, 0.03, 0, 0, 'rocket', { splash: 70, bdmg: 2.8, color: '#ffb066' }),
  u_sniper: W('저격', 48, 0.55, 720, 2400, 0.01, 0, 0, 'sniper', { bdmg: 0.25 }),
  u_heal: W('치료', 13, 1, 190, 0, 0, 0, 0, 'pistol'),
  u_mg: W('기관총', 8, 7, 420, 1300, 0.07, 0, 0, 'smg'),
  u_cannon: W('전차포', 70, 0.55, 520, 900, 0.02, 0, 0, 'cannon', { splash: 85, bdmg: 2.4, color: '#ffd28a' }),
  u_turret: W('포탑', 9, 6, 440, 1400, 0.05, 0, 0, 'smg'),
  u_pistol: W('권총', 8, 2, 380, 1200, 0.06, 0, 0, 'pistol'),
  u_smg: W('기관단총', 7, 6.5, 400, 1250, 0.08, 0, 0, 'smg'),
  v_cannon: W('주포', 150, 0.8, 800, 1000, 0.01, 0, 0, 'cannon', { splash: 110, bdmg: 3, color: '#ffd28a' }),
};

export type ActorKind = 'boss' | 'worker' | 'rifle' | 'heavy' | 'sniper' | 'medic' | 'buggy' | 'tank' | 'civ' | 'cop' | 'swat' | 'guard' | 'merc';
export type UnitId = 'worker' | 'rifle' | 'heavy' | 'medic' | 'sniper' | 'buggy' | 'tank';
export type StructKind = 'hq' | 'barracks' | 'depot' | 'factory' | 'lab' | 'turret';
export interface ActorDef { name: string; hp: number; speed: number; r: number; weapon: WeaponId; armor: number; xp: number; mech?: boolean }
export const ACTORS: Record<ActorKind, ActorDef> = {
  boss: { name: '보스', hp: 160, speed: 232, r: 13, weapon: 'pistol', armor: 0, xp: 150 },
  worker: { name: '일꾼', hp: 45, speed: 150, r: 9, weapon: 'u_pistol', armor: 0, xp: 6 },
  rifle: { name: '소총병', hp: 70, speed: 172, r: 10, weapon: 'u_rifle', armor: 0, xp: 10 },
  heavy: { name: '중화기병', hp: 110, speed: 150, r: 11, weapon: 'u_rocket', armor: 0.1, xp: 16 },
  sniper: { name: '저격수', hp: 55, speed: 160, r: 10, weapon: 'u_sniper', armor: 0, xp: 16 },
  medic: { name: '의무병', hp: 65, speed: 176, r: 10, weapon: 'u_heal', armor: 0, xp: 12 },
  buggy: { name: '기동 장갑차', hp: 240, speed: 250, r: 19, weapon: 'u_mg', armor: 0.25, xp: 28, mech: true },
  tank: { name: '전차', hp: 620, speed: 135, r: 25, weapon: 'u_cannon', armor: 0.4, xp: 55, mech: true },
  civ: { name: '시민', hp: 30, speed: 80, r: 9, weapon: 'u_pistol', armor: 0, xp: 0 },
  cop: { name: '경찰', hp: 70, speed: 215, r: 10, weapon: 'u_pistol', armor: 0, xp: 14 },
  swat: { name: '특공대', hp: 130, speed: 225, r: 11, weapon: 'u_smg', armor: 0.25, xp: 22 },
  guard: { name: '경비원', hp: 90, speed: 165, r: 10, weapon: 'u_smg', armor: 0.1, xp: 10 },
  merc: { name: '용병', hp: 110, speed: 185, r: 10, weapon: 'u_smg', armor: 0.15, xp: 14 },
};
export interface UnitDef { id: UnitId; crystal: number; cash: number; supply: number; time: number; from: StructKind; needLab?: boolean; desc: string }
export const UNITS: Record<UnitId, UnitDef> = {
  worker: { id: 'worker', crystal: 50, cash: 0, supply: 1, time: 7, from: 'hq', desc: '크리스탈을 채굴해 본부로 운반' },
  rifle: { id: 'rifle', crystal: 60, cash: 0, supply: 1, time: 8, from: 'barracks', desc: '값싼 주력 보병' },
  heavy: { id: 'heavy', crystal: 110, cash: 0, supply: 1, time: 13, from: 'barracks', desc: '건물·차량에 강한 바주카' },
  medic: { id: 'medic', crystal: 85, cash: 0, supply: 1, time: 11, from: 'barracks', desc: '주변 아군과 보스를 치료' },
  sniper: { id: 'sniper', crystal: 120, cash: 0, supply: 1, time: 14, from: 'barracks', needLab: true, desc: '초장거리 저격 (연구소 필요)' },
  buggy: { id: 'buggy', crystal: 150, cash: 250, supply: 2, time: 16, from: 'factory', desc: '빠른 기관총 장갑차' },
  tank: { id: 'tank', crystal: 300, cash: 600, supply: 2, time: 26, from: 'factory', needLab: true, desc: '광역 포격 전차 (연구소 필요)' },
};
export interface StructDef { name: string; w: number; h: number; hp: number; crystal: number; cash: number; time: number; height: number; desc: string }
export const STRUCTS: Record<StructKind, StructDef> = {
  hq: { name: '본부', w: 120, h: 120, hp: 4200, crystal: 0, cash: 0, time: 0, height: 0.2, desc: '' },
  barracks: { name: '병영', w: 88, h: 72, hp: 1100, crystal: 150, cash: 0, time: 14, height: 0.11, desc: '보병을 훈련합니다' },
  depot: { name: '보급고', w: 60, h: 60, hp: 600, crystal: 100, cash: 0, time: 9, height: 0.07, desc: '인구 한도 +8 (최대 100)' },
  factory: { name: '군수공장', w: 100, h: 84, hp: 1400, crystal: 250, cash: 300, time: 20, height: 0.13, desc: '장갑차와 전차를 생산합니다' },
  lab: { name: '연구소', w: 76, h: 76, hp: 900, crystal: 200, cash: 200, time: 16, height: 0.15, desc: '업그레이드·저격수·전차 해금' },
  turret: { name: '방어 포탑', w: 44, h: 44, hp: 620, crystal: 125, cash: 0, time: 8, height: 0.09, desc: '주변 적을 자동 사격' },
};
export const BUILD_ORDER: StructKind[] = ['barracks', 'depot', 'turret', 'lab', 'factory'];
export const SUPPLY_HQ = 12, SUPPLY_DEPOT = 8, SUPPLY_CAP = 100;

export type BizKind = 'store' | 'gas' | 'club' | 'plant' | 'casino' | 'bank' | 'gunshop';
export const BIZ: Record<BizKind, { name: string; price: number; income: number; crystal: number; color: string; sign: string }> = {
  store: { name: '편의점', price: 400, income: 3, crystal: 0, color: '#5fd38a', sign: '24' },
  gas: { name: '주유소', price: 750, income: 5.5, crystal: 0, color: '#ffb347', sign: 'GAS' },
  club: { name: '나이트클럽', price: 1300, income: 10, crystal: 0, color: '#ff6ad5', sign: 'CLUB' },
  plant: { name: '정제 공장', price: 1500, income: 6, crystal: 1.2, color: '#7fd8ff', sign: 'FAB' },
  casino: { name: '카지노', price: 2600, income: 20, crystal: 0, color: '#ffd84a', sign: '777' },
  bank: { name: '중앙은행', price: 5000, income: 44, crystal: 0, color: '#e8f1ff', sign: 'BANK' },
  gunshop: { name: '무기상', price: 0, income: 0, crystal: 0, color: '#ff5d5d', sign: 'GUNS' },
};
export const BIZ_LEVEL_MULT = [0, 1, 1.7, 2.6];
export const BIZ_UPGRADE_COST = [0, 0.8, 1.5]; // 현재 레벨 → 다음 레벨 비용 (가격 배수)

export type ResearchId = 'dmg' | 'armor' | 'eco';
export const RESEARCH: Record<ResearchId, { name: string; desc: string; crystal: number; cash: number }> = {
  dmg: { name: '강철 무기', desc: '모든 병력 공격력 +15%', crystal: 150, cash: 300 },
  armor: { name: '강화 갑옷', desc: '모든 병력 체력 +15%', crystal: 150, cash: 300 },
  eco: { name: '보급 체계', desc: '사업 수입 +12%, 채굴량 +2', crystal: 120, cash: 400 },
};

export interface Mods { dmg: number; rate: number; hp: number; regen: number; speed: number; income: number; unitDmg: number; unitHp: number; cost: number; steal: number; dash: number; armor: number; xp: number; reload: number }
export const baseMods = (): Mods => ({ dmg: 1, rate: 1, hp: 0, regen: 0, speed: 1, income: 1, unitDmg: 1, unitHp: 1, cost: 1, steal: 0, dash: 1, armor: 0, xp: 1, reload: 1 });
export interface Perk { id: string; name: string; desc: string; icon: string; apply: (m: Mods) => void }
export const PERKS: Perk[] = [
  { id: 'dmg', name: '헤드헌터', desc: '보스 무기 피해 +20%', icon: '🎯', apply: m => { m.dmg += 0.2; } },
  { id: 'rate', name: '방아쇠 손가락', desc: '연사 속도 +18%', icon: '⚡', apply: m => { m.rate += 0.18; } },
  { id: 'hp', name: '강철 심장', desc: '최대 체력 +50', icon: '❤️', apply: m => { m.hp += 50; } },
  { id: 'regen', name: '야전 의학', desc: '초당 체력 +3 재생', icon: '🩹', apply: m => { m.regen += 3; } },
  { id: 'speed', name: '거리의 질주', desc: '이동 속도 +12%', icon: '👟', apply: m => { m.speed += 0.12; } },
  { id: 'income', name: '돈세탁의 달인', desc: '사업 수입 +25%', icon: '💰', apply: m => { m.income += 0.25; } },
  { id: 'unitDmg', name: '전쟁 군주', desc: '부하 공격력 +20%', icon: '🪖', apply: m => { m.unitDmg += 0.2; } },
  { id: 'unitHp', name: '정예 훈련', desc: '부하 체력 +25%', icon: '🛡️', apply: m => { m.unitHp += 0.25; } },
  { id: 'cost', name: '암시장 인맥', desc: '훈련·건설 비용 -15%', icon: '🏷️', apply: m => { m.cost *= 0.85; } },
  { id: 'steal', name: '흡혈 탄환', desc: '입힌 피해의 8% 회복', icon: '🩸', apply: m => { m.steal += 0.08; } },
  { id: 'dash', name: '그림자 걸음', desc: '대시 재사용 -35%', icon: '💨', apply: m => { m.dash *= 0.65; } },
  { id: 'armor', name: '방탄 코트', desc: '받는 피해 -12%', icon: '🧥', apply: m => { m.armor += 0.12; } },
  { id: 'reload', name: '빠른 손', desc: '재장전 속도 +30%', icon: '🔄', apply: m => { m.reload *= 0.7; } },
  { id: 'xp', name: '악명', desc: '경험치 획득 +30%', icon: '⭐', apply: m => { m.xp += 0.3; } },
];

export type ClassId = 'warlord' | 'tycoon' | 'engineer';
export const CLASSES: Record<ClassId, { name: string; tag: string; desc: string; skill: string; skillDesc: string; cd: number }> = {
  warlord: { name: '레온 발렌', tag: '철혈의 선봉장 · 군사', desc: '체력 +40, 기관단총 지참, 소총병 2명과 함께 시작.', skill: '전장의 함성', skillDesc: '8초간 보스와 주변 부하의 연사 속도 +60%', cd: 38 },
  tycoon: { name: '한 유진', tag: '왕국 병참총감 · 경제', desc: '시작 자금 $1,600, 사업 수입 +30%.', skill: '용병 호출', skillDesc: '$350로 정예 용병 3명을 즉시 고용', cd: 30 },
  engineer: { name: '미라 카엘', tag: '불굴의 수호장 · 건설', desc: '건설·훈련 비용 -20%, 포탑 1기와 일꾼 +2로 시작.', skill: '드론 포탑', skillDesc: '현재 위치에 25초간 임시 포탑 설치', cd: 34 },
};

// 배틀로얄 자기장: [대기, 수축 시간, 다음 반경]
export const ZONE_PHASES: [number, number, number][] = [
  [240, 60, 3000], [80, 50, 2200], [70, 45, 1500], [60, 40, 950], [50, 35, 520], [40, 30, 220], [30, 25, 0],
];
export const ZONE_DPS = [3, 4, 6, 9, 13, 18, 26, 40];

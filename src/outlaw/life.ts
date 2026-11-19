// OUTLAW CITY — 주인공(도시 시민 8명)·능력치·부동산·차고·업적 등 "삶" 데이터와 순수 계산 함수. 화면과 무관해 헤드리스로 테스트할 수 있습니다.
import type { VehicleKind } from './types';

/** 주인공 특전이 곱해지거나 더해지는 값 모음 */
export interface Perks {
  /** 상점 가격 배율 */ price: number; /** 시민이 떨어뜨리는 돈 배율 */ loot: number; /** 일·활동 수입 배율 */ pay: number;
  /** 회복 배율 */ heal: number; /** 탄퍼짐 배율 */ spread: number; /** 장전 시간 배율 */ reload: number; /** 근접 피해 배율 */ melee: number;
  /** 수배 열기 식는 속도 배율 */ heat: number; /** 최대 체력 */ hp: number; /** 시작 방탄 */ armor: number;
  /** 운전 최고속 배율 */ drive: number; /** 달리기 배율 */ sprint: number; /** 부동산 수입 배율 */ biz: number; /** 스타일 보너스 배율 */ style: number;
}
export const BASE_PERKS: Perks = { price: 1, loot: 1, pay: 1, heal: 1, spread: 1, reload: 1, melee: 1, heat: 1, hp: 100, armor: 0, drive: 1, sprint: 1, biz: 1, style: 1 };

export interface HeroDef { id: string; name: string; job: string; bio: string; perkText: string; /** 도시 시민 모델 번호(0~7) */ variant: number; perks: Partial<Perks> }
export const HEROES: HeroDef[] = [
  { id: 'h0', name: '한도윤', job: '택시 기사', variant: 0, bio: '밤거리를 이십 년 누빈 베테랑. 지름길은 눈 감고도 안다.', perkText: '운전 최고속 +8% · 운전 수입 +25%', perks: { drive: 1.08, pay: 1.25 } },
  { id: 'h1', name: '서연', job: '응급실 간호사', variant: 1, bio: '피를 봐도 손이 떨리지 않는다. 월급만 빼면 다 좋았다.', perkText: '회복 효과 2배 · 체력 +15', perks: { heal: 2, hp: 115 } },
  { id: 'h2', name: '박태양', job: '조선소 용접공', variant: 2, bio: '한 방이 묵직하다. 빚만 아니었다면 평생 용접했을 것이다.', perkText: '근접 피해 2배 · 시작 방탄 40', perks: { melee: 2, armor: 40 } },
  { id: 'h3', name: '윤하은', job: '소매치기', variant: 3, bio: '사람 많은 곳이 제일 편하다. 뛰는 건 자신 있다.', perkText: '줍는 돈 2배 · 수배가 두 배 빨리 식음', perks: { loot: 2, heat: 2 } },
  { id: 'h4', name: '최건우', job: '퇴역 군인', variant: 4, bio: '전쟁은 끝났지만 도시는 아직 전선이다.', perkText: '탄퍼짐 -30% · 장전 25% 빠름 · 체력 +20', perks: { spread: 0.7, reload: 0.75, hp: 120 } },
  { id: 'h5', name: '이나래', job: '스트리트 레이서', variant: 5, bio: '브레이크는 겁쟁이나 쓰는 거라고 배웠다.', perkText: '운전 최고속 +12% · 스타일 보너스 +50%', perks: { drive: 1.12, style: 1.5 } },
  { id: 'h6', name: '정재현', job: '동네 가게 사장', variant: 6, bio: '장사 수완 하나로 버텼다. 이제 도시 전체가 시장이다.', perkText: '상점 20% 할인 · 부동산 수입 +30%', perks: { price: 0.8, biz: 1.3 } },
  { id: 'h7', name: '강다온', job: '부두 노동자', variant: 7, bio: '컨테이너를 어깨에 메던 몸이다. 쉽게 쓰러지지 않는다.', perkText: '체력 +40 · 달리기 +10% · 근접 +40%', perks: { hp: 140, sprint: 1.1, melee: 1.4 } },
];
export const heroById = (id: string): HeroDef => HEROES.find(h => h.id === id) ?? HEROES[0]!;

export interface Property { id: string; name: string; price: number; /** 분당 수입 */ income: number; desc: string }
export const PROPERTIES: Property[] = [
  { id: 'store', name: '24시 편의점', price: 6000, income: 30, desc: '밤에도 손님이 끊기지 않는다.' },
  { id: 'laundry', name: '코인 세탁소', price: 12000, income: 70, desc: '현금이 깨끗하게 돌아온다.' },
  { id: 'garage', name: '뒷골목 정비소', price: 25000, income: 150, desc: '수리비는 부르는 게 값.' },
  { id: 'bar', name: '나이트 바', price: 50000, income: 320, desc: '술과 소문이 같이 팔린다.' },
  { id: 'dock', name: '부두 창고', price: 90000, income: 600, desc: '무엇이 들어오는지는 묻지 않는다.' },
  { id: 'stake', name: '카지노 지분', price: 200000, income: 1500, desc: '확률은 언제나 집이 이긴다.' },
];
export const PROP_CAP_MIN = 40; // 방치해도 쌓이는 수입은 40분치까지

export interface CarOffer { kind: VehicleKind; price: number; color: number }
export const CAR_SHOP: CarOffer[] = [
  { kind: 'hatch', price: 2500, color: 0x2c5f9e }, { kind: 'sedan', price: 4000, color: 0x222428 }, { kind: 'taxi', price: 3500, color: 0xd9b13c },
  { kind: 'suv', price: 7000, color: 0x3f7f4b }, { kind: 'van', price: 6000, color: 0xe8e8e8 }, { kind: 'buggy', price: 9000, color: 0xe06d1f },
  { kind: 'sports', price: 16000, color: 0xe32c36 }, { kind: 'muscle', price: 24000, color: 0x1f6fd0 }, { kind: 'gt', price: 38000, color: 0xf2f2f2 },
  { kind: 'hyper', price: 70000, color: 0xffb400 },
];

export interface OwnedCar { kind: VehicleKind; color: number }
export interface LifeState {
  hero: string; props: string[]; propBank: number; propAt: number; cars: OwnedCar[];
  counters: Record<string, number>; ach: string[]; /** 옷 색 번호(-1 이면 기본 복장) */ outfit: number;
}
export const OUTFITS = [0xb23a32, 0x2c5f9e, 0x222428, 0xe8e8e8, 0x3f7f4b, 0xd9b13c, 0x8a3fa0, 0xe06d1f];
export const OUTFIT_PRICE = 60;
export const blankLife = (): LifeState => ({ hero: 'h0', props: [], propBank: 0, propAt: 0, cars: [], counters: {}, ach: [], outfit: -1 });

/** 주인공 고유 특전만 적용합니다. */
export function computePerks(life: LifeState): Perks {
  return { ...BASE_PERKS, ...heroById(life.hero).perks };
}

/** 모은 수입(분당 → 초 단위로 환산). 소유 부동산 전부 합산. */
export function propertyRate(life: LifeState, perks: Perks): number {
  let sum = 0; for (const id of life.props) sum += PROPERTIES.find(q => q.id === id)?.income ?? 0; return sum * perks.biz / 60;
}

export interface Achievement { id: string; name: string; desc: string; reward: number; test: (c: Record<string, number>, l: LifeState) => boolean }
export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_blood', name: '첫 사건', desc: '처음으로 누군가를 쓰러뜨리기', reward: 100, test: c => (c.kills ?? 0) >= 1 },
  { id: 'kills_25', name: '위험 인물', desc: '25명 쓰러뜨리기', reward: 500, test: c => (c.kills ?? 0) >= 25 },
  { id: 'kills_100', name: '도시의 공포', desc: '100명 쓰러뜨리기', reward: 2500, test: c => (c.kills ?? 0) >= 100 },
  { id: 'stars_3', name: '수배자', desc: '수배 3★ 달성', reward: 400, test: c => (c.maxStars ?? 0) >= 3 },
  { id: 'stars_5', name: '공공의 적', desc: '수배 5★ 달성', reward: 2000, test: c => (c.maxStars ?? 0) >= 5 },
  { id: 'rich_10k', name: '목돈', desc: '$10,000 보유', reward: 300, test: c => (c.maxCash ?? 0) >= 10000 },
  { id: 'rich_100k', name: '큰손', desc: '$100,000 보유', reward: 3000, test: c => (c.maxCash ?? 0) >= 100000 },
  { id: 'landlord', name: '사장님', desc: '부동산 하나 사기', reward: 500, test: (_c, l) => l.props.length >= 1 },
  { id: 'tycoon', name: '재벌', desc: '부동산 전부 사기', reward: 10000, test: (_c, l) => l.props.length >= PROPERTIES.length },
  { id: 'collector', name: '차 수집가', desc: '차량 3대 보유', reward: 800, test: (_c, l) => l.cars.length >= 3 },
  { id: 'gambler', name: '도박꾼', desc: '카지노 판돈으로 누적 $5,000 걸기', reward: 400, test: c => (c.wagered ?? 0) >= 5000 },
  { id: 'jackpot', name: '잭팟', desc: '슬롯 잭팟 맞히기', reward: 1500, test: c => (c.jackpot ?? 0) >= 1 },
  { id: 'fighter', name: '지하 챔피언', desc: '격투장 5승', reward: 1200, test: c => (c.fights ?? 0) >= 5 },
  { id: 'courier', name: '배달 왕', desc: '배달 일 10건 완료', reward: 1000, test: c => (c.courier ?? 0) >= 10 },
  { id: 'medic', name: '생명의 은인', desc: '응급 이송 5건 완료', reward: 1000, test: c => (c.paramedic ?? 0) >= 5 },
  { id: 'vigilante', name: '자경단원', desc: '자경단 의뢰 5건 완료', reward: 1000, test: c => (c.vigilante ?? 0) >= 5 },
  { id: 'thief', name: '손버릇', desc: '소매치기 10회 성공', reward: 800, test: c => (c.pickpocket ?? 0) >= 10 },
  { id: 'driver', name: '도시 운전사', desc: '택시 손님 5명 태우기', reward: 800, test: c => (c.taxi ?? 0) >= 5 },
  { id: 'contracts', name: '해결사', desc: '현상 의뢰 5건 완료', reward: 1500, test: c => (c.contracts ?? 0) >= 5 },
  { id: 'bomber', name: '폭파범', desc: '수류탄 10개 던지기', reward: 400, test: c => (c.grenades ?? 0) >= 10 },
  { id: 'story', name: '이야기 끝', desc: '모든 의뢰 완료', reward: 5000, test: c => (c.story ?? 0) >= 7 },
];

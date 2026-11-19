// HUSTLE (가제) 타이쿤 코어의 공개 타입. 씬/UI 스레드와의 계약서 역할을 한다.
// core/** 는 three·DOM 을 import 하지 않는 순수 TS 다. 씬은 이 타입만 보고 렌더한다.

/** 진행 단계. 빈털터리 → 알바 → 작은 가게 → 큰 가게 → 사업 → 대기업 → 세계 정복. */
export type Stage = 'broke' | 'parttime' | 'smallshop' | 'bigshop' | 'business' | 'corp' | 'world';

/** 도시 구역. 씬은 구역별로 스폿을 묶어 배치한다. 단계가 오르면 새 구역이 열린다. */
export type District = 'slum' | 'market' | 'downtown' | 'harbor' | 'uptown';

/** 스폿 종류. 씬은 kind 로 건물/소품 모양을 고른다. */
export type SpotKind =
  | 'home'      // 잠자리(벤치 → 방). 잠자기
  | 'scrap'     // 골목/공원. 빈 병 줍기
  | 'recycle'   // 고물상. 빈 병 팔기
  | 'food'      // 분식집. 에너지 회복
  | 'job'       // 알바 자리
  | 'market'    // 도매시장. 재료 떼오기
  | 'bank'      // 은행. 대출/상환
  | 'office'    // 비즈니스 센터. 법인 설립·상장·적대적 인수
  | 'airport'   // 국제공항. 해외 진출
  | 'lot';      // 가게 부지. 비어 있거나, 내 가게거나, 라이벌 가게다

/** 가게 업종. lot 스폿 위에 지어진다. */
export type ShopKind = 'stall' | 'cafe' | 'mart' | 'restaurant' | 'boutique' | 'tech' | 'factory';

/** 부지 크기. 지을 수 있는 업종을 정한다. */
export type LotSize = 'S' | 'M' | 'L' | 'I';

export interface SpotDef {
  id: string;
  kind: SpotKind;
  name: string;
  /** 이모지 한 글자. 프롬프트/미니맵 아이콘 용. */
  icon: string;
  district: District;
  /** 이 단계부터 도시에 나타난다(씬은 그 전엔 숨기거나 공사 가림막으로 둔다). */
  minStage: Stage;
  /** lot 전용 */
  size?: LotSize;
}

export interface StaffView {
  id: string;
  name: string;
  role: 'clerk' | 'manager';
  /** 0.7 ~ 1.3 */
  skill: number;
  wage: number;
}

export interface ShopView {
  spotId: string;
  kind: ShopKind;
  /** 업종 이름(예: '포장마차') */
  kindName: string;
  /** 간판 이름(예: '빈털터리 포장마차') */
  name: string;
  /** 1~3. 3 이 '큰 가게' */
  level: number;
  maxLevel: number;
  /** 0.5 ~ 2.0, 기본가 대비 */
  priceMult: number;
  stock: number;
  stockCap: number;
  /** 0~100 */
  rating: number;
  staff: StaffView[];
  /** 지금 문을 열고 손님을 받는 중인가(영업시간 + 사장/점원 있음) */
  serving: boolean;
  /** 오늘 0시부터 누적 */
  todayRevenue: number;
  todayCustomers: number;
  todayLost: number;
  /** 최근 하루 기준 추정 순이익(매출 - 원가 - 인건비 - 유지비) */
  profitPerDay: number;
  /** 매각 시 받는 금액 */
  value: number;
  /** 씬이 손님 NPC 를 몇 명 그릴지 정할 때 쓰는 0~1 혼잡도 */
  busy: number;
}

export interface LotView extends SpotDef {
  kind: 'lot';
  size: LotSize;
  /** 부지 가격(건물 제외) */
  price: number;
  owner: 'none' | 'player' | 'rival';
  /** owner==='player' */
  shop?: ShopView;
  /** owner==='rival' */
  rival?: { rivalId: string; rivalName: string; color: string; kind: ShopKind; kindName: string; level: number };
}

export interface ActionDef {
  /** spot 안에서만 유일하다. perform(spotId, id) 로 실행 */
  id: string;
  label: string;
  desc: string;
  /** 현금 비용(없으면 0) */
  cost: number;
  /** 완료 시 예상 수입(표시용, 없으면 0) */
  reward: number;
  /** 에너지 소모(음수면 회복) */
  energy: number;
  /** 0 이면 즉시 실행. >0 이면 activity 가 된다(실시간 초) */
  durationSec: number;
  enabled: boolean;
  disabledReason?: string;
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

export interface ActivityView {
  spotId: string;
  actionId: string;
  label: string;
  /** 0~1 */
  progress: number;
  /** true 면 진행 중 플레이어 이동을 막는다(씬이 따른다). 이동하면 cancelActivity() */
  lockMovement: boolean;
}

/** 배달처럼 다른 스폿까지 걸어가야 끝나는 일. 씬은 target 에 마커를 띄운다. */
export interface TaskView {
  id: string;
  label: string;
  fromSpotId: string;
  targetSpotId: string;
  reward: number;
  /** 남은 게임 분. 0 이하면 지각(보수 절반) */
  minutesLeft: number;
}

export interface GoalStep {
  label: string;
  done: boolean;
  /** 0~1 */
  progress: number;
}

export interface GoalView {
  /** 다음 단계 */
  next: Stage | null;
  label: string;
  /** 0~1, steps 평균 */
  progress: number;
  steps: GoalStep[];
}

export interface RivalView {
  id: string;
  name: string;
  color: string;
  shops: number;
  value: number;
  /** 적대적 인수 비용 */
  takeoverCost: number;
  acquired: boolean;
}

export interface RegionView {
  id: string;
  name: string;
  /** 0~1 시장 점유율 */
  share: number;
  /** CONQUER_SHARE 이상이면 정복 */
  conquered: boolean;
  /** 하루 수입 */
  incomePerDay: number;
  /** 다음 +10%p 투자 비용 */
  investCost: number;
}

export interface EventView {
  id: string;
  name: string;
  desc: string;
  daysLeft: number;
  district?: District;
}

export interface DayReport {
  day: number;
  revenue: number;
  costOfGoods: number;
  wages: number;
  upkeep: number;
  interest: number;
  tax: number;
  worldIncome: number;
  jobIncome: number;
  profit: number;
  customers: number;
  lost: number;
}

/** 씬/HUD 가 매 프레임 읽는 스냅샷. core.state 는 변경되면 새 객체로 교체된다(참조 비교 가능). */
export interface TycoonState {
  day: number;
  /** 0..1439, 하루 중 게임 분 */
  minutes: number;
  /** '07:30' */
  clock: string;
  /** 밤(20시~6시): 씬이 조명을 바꾼다 */
  night: boolean;
  cash: number;
  debt: number;
  /** 0~100. 소모 후 먹기/자기로만 회복(최대치는 늘지 않는다) */
  energy: number;
  stage: Stage;
  stageIndex: number;
  stageName: string;
  /** 보유 가게 평점 평균(가게 없으면 0) */
  reputation: number;
  netWorth: number;
  /** 들고 다니는 빈 병 */
  bottles: number;
  /** 들고 다니는 재료 상자 */
  cargo: { kind: ShopKind; units: number } | null;
  owned: ShopView[];
  activity: ActivityView | null;
  task: TaskView | null;
  goal: GoalView;
  rivals: RivalView[];
  regions: RegionView[];
  events: EventView[];
  lastReport: DayReport | null;
  /** 플레이어가 지금 서 있는 스폿(씬이 setPresence 로 알려준다) */
  presence: string | null;
  /** 법인 설립 여부 */
  incorporated: boolean;
  /** 상장 여부 */
  listed: boolean;
  won: boolean;
  /** 1, 2, 4 (씬이 setSpeed 로 바꾼다) */
  speed: number;
}

export type CoreEvent =
  | { type: 'cash'; text: string; amount: number; spotId?: string }
  | { type: 'stage'; text: string; stage: Stage }
  | { type: 'toast'; text: string; tone?: 'info' | 'good' | 'bad' }
  | { type: 'day'; text: string; report: DayReport }
  | { type: 'task'; text: string; task: TaskView | null }
  | { type: 'win'; text: string };

export interface TycoonCore {
  /** 최신 스냅샷. 변화가 있을 때만 새 객체 */
  readonly state: TycoonState;
  /** 매 프레임 호출. dtSec 는 실시간 초(내부에서 0.25초로 자른다) */
  tick(dtSec: number): void;
  /** 단계별로 열린 스폿 + 동적 정보(부지 주인 등). minStage 가 안 된 스폿도 들어 있다(locked) */
  spots(): Array<(SpotDef | LotView) & { locked: boolean }>;
  /** 한 스폿의 정적 정보 */
  spot(id: string): (SpotDef | LotView) | undefined;
  actionsAt(spotId: string): ActionDef[];
  perform(spotId: string, actionId: string): ActionResult;
  cancelActivity(): void;
  /** 플레이어가 어느 스폿 반경 안에 있는지. 사장이 가게에 있으면 직접 장사한다 */
  setPresence(spotId: string | null): void;
  setSpeed(speed: 1 | 2 | 4): void;
  /** 상태가 바뀔 때마다 호출. 반환값으로 구독 해제 */
  subscribe(fn: (state: TycoonState) => void): () => void;
  onEvent(fn: (event: CoreEvent) => void): () => void;
  /** localStorage 에 그대로 JSON.stringify 해서 넣으면 된다(키: TYCOON_SAVE_KEY) */
  serialize(): TycoonSave;
}

/** 저장 데이터. 허브 카드는 최상위 cash / stage / day 만 읽는다. */
export interface TycoonSave {
  v: 1;
  cash: number;
  stage: Stage;
  day: number;
  [key: string]: unknown;
}

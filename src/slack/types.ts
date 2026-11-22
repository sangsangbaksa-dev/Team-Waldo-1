// SLACK OFF(딴짓) 공용 계약. sim/view/audio/game 이 모두 이 파일만 보고 맞춥니다. 수정 금지.
export type StageId = 'class' | 'dorm';
export type Level = 1 | 2 | 3;
export type Phase = 'ready' | 'play' | 'caught' | 'done';

/** 교실: phone 폰 숏폼·메신저, manga 교과서 속 만화/웹툰, doodle 낙서, snack 과자, sleep 엎드려 자기, note 짝꿍과 쪽지, music 이어폰.
 *  기숙사 컴퓨터실: game 게임, video 영상, chat 메신저, webtoon 웹툰, shop 쇼핑몰, music 음악. */
export type ClassActivity = 'phone' | 'manga' | 'doodle' | 'snack' | 'sleep' | 'note' | 'music';
export type DormActivity = 'game' | 'video' | 'chat' | 'webtoon' | 'shop' | 'music';
export type ActivityId = ClassActivity | DormActivity;

/** 감독(교실=자습 감독 선생님, 기숙사=사감). away 멀리 → approach 다가옴(발소리) → peek 문 창/뒤에서 살핌 → scan 안으로 들어와 순회 → leave 떠남. */
export type WatchMode = 'away' | 'approach' | 'peek' | 'scan' | 'leave';
export interface Watcher { mode: WatchMode; t: number; prog: number; /** 0 없음 1 희미한 단서(발소리/그림자) 2 확실히 보임 */ hint: 0 | 1 | 2; /** 지금 어디 서 있나: 0 복도 끝 … 1 내 자리 뒤 */ near: number }

export interface SlackState {
  stage: StageId; level: Level; phase: Phase;
  time: number;            // 경과 초
  limit: number;           // 제한 초(교실 150, 기숙사 150)
  cover: boolean;          // 공부하는 척 중(교실: 교과서 펴고 필기 / 기숙사: 인강 창 전면)
  activity: ActivityId | null;   // 지금 하는 딴짓(null=딴짓 안 함)
  fun: number;             // 0..100 재미(딴짓 만끽도). 목표치 goal 도달 시 클리어 가능
  goal: number;            // 클리어 재미 목표
  sus: number;             // 0..100 의심도. 100 = 적발
  sleepy: number;          // 0..100 졸림(교실). 100 이면 졸다가 걸림
  study: number;           // 0..100 공부 진도(cover 일 때 오름). 너무 낮으면 등급 깎임
  strikes: number;         // 적발 횟수(3 이면 게임 끝). 적발 1회마다 sus 40 으로 리셋되고 잠시 cover 강제
  combo: number;           // 연속 무탈 딴짓 배수 1..5
  score: number;
  friend: number;          // 0..100 짝꿍(교실)/룸메(기숙사) 우호도. 높으면 경고를 줌
  watcher: Watcher;
  battery: number;         // 폰/기기 배터리 100..0 (phone·video·game 은 소모)
  grade: 'S' | 'A' | 'B' | 'C' | 'D' | null;  // done 일 때만
  caughtBy: string | null; // caught 일 때 사유 문구(예: "엎드려 자다 걸림")
}

export type SlackEvent =
  | { t: 'footstep'; vol: number }          // 0..1, 가까울수록 큼
  | { t: 'door'; open: boolean }
  | { t: 'peek' }                           // 문 창/뒤에서 살피기 시작
  | { t: 'scan' }                           // 안으로 들어와 순회 시작
  | { t: 'leave' }
  | { t: 'friend-warn' }                    // 짝꿍/룸메가 팔꿈치로 찌름·귓속말
  | { t: 'quiet' }                          // 주변이 갑자기 조용해짐
  | { t: 'fun'; amount: number; activity: ActivityId }
  | { t: 'activity'; id: ActivityId | null }
  | { t: 'cover'; on: boolean }
  | { t: 'strike'; n: number; reason: string }
  | { t: 'caught'; reason: string }
  | { t: 'done'; grade: string }
  | { t: 'toast'; text: string };

export interface Sim {
  readonly state: SlackState;
  start(): void;
  /** dt 초만큼 진행. phase 가 play 가 아니면 아무 일도 안 함. */
  update(dt: number): void;
  setCover(on: boolean): void;
  /** null 이면 딴짓 멈춤. 이 스테이지에서 쓸 수 없는 id 는 무시. 배터리 0 이면 phone/video/game 불가. */
  doActivity(id: ActivityId | null): void;
  /** 짝꿍 호감 올리기(쪽지·과자 나눠주기). 성공하면 true */
  bribe(): boolean;
  /** 쌓인 이벤트를 가져가고 비웁니다 */
  drain(): SlackEvent[];
}
export type CreateSim = (stage: StageId, seed: number, level: Level) => Sim;

export type SfxName =
  | 'footstep' | 'doorOpen' | 'doorClose' | 'peek' | 'chair' | 'pencil' | 'page' | 'phoneBuzz' | 'wrapper' | 'chew' | 'whisper' | 'nudge'
  | 'click' | 'key' | 'chime' | 'alert' | 'caught' | 'win' | 'fun' | 'snore' | 'lock' | 'hum';
export interface SlackAudio {
  resume(): void;
  play(name: SfxName, vol?: number): void;
  /** 배경 소리: 교실=형광등 웅웅+멀리 복도 소리, 기숙사=PC 팬+심야 정적. null 이면 끔 */
  ambience(stage: StageId | null): void;
  /** 귀를 막은 듯 먹먹하게(이어폰 음악 중) */
  muffle(on: boolean): void;
  setMuted(m: boolean): void;
  dispose(): void;
}
export type CreateAudio = () => SlackAudio;

export interface StageView {
  /** 부모에 붙일 루트(이미 내부에서 만들어 둠). game.ts 가 부모에 append 합니다 */
  readonly el: HTMLElement;
  /** 매 프레임: sim 상태를 그리고, 입력은 view 가 직접 받아 sim.setCover/doActivity/bribe 를 부릅니다 */
  frame(dt: number): void;
  /** sim.drain() 로 가져온 이벤트를 game.ts 가 넘겨줌(소리·연출) */
  onEvent(ev: SlackEvent): void;
  /** 리스너·타이머 정리 */
  dispose(): void;
}
export type CreateView = (sim: Sim, audio: SlackAudio) => StageView;

export interface SlackRecord { best: Record<StageId, { score: number; grade: string } | undefined> }

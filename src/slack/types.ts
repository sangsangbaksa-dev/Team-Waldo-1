import type { StageId, Sim, SlackEvent } from './domain/contracts';
export type { StageId, Level, Phase, ClassActivity, DormActivity, ActivityId, WatchMode, WatcherKind, Watcher, SlackState, SlackEvent, Sim, CreateSim, SlackRecord } from './domain/contracts';

export type SfxName =
  | 'footstep' | 'doorOpen' | 'doorClose' | 'peek' | 'chair' | 'pencil' | 'page' | 'phoneBuzz' | 'wrapper' | 'chew' | 'whisper' | 'nudge'
  | 'click' | 'key' | 'chime' | 'alert' | 'caught' | 'win' | 'fun' | 'snore' | 'lock' | 'hum';
export interface SlackAudio {
  resume(): void;
  /** 일시정지·탭 숨김 동안 컨텍스트를 멈춥니다. hold(false)가 resume() 을 다시 허용합니다. */
  hold(on: boolean): void;
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

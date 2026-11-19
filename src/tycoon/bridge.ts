// TYCOON — 월드/UI 쪽이 보는 코어 인터페이스. 코어(src/tycoon/core)가 이 모양을 만족하면 그대로 꽂힙니다.
// 좌표·모델은 코어가 모릅니다: 코어는 "어떤 장소가 있고 거기서 무슨 행동을 할 수 있는지"만 알려 줍니다.

/** 단계 사다리: 빈털터리 → 알바 → 작은 가게 → 큰 가게 → 사업 → 대기업 → 세계 정복 */
export const STAGE_IDS = ['broke', 'parttime', 'smallshop', 'bigshop', 'business', 'corp', 'world'] as const;
export type StageId = typeof STAGE_IDS[number];
export const STAGE_LABELS: Record<StageId, string> = { broke: '빈털터리', parttime: '알바', smallshop: '작은 가게', bigshop: '큰 가게', business: '사업', corp: '대기업', world: '세계 정복' };
export const stageIndex = (s: StageId): number => STAGE_IDS.indexOf(s);

export type SpotKind = string;
export interface SpotDef { id: string; kind: SpotKind; name: string; icon?: string; minStage: StageId }
export interface ActionDef { id: string; label: string; desc: string; cost: number; durationSec: number; enabled: boolean; disabledReason?: string }
export interface OwnedAsset { id: string; kind: string; name: string; level: number; incomePerDay: number; spotId?: string }
export interface ActivityState { id: string; label: string; progress: number; lockMovement: boolean }

export interface TycoonSnapshot {
  day: number; minutes: number; cash: number; energy: number; stage: StageId; reputation: number; netWorth: number;
  owned: OwnedAsset[]; activity: ActivityState | null; goal: { label: string; progress: number } | null;
}
export type TycoonEventType = 'cash' | 'stage' | 'toast' | 'day' | 'achievement';
export interface TycoonEvent { type: TycoonEventType; text: string; amount?: number; stage?: StageId }

export interface TycoonCore {
  readonly state: TycoonSnapshot;
  tick(dtSec: number): void;
  subscribe(fn: (s: TycoonSnapshot) => void): () => void;
  onEvent(fn: (e: TycoonEvent) => void): () => void;
  spots(): SpotDef[];
  actionsAt(spotId: string): ActionDef[];
  perform(actionId: string): { ok: boolean; message: string };
  serialize(): unknown;
}

export const TYCOON_KEY = 'waldo.tycoon.v1';

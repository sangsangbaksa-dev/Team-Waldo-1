// HUSTLE progression metadata, intentionally independent of the economy/3D city.
import type { Stage } from './types';

export const STAGES: readonly Stage[] = ['broke', 'parttime', 'smallshop', 'bigshop', 'business', 'corp', 'world'];

export const STAGE_NAMES: Record<Stage, string> = {
  broke: '빈털터리',
  parttime: '알바생',
  smallshop: '작은 가게 사장',
  bigshop: '큰 가게 사장',
  business: '사업가',
  corp: '대기업 회장',
  world: '세계 정복자',
};

export function stageIndex(stage: Stage): number { return STAGES.indexOf(stage); }
export function stageAtLeast(stage: Stage, min: Stage): boolean { return stageIndex(stage) >= stageIndex(min); }

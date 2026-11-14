// LAST CITY — 사람 크기 기준. 캐릭터와 거리 소품이 같은 눈금(1m ≈ HUMAN 월드 단위)을 쓰도록 한곳에 모았습니다.
// Blender 모델(tools/blender)은 1 단위 = 1m 로 만들어져 있고, 사람 키는 약 1.9 입니다.

/** 1m 에 해당하는 월드 단위. 보스·병사·시민은 모두 이 배율로 그려져 키가 같습니다(약 40). */
export const HUMAN = 21;
/** 모든 인간형 캐릭터(보스·병사·중화기병·시민…)의 모델 배율. 보스만 더 크거나 작지 않습니다. */
export const CHAR_SCALE = HUMAN;
/** 1인칭 눈높이: 키 1.9m 모델의 눈(머리 꼭대기 약간 아래, 1.78m)에 맞춥니다. */
export const EYE_HEIGHT = Math.round(1.78 * HUMAN);
/** 인간형 모델의 뼈대(1단위 = 1m, 발바닥 기준): 골반 높이, 무릎까지의 허벅지 길이, 다리 좌우 간격. 걷기·앉기 자세가 함께 씁니다. */
export const HIP = 0.9, KNEE = 0.44, LEG_Z = 0.11;
/** 보도 폭(블록 가장자리~건물 외벽)과 차양이 튀어나오는 길이·높이. 소품이 건물에 파고들지 않게 합니다. */
export const SIDEWALK = 40, AWNING_OUT = 15, AWNING_Y = 66;

/** 보도 위 소품: 모델 크기(m) → 월드 배율. depth 는 보도에서 건물 쪽(블록 가장자리에 수직)의 두께입니다. */
export interface PropSpec { scale: number; depth: number; width: number; height: number }
const spec = (scale: number, depth: number, width: number, height: number): PropSpec => ({ scale, depth, width, height });
/** 작은 소품은 사람 눈금(HUMAN)을 그대로 쓰고, 보도에 다 들어가지 않는 큰 구조물만 조금 줄입니다. */
export const PROPS: Record<string, PropSpec> = {
  hydrant: spec(HUMAN, 0.35, 0.64, 0.99), bin: spec(HUMAN, 0.71, 0.71, 0.98), mailbox: spec(HUMAN, 0.54, 0.52, 1.06), bench: spec(HUMAN, 0.5, 1.8, 1.1),
  dumpster: spec(HUMAN, 1.1, 2.1, 1.34), cone: spec(HUMAN, 0.42, 0.42, 0.6), barrier: spec(HUMAN, 0.7, 2.4, 0.98),
  vending: spec(HUMAN, 0.81, 1.05, 1.95), planter: spec(HUMAN, 0.97, 2.26, 1.47), bollards: spec(HUMAN, 0.23, 2.63, 1.01),
  phone_booth: spec(HUMAN, 1.04, 1.04, 2.56), street_sign: spec(HUMAN, 0.98, 1.35, 3.4), billboard: spec(14, 1.36, 5.8, 7.7),
  bus_stop: spec(16, 2.15, 3.75, 3.05), kiosk: spec(14, 2.38, 2.49, 2.87), parasol: spec(13, 2.68, 2.68, 2.45),
  lamp: spec(HUMAN, 1.47, 0.35, 9.27), tl_red: spec(HUMAN, 0.4, 2.56, 5.2), tl_green: spec(HUMAN, 0.4, 2.56, 5.2),
};

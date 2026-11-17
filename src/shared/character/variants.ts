// 공용 캐릭터 — 시드로 옷 색·피부색·키를 정해 같은 모델도 사람마다 다르게 보이게 합니다.
export const SKIN_TONES = [0xf2cfae, 0xe5b88f, 0xd6a077, 0xc08560, 0x9a6a46, 0x74492e, 0x5a3622] as const;
export const OUTFIT_COLORS = [0x2f6fd0, 0xc23b3b, 0x2e9a5f, 0xd9a23a, 0x7a4cc2, 0x2aa3a3, 0xd2682b, 0xd96a94, 0x4a5568, 0x8a8f3a, 0xe8e6df, 0x1f2430] as const;
export interface Look { team: number; skin: number; height: number; width: number }
const rnd = (seed: number): (() => number) => { let a = (seed ^ 0x9e3779b9) >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
/** 시드 → 겉모습. team 을 지정하면 옷 색은 그대로 둡니다(팀 구분이 필요한 병사). */
export function lookFor(seed: number, team?: number): Look {
  const r = rnd(seed);
  return { team: team ?? OUTFIT_COLORS[Math.floor(r() * OUTFIT_COLORS.length)], skin: SKIN_TONES[Math.floor(r() * SKIN_TONES.length)], height: 0.94 + r() * 0.12, width: 0.94 + r() * 0.12 };
}

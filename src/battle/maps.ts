/** Shared world data for simulation, rendering, menus and versioned saves. */
export type MapId = 'classic' | 'frontier' | 'continental';
export type MapBiome = 'industrial' | 'desert' | 'tundra';
export interface MapOutpost {
  name: string;
  x: number;
  z: number;
  gold: number;
  food: number;
}
export interface BattleMap {
  id: MapId;
  name: string;
  subtitle: string;
  description: string;
  halfSize: number;
  biome: MapBiome;
  seed: number;
  factionPositions: ReadonlyArray<readonly [number, number]>;
  outposts: ReadonlyArray<MapOutpost>;
  /** Longer build-up gives armies time to cross the larger world. */
  stormDelayFactor: number;
  /** A modest marching bonus keeps larger worlds readable and responsive. */
  movementFactor: number;
  /** Density grows more slowly than land area to keep low-end devices usable. */
  featureCount: number;
  normalArmyLimit: number;
}

const corners = (size: number): ReadonlyArray<readonly [number, number]> =>
  [[-size, -size], [size, -size], [-size, size], [size, size]];
const post = (name: string, x: number, z: number, gold: number, food: number): MapOutpost =>
  ({ name, x, z, gold, food });

export const MAPS: Readonly<Record<MapId, BattleMap>> = {
  classic: {
    id: 'classic', name: '강철 분지', subtitle: '산업 시설과 교차 전선',
    description: '아홉 거점이 이어진 익숙한 전장. 중앙 요새와 네 관문을 둘러싼 빠른 공방을 지휘하세요.',
    halfSize: 260, biome: 'industrial', seed: 0x7a11d0,
    factionPositions: corners(112), stormDelayFactor: 1, movementFactor: 1, featureCount: 525, normalArmyLimit: 18,
    outposts: [
      post('북부 광산', 0, -95, 3.1, .3), post('동부 시장', 95, 0, 2.5, 1.6),
      post('남부 곡창', 0, 95, .3, 3.4), post('서부 항구', -95, 0, 2.1, 2.1),
      post('중앙 요새', 0, 0, 1.15, .9), post('북서부 관문', -62, -62, 1.1, 1.7),
      post('북동부 초소', 62, -62, 1.8, .8), post('남서부 요새', -62, 62, .7, 2.3),
      post('남동부 교역소', 62, 62, 2.4, 1.2),
    ],
  },
  frontier: {
    id: 'frontier', name: '황혼 변경', subtitle: '사막 교역로와 외곽 오아시스',
    description: '면적 2.25배의 사막 변경. 열세 거점과 외곽 보급로를 나누어 지키고 기동 부대를 운용하세요.',
    halfSize: 390, biome: 'desert', seed: 0xf20a71,
    factionPositions: corners(210), stormDelayFactor: 1.35, movementFactor: 1.12, featureCount: 700, normalArmyLimit: 30,
    outposts: [
      post('북부 황금 광산', 0, -168, 3.4, .3), post('동부 대상단', 168, 0, 2.7, 1.5),
      post('남부 오아시스', 0, 168, .4, 3.6), post('서부 교역항', -168, 0, 2.2, 2.1),
      post('태양의 성채', 0, 0, 1.4, 1.1), post('북서부 협곡', -110, -110, 1.2, 1.8),
      post('북동부 망루', 110, -110, 1.9, .9), post('남서부 보급소', -110, 110, .8, 2.5),
      post('남동부 교역소', 110, 110, 2.5, 1.3),
      post('서쪽 발굴 기지', -306, 0, 3.8, .5), post('북쪽 태양 발전소', 0, -306, 3.1, 1.1),
      post('동쪽 모래 항구', 306, 0, 2.6, 2.1), post('남쪽 숨은 샘', 0, 306, .7, 4),
    ],
  },
  continental: {
    id: 'continental', name: '서리 대륙', subtitle: '얼어붙은 개척지와 장거리 작전',
    description: '면적 4배의 대륙 전장. 열일곱 거점을 연결하고 눈 덮인 외곽 기지까지 전선을 넓히세요.',
    halfSize: 520, biome: 'tundra', seed: 0xc0171e,
    factionPositions: corners(300), stormDelayFactor: 1.7, movementFactor: 1.24, featureCount: 860, normalArmyLimit: 48,
    outposts: [
      post('북부 결정 광산', 0, -225, 3.7, .4), post('동부 얼음 항구', 225, 0, 2.8, 1.7),
      post('남부 온실 지대', 0, 225, .5, 3.8), post('서부 전초 시장', -225, 0, 2.4, 2.2),
      post('백야의 요새', 0, 0, 1.5, 1.2), post('북서부 설원 관문', -148, -148, 1.3, 1.9),
      post('북동부 관측소', 148, -148, 2.1, 1), post('남서부 방벽', -148, 148, .9, 2.7),
      post('남동부 개척항', 148, 148, 2.7, 1.4),
      post('서쪽 빙하 광맥', -405, 0, 4, .6), post('북쪽 오로라 기지', 0, -405, 3.2, 1.5),
      post('동쪽 극지 보급항', 405, 0, 2.7, 2.5), post('남쪽 지열 온실', 0, 405, .8, 4.2),
      post('빙벽 감시 초소', -345, -140, 2.6, 1.8), post('북동 연구 지대', 140, -345, 3.3, 1.1),
      post('해빙 수송 기지', 345, 140, 2, 3), post('남서 설원 저장고', -140, 345, 1.5, 3.5),
    ],
  },
};

export const MAP_IDS: ReadonlyArray<MapId> = ['classic', 'frontier', 'continental'];
export const isMapId = (value: unknown): value is MapId =>
  typeof value === 'string' && Object.hasOwn(MAPS, value);
export const getMap = (id?: MapId): BattleMap => MAPS[isMapId(id) ? id : 'classic'];
export const mapDefinitionFor = (world: { mapId?: MapId }): BattleMap => getMap(world.mapId);
export const mapHalfSizeFor = (world: { mapId?: MapId }): number => mapDefinitionFor(world).halfSize;
export const outpostName = (world: { mapId?: MapId }, id: number): string =>
  mapDefinitionFor(world).outposts[id]?.name ?? `거점 ${id + 1}`;
export const outpostBonus = (world: { mapId?: MapId }, id: number): { gold: number; food: number } => {
  const definition = mapDefinitionFor(world).outposts[id];
  return definition ? { gold: definition.gold, food: definition.food } : { gold: 0, food: 0 };
};

import { describe, expect, it } from 'vitest';
import { buildMap } from '../../src/rts/map';
import { buildLanes, bushSpots, fountains } from '../../src/rts/scenery';

// 맵 장식 배치는 화면 전용이지만, 길·강·샘·부쉬가 두 진영에 같은 조건이어야 합니다(180도 대칭).
describe('FRONTLINE 맵 장식', () => {
  const map = buildMap(), lanes = buildLanes(map), n = map.size - 1;
  it('세 갈래 길이 두 본부를 잇고 대부분 걸을 수 있는 칸 위에 있다', () => {
    for (const l of [lanes.top, lanes.mid, lanes.bot]) {
      expect(l.length).toBeGreaterThan(40);
      const a = map.starts[0], b = map.starts[1];
      expect(Math.hypot(l[0].x - (a.x + 2), l[0].y - (a.y + 2))).toBeLessThan(3);
      expect(Math.hypot(l[l.length - 1].x - (b.x + 2), l[l.length - 1].y - (b.y + 2))).toBeLessThan(3);
      // 모서리를 둥글게 다듬느라 바위 가장자리에 살짝 걸치는 점은 허용합니다(5% 이하).
      const onRock = l.filter(p => map.terrain[Math.floor(p.y) * map.size + Math.floor(p.x)] !== 0).length;
      expect(onRock / l.length).toBeLessThan(0.05);
    }
  });
  it('강은 가운데를 지나고 확장 기지에서 떨어져 있다', () => {
    const r = lanes.river; expect(r.length).toBeGreaterThan(20);
    for (const p of r) for (const e of map.expansions) expect(Math.hypot(p.x - (e.x + 2), p.y - (e.y + 2))).toBeGreaterThan(8);
  });
  it('샘과 부쉬는 180도 대칭이다', () => {
    const [a, b] = fountains(map); expect(a.x + b.x).toBe(n); expect(a.y + b.y).toBe(n);
    const bushes = bushSpots(map, lanes); expect(bushes.length % 2).toBe(0);
    const half = bushes.length / 2;
    for (let i = 0; i < half; i++) { expect(bushes[i].x + bushes[half + i].x).toBeCloseTo(n, 6); expect(bushes[i].y + bushes[half + i].y).toBeCloseTo(n, 6); }
  });
});

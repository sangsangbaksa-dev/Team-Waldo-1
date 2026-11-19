import { describe, expect, it } from 'vitest';
import { atmosphereAt, blendAtmosphere, lightDirection, rgbHex, sunDirection, type Rgb } from '../../src/city/atmosphere';

const lum = (c: Rgb): number => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;

describe('도시의 분위기(하늘·안개·빛)', () => {
  it('낮은 밝고 밤은 어두우며, 밤에는 창문·네온·가로등이 켜지고 별이 뜬다', () => {
    const day = atmosphereAt(13, 'clear'), night = atmosphereAt(23, 'clear');
    expect(lum(day.skyTop)).toBeGreaterThan(lum(night.skyTop) * 4);
    expect(night.windows).toBeGreaterThan(day.windows * 5); expect(night.neon).toBeGreaterThan(day.neon); expect(night.lamps).toBeGreaterThan(day.lamps);
    expect(night.stars).toBeGreaterThan(0.8); expect(day.stars).toBe(0); expect(day.sunVis).toBeGreaterThan(0.9); expect(night.sunVis).toBe(0);
  });
  it('비·폭풍우는 해를 가리고 구름·안개·젖은 길·빗줄기를 늘린다', () => {
    const clear = atmosphereAt(13, 'clear'), rain = atmosphereAt(13, 'rain'), storm = atmosphereAt(13, 'storm');
    expect(rain.sunI).toBeLessThan(clear.sunI * 0.3); expect(storm.sunI).toBeLessThan(rain.sunI); expect(rain.sunVis).toBe(0);
    expect(rain.cloud).toBeGreaterThan(clear.cloud); expect(storm.fogFar).toBeLessThan(rain.fogFar); expect(rain.fogFar).toBeLessThan(clear.fogFar);
    expect(rain.wet).toBe(1); expect(clear.wet).toBeLessThan(1); expect(storm.rain).toBe(1); expect(clear.rain).toBeLessThan(rain.rain);
    // 흐린 하늘은 채도가 낮다(맑은 낮의 푸른 하늘보다 회색)
    const sat = (c: Rgb): number => Math.max(...c) - Math.min(...c); expect(sat(rain.skyTop)).toBeLessThan(sat(clear.skyTop));
  });
  it('시각이 연속적으로 바뀌고(24시와 0시가 이어진다) 값이 범위를 벗어나지 않는다', () => {
    const a = atmosphereAt(24, 'rain'), b = atmosphereAt(0, 'rain'); expect(rgbHex(a.skyMid)).toBe(rgbHex(b.skyMid));
    let prev = atmosphereAt(0, 'clear');
    for (let h = 0.25; h <= 24; h += 0.25) {
      const cur = atmosphereAt(h, 'clear'); expect(Math.abs(lum(cur.skyMid) - lum(prev.skyMid))).toBeLessThan(0.12); expect(Math.abs(cur.hemiI - prev.hemiI)).toBeLessThan(0.1);
      for (const c of [cur.skyTop, cur.skyMid, cur.skyLow, cur.fog]) for (const v of c) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
      prev = cur;
    }
  });
  it('비 오는 밤에는 도시 불빛에 지평선이 붉게 달아오른다', () => {
    const rain = atmosphereAt(23, 'rain'), clear = atmosphereAt(23, 'clear'); expect(rain.skyLow[0] - rain.skyLow[2]).toBeGreaterThan(clear.skyLow[0] - clear.skyLow[2] - 0.02);
  });
  it('해는 동쪽에서 떠 정오에 높이 오르고 서쪽으로 지며, 빛의 방향은 밤으로 넘어가도 튀지 않는다', () => {
    expect(sunDirection(12)[1]).toBeGreaterThan(0.8); expect(sunDirection(6)[1]).toBeCloseTo(0, 1); expect(sunDirection(0)[1]).toBeLessThan(-0.8);
    for (let h = 0; h < 24; h += 0.25) { const d = lightDirection(h), n = lightDirection(h + 0.25); expect(Math.hypot(...d)).toBeCloseTo(1, 3); expect(d[1]).toBeGreaterThan(0.15); expect(Math.hypot(d[0] - n[0], d[1] - n[1], d[2] - n[2])).toBeLessThan(0.45); }
  });
  it('blendAtmosphere 는 숫자와 색을 섞는다', () => {
    const a = atmosphereAt(13, 'clear'), b = atmosphereAt(23, 'storm'), m = blendAtmosphere(a, b, 0.5);
    expect(m.fogFar).toBeCloseTo((a.fogFar + b.fogFar) / 2, 3); expect(m.skyTop[2]).toBeCloseTo((a.skyTop[2] + b.skyTop[2]) / 2, 5); expect(blendAtmosphere(a, b, 1).sunI).toBeCloseTo(b.sunI, 5);
  });
});

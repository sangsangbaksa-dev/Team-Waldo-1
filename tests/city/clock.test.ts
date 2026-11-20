import { describe, expect, it } from 'vitest';
import { DAY_SECONDS, WEATHER_SEGMENT, carTarget, cityHour, clockLabel, incomeMood, pedTarget, phaseOf, weatherAt } from '../../src/city/clock';
import { World } from '../../src/city/world';

describe('도시의 하루와 날씨', () => {
  it('오전 8시에 시작해 하루(360초)에 24시간이 지난다', () => {
    expect(cityHour(0)).toBe(8); expect(cityHour(DAY_SECONDS / 2)).toBe(20); expect(cityHour(DAY_SECONDS)).toBe(8);
    expect(phaseOf(8)).toBe('day'); expect(phaseOf(19)).toBe('dusk'); expect(phaseOf(23)).toBe('night'); expect(phaseOf(3)).toBe('night'); expect(phaseOf(6)).toBe('dawn');
    expect(clockLabel(15.5)).toBe('오후 3:30'); expect(clockLabel(0)).toBe('오전 12:00');
  });
  it('날씨는 시드가 같으면 같고, 첫 구간은 비이며, 시간이 지나면 다양하게 바뀐다', () => {
    expect(weatherAt(5, 0)).toBe('rain');
    for (let t = 0; t < 3000; t += 37) expect(weatherAt(42, t)).toBe(weatherAt(42, t));
    const seen = new Set<string>(); for (let seg = 1; seg < 80; seg++) seen.add(weatherAt(7, seg * WEATHER_SEGMENT));
    expect(seen.size).toBe(3);
  });
  it('밤에는 유흥업, 낮에는 생활업 수입이 늘고 은행은 그대로이며 폭풍우에는 줄어든다', () => {
    expect(incomeMood('club', 'night', 'rain')).toBeGreaterThan(incomeMood('club', 'day', 'rain'));
    expect(incomeMood('store', 'day', 'clear')).toBeGreaterThan(incomeMood('store', 'night', 'clear'));
    expect(incomeMood('bank', 'night', 'storm')).toBe(1); expect(incomeMood('gunshop', 'day', 'storm')).toBe(1);
    expect(incomeMood('casino', 'night', 'storm')).toBeLessThan(incomeMood('casino', 'night', 'clear'));
  });
  it('밤·폭풍우에는 거리의 시민과 차량이 줄어든다', () => {
    expect(pedTarget('night', 'clear')).toBeLessThan(pedTarget('day', 'clear'));
    expect(pedTarget('day', 'storm')).toBeLessThan(pedTarget('day', 'clear'));
    expect(carTarget('night', 'clear')).toBeLessThan(carTarget('day', 'clear'));
  });
  it('월드가 시각·날씨를 갱신하고, 밤이 되면 시민이 줄어든다', () => {
    const w = new World({ seed: 4, difficulty: 'd3', klass: 'warlord' });
    const peds = (): number => w.actors.filter(a => a.alive && a.f === 9 && !a.inVeh).length;
    for (let i = 0; i < 30 * 5; i++) { w.step(1 / 30); w.events.length = 0; }
    expect(w.phase).toBe('day'); const dayPeds = peds();
    w.time = 200; // 밤 9시 무렵 → 90초 뒤에도 밤
    for (let i = 0; i < 30 * 90; i++) { w.step(1 / 30); w.events.length = 0; }
    expect(w.phase).toBe('night'); expect(peds()).toBeLessThanOrEqual(dayPeds);
  });
  it('연습·결투에서는 수입 배율이 적용되지 않는다', () => {
    const a = new World({ seed: 3, difficulty: 'd3', klass: 'tycoon', tutorial: true }), b = new World({ seed: 3, difficulty: 'd3', klass: 'tycoon', tutorial: true });
    a.time = 200; b.time = 10;
    for (const w of [a, b]) { const z = w.businesses.find(q => q.kind === 'club' || q.kind === 'casino' || q.kind === 'store'); if (z) z.owner = 0; w.everySecond(); }
    expect(a.factions[0].income).toBeCloseTo(b.factions[0].income);
  });
});

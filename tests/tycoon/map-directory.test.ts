import { describe, expect, it } from 'vitest';
import { mapDirectoryHtml } from '../../src/tycoon/ui/render';

describe('HUSTLE accessible vehicle directory', () => {
  const cars = [
    { name: '시티 세단', active: false, reachable: true, distance: 128.7 },
    { name: '항만 픽업', active: false, reachable: false, distance: 205 },
    { name: '내 운전 차량', active: true, reachable: true, distance: 0 },
  ];
  it('renders a labeled, selectable destination and disables inaccessible cars', () => {
    const html = mapDirectoryHtml(cars, false);
    expect(html).toContain('data-vehicle-target="0"');
    expect(html).toContain('도로 기준 약 129미터, 목적지로 설정');
    expect(html).toMatch(/data-vehicle-target="1"[^>]*disabled/);
    expect(html).toMatch(/data-vehicle-target="2"[^>]*disabled/);
    expect(html).toContain('현재 운전 중');
    expect(html).toContain('구역 개방 후 이용 가능');
    expect(html).toMatch(/data-waypoint-clear disabled/);
    expect(html).toContain('role="dialog"');
  });
  it('preserves strict escaping for both vehicle content and ARIA labels', () => {
    const html = mapDirectoryHtml([{ name: '"><script>alert(1)</script>', active: false, reachable: true, distance: Infinity }], true);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('data-waypoint-clear >');
    expect(html).toContain('도로 약 0m');
  });
  it('only enables the teleport control for an available pin', () => {
    expect(mapDirectoryHtml(cars, false)).toMatch(/data-waypoint-teleport[^>]+ disabled/);
    expect(mapDirectoryHtml(cars, true)).toMatch(/data-waypoint-teleport aria-describedby="ty-warp-hint" >/);
    const busy = mapDirectoryHtml(cars, true, '차량에서 내린 뒤 사용할 수 있어요.');
    expect(busy).toMatch(/data-waypoint-teleport[^>]+ disabled/);
    expect(busy).toContain('차량에서 내린 뒤 사용할 수 있어요.');
  });
  it('offers a helpful empty state when no vehicles are available', () => {
    expect(mapDirectoryHtml([], false)).toContain('배치된 차량이 없습니다.');
  });
});

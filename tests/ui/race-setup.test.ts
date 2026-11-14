// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETUP } from '../../src/race/config';
import { mountSetup } from '../../src/race/setup-ui';
import { RACE_KEY, raceRaceKey, readRaceRecords, writeRaceRecords } from '../../src/records';

const records = { bestLap: {}, bestRace: {}, last: null };
const click = (sel: string): void => { document.querySelector<HTMLElement>(sel)!.click(); };

beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); });

describe('SPEED RUSH 선택 화면', () => {
  it('코스 4곳, 랩 3종, 난이도 5단계, 차량 6종을 보여 준다', () => {
    mountSetup(document.body, DEFAULT_SETUP, records, { onStart: vi.fn(), onExit: vi.fn() });
    expect(document.querySelectorAll('[data-pick^="map:"]')).toHaveLength(4);
    expect(document.querySelectorAll('[data-pick^="laps:"]')).toHaveLength(3);
    expect(document.querySelectorAll('[data-pick^="level:"]')).toHaveLength(5);
    expect(document.querySelectorAll('[data-pick^="car:"]')).toHaveLength(6);
    expect(document.querySelectorAll('[data-pick].on')).toHaveLength(4);
    expect(document.body.textContent).toContain('데저트 하이웨이');
  });

  it('고른 값으로 출발한다', () => {
    const onStart = vi.fn();
    mountSetup(document.body, DEFAULT_SETUP, records, { onStart, onExit: vi.fn() });
    click('[data-pick="map:desert"]'); click('[data-pick="laps:1"]'); click('[data-pick="level:4"]'); click('[data-pick="car:bolt"]');
    expect(document.querySelector('[data-pick="map:desert"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-pick="map:sunset"]')!.getAttribute('aria-pressed')).toBe('false');
    click('[data-setup="start"]');
    expect(onStart).toHaveBeenCalledWith({ map: 'desert', laps: 1, level: 4, car: 'bolt' });
  });

  it('저장된 값이 깨져 있어도 기본 선택으로 시작한다', () => {
    const onStart = vi.fn();
    mountSetup(document.body, { map: 'x', laps: 7, level: 99, car: 'y' } as never, records, { onStart, onExit: vi.fn() });
    click('[data-setup="start"]');
    expect(onStart).toHaveBeenCalledWith(DEFAULT_SETUP);
  });

  it('메뉴로 버튼과 정리(destroy)가 동작한다', () => {
    const onExit = vi.fn(), h = mountSetup(document.body, DEFAULT_SETUP, records, { onStart: vi.fn(), onExit });
    click('[data-setup="exit"]'); expect(onExit).toHaveBeenCalledTimes(1);
    h.destroy(); expect(document.querySelector('.rc-setup')).toBeNull();
  });

  it('선택한 코스·랩 수의 기록을 보여 준다', () => {
    const rec = { bestLap: { desert: 52.5 }, bestRace: { [raceRaceKey('desert', 2)]: 108.25 }, last: null };
    mountSetup(document.body, DEFAULT_SETUP, rec, { onStart: vi.fn(), onExit: vi.fn() });
    expect(document.body.textContent).toContain('기록 없음');
    click('[data-pick="map:desert"]'); click('[data-pick="laps:2"]');
    expect(document.body.textContent).toContain('0:52.500'); expect(document.body.textContent).toContain('1:48.250');
  });
});

describe('레이스 기록 저장', () => {
  it('코스별로 저장하고 다시 읽는다', () => {
    writeRaceRecords({ bestLap: { desert: 50, harbor: 48 }, bestRace: { 'desert:3': 160 }, last: { map: 'desert', label: '데저트 하이웨이' } });
    const r = readRaceRecords();
    expect(r.bestLap).toEqual({ desert: 50, harbor: 48 }); expect(r.bestRace).toEqual({ 'desert:3': 160 }); expect(r.last?.map).toBe('desert');
  });
  it('이전 버전 기록은 선셋 서킷 3랩 기록으로 옮겨 읽는다', () => {
    localStorage.setItem(RACE_KEY, JSON.stringify({ best: 61.2, bestRace: 200 }));
    const r = readRaceRecords();
    expect(r.bestLap.sunset).toBe(61.2); expect(r.bestRace['sunset:3']).toBe(200);
  });
  it('깨진 저장값은 무시한다', () => {
    localStorage.setItem('waldo.race.v2', '{"bestLap":{"a":"x","b":-1,"c":3},"last":5}');
    expect(readRaceRecords()).toEqual({ bestLap: { c: 3 }, bestRace: {}, last: null });
    localStorage.setItem('waldo.race.v2', 'not json'); expect(readRaceRecords().bestLap).toEqual({});
  });
});

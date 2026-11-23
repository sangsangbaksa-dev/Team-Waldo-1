import { describe, expect, it } from 'vitest';
import { RELAY_CAPTURE_TIME, relayPresence, startEvent, updateCityEvents } from '../../src/city/events';
import { World } from '../../src/city/world';

const make = (): World => new World({ seed: 47, difficulty: 'd3', klass: 'warlord' });

function relayWorld(): World {
  const w = make(), player = w.boss(0)!;
  for (let i = 0; i < 20 && !w.event; i++) startEvent(w, 'relay', player.x, player.y);
  expect(w.event?.kind).toBe('relay');
  const event = w.event!;
  for (const a of w.actors) {
    if (a.f !== 0 && !event.ids.includes(a.id)) { a.x = 0; a.y = 0; }
  }
  return w;
}

function clearGuards(w: World): void {
  for (const id of w.event!.ids) {
    const guard = w.byId.get(id);
    if (guard) { guard.alive = false; w.byId.delete(id); }
  }
}

describe('전파 중계기 탈취', () => {
  it('첫 도시 사건은 중계기 점령을 안내하며 경비병 3명을 배치한다', () => {
    const w = make();
    w.time = 90; w.eventT = 1;
    updateCityEvents(w);
    expect(w.event?.kind).toBe('relay');
    expect(w.event?.ids).toHaveLength(3);
    expect(w.event?.t).toBe(130);
    for (const id of w.event!.ids) {
      const guard = w.byId.get(id)!;
      expect(guard.alive).toBe(true);
      expect(w.hostile(0, guard.f)).toBe(true);
    }
  });

  it('경비병을 제압하기 전에는 점령할 수 없고 이탈하면 진행도가 감소한다', () => {
    const w = relayWorld(), ev = w.event!, player = w.boss(0)!;
    player.x = ev.x; player.y = ev.y;
    expect(relayPresence(w, ev)).toEqual({ allied: true, contested: true });
    updateCityEvents(w);
    expect(ev.prog).toBe(0);

    clearGuards(w);
    expect(relayPresence(w, ev)).toEqual({ allied: true, contested: false });
    for (let i = 0; i < 5; i++) updateCityEvents(w);
    expect(ev.prog).toBe(5);

    player.x = 0; player.y = 0;
    updateCityEvents(w);
    expect(ev.prog).toBe(4);
  });

  it('직접 점령하면 현금·경험치·용병 3명을 주고 다음 사건을 예약한다', () => {
    const w = relayWorld(), ev = w.event!, player = w.boss(0)!, cash = w.factions[0].cash;
    clearGuards(w);
    player.x = ev.x; player.y = ev.y;
    for (let i = 0; i < RELAY_CAPTURE_TIME; i++) updateCityEvents(w);

    expect(w.event).toBeNull();
    expect(w.eventsDone).toBe(1);
    expect(w.factions[0].cash).toBeGreaterThanOrEqual(cash + 650);
    expect(w.actors.filter(a => a.alive && a.f === 0 && a.kind === 'merc')).toHaveLength(3);
    expect(w.eventT).toBeGreaterThanOrEqual(80);
  });

  it('지휘관이 없어도 아군 전투병 두 명이 중계기를 확보할 수 있다', () => {
    const w = relayWorld(), ev = w.event!, player = w.boss(0)!;
    clearGuards(w);
    player.x = 0; player.y = 0;
    w.spawnUnit('rifle', 0, ev.x - 20, ev.y);
    w.spawnUnit('rifle', 0, ev.x + 20, ev.y);
    expect(relayPresence(w, ev).allied).toBe(true);

    for (let i = 0; i < RELAY_CAPTURE_TIME; i++) updateCityEvents(w);
    expect(w.eventsDone).toBe(1);
    expect(w.event).toBeNull();
  });

  it('시간 초과 시 보상을 주지 않고 현장 경비를 정리한다', () => {
    const w = relayWorld(), ev = w.event!, cash = w.factions[0].cash, guards = [...ev.ids];
    ev.t = 1;
    updateCityEvents(w);
    expect(w.event).toBeNull();
    expect(w.eventsDone).toBe(0);
    expect(w.factions[0].cash).toBe(cash);
    for (const id of guards) expect(w.byId.has(id)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { World } from '../../src/city/world';
import { SIZE } from '../../src/city/defs';
import { startEvent, updateCityEvents } from '../../src/city/events';

function run(seed: number, until: (w: World) => boolean, max = 30 * 1200): World {
  const w = new World({ seed, difficulty: 'd3', klass: 'warlord', autoPlayer: true });
  for (let i = 0; i < max && !until(w); i++) { w.step(1 / 30); w.events.length = 0; }
  return w;
}

describe('도시 사건', () => {
  it('시작 후 일정 시간 안에 사건이 생긴다', () => {
    const w = run(1, x => !!x.event);
    expect(w.event).not.toBeNull();
  });
  it('수송차를 격파하면 현금 전리품이 떨어진다', () => {
    const w = new World({ seed: 1, difficulty: 'd3', klass: 'warlord' }), pb = w.boss(0)!;
    for (let k = 0; k < 20 && !w.event; k++) startEvent(w, 'convoy', pb.x, pb.y);
    expect(w.event?.kind).toBe('convoy');
    const before = w.loot.filter(l => l.type === 'cash').length;
    const v = w.vehicles.find(q => q.id === w.event!.vid)!; v.hp = -1;
    for (let i = 0; i < 40; i++) { w.step(1 / 30); w.events.length = 0; }
    expect(w.eventsDone).toBe(1);
    expect(w.loot.filter(l => l.type === 'cash').length).toBeGreaterThan(before);
  });
  it('연습·결투에서는 사건이 없다', () => {
    const w = new World({ seed: 1, difficulty: 'd3', klass: 'warlord', tutorial: true });
    for (let i = 0; i < 30 * 120; i++) { w.step(1 / 30); w.events.length = 0; }
    expect(w.event).toBeNull();
  });

  it('does not count a despawned convoy as a successful takedown', () => {
    const w = new World({ seed: 1, difficulty: 'd3', klass: 'warlord' });
    const boss = w.boss(0)!;
    for (let i = 0; i < 20 && !w.event; i++) startEvent(w, 'convoy', boss.x, boss.y);
    expect(w.event?.kind).toBe('convoy');
    const truck = w.vehicles.find(v => v.id === w.event!.vid)!;
    const initialDrops = w.loot.filter(l => l.type === 'cash').length;
    truck.alive = false;

    updateCityEvents(w);

    expect(w.event).toBeNull();
    expect(w.eventsDone).toBe(0);
    expect(w.loot.filter(l => l.type === 'cash')).toHaveLength(initialDrops);
  });

  it('removes expired unmanned convoys and their civilian drivers', () => {
    const w = new World({ seed: 1, difficulty: 'd3', klass: 'warlord' });
    const boss = w.boss(0)!;
    for (let i = 0; i < 20 && !w.event; i++) startEvent(w, 'convoy', boss.x, boss.y);
    expect(w.event?.kind).toBe('convoy');
    const truck = w.vehicles.find(v => v.id === w.event!.vid)!;
    const driverId = truck.driver;
    w.event!.t = 1;

    updateCityEvents(w);

    expect(w.event).toBeNull();
    expect(truck.alive).toBe(false);
    expect(w.byId.has(driverId)).toBe(false);
    expect(w.eventsDone).toBe(0);
  });

  it('does not remove a convoy stolen by the player when its event expires', () => {
    const w = new World({ seed: 1, difficulty: 'd3', klass: 'warlord' });
    const boss = w.boss(0)!;
    for (let i = 0; i < 20 && !w.event; i++) startEvent(w, 'convoy', boss.x, boss.y);
    expect(w.event?.kind).toBe('convoy');
    const truck = w.vehicles.find(v => v.id === w.event!.vid)!;
    truck.driver = boss.id;
    boss.inVeh = truck.id;
    w.event!.t = 1;

    updateCityEvents(w);

    expect(w.event).toBeNull();
    expect(truck.alive).toBe(true);
    expect(truck.driver).toBe(boss.id);
    expect(boss.inVeh).toBe(truck.id);
  });

  it('keeps delivery pickup and drop-off points inside the announced safe zone', () => {
    const w = new World({ seed: 11, difficulty: 'd3', klass: 'warlord' });
    const boss = w.boss(0)!;
    boss.x = SIZE / 2;
    boss.y = SIZE / 2;
    Object.assign(w.zone, { x: SIZE / 2, y: SIZE / 2, r: 2400, nx: SIZE / 2, ny: SIZE / 2, nr: 1600 });
    let validEvents = 0;
    for (let i = 0; i < 40; i++) {
      w.event = null;
      startEvent(w, 'delivery', boss.x, boss.y);
      if (!w.event) continue;
      const ev = w.event;
      const safe = (x: number, y: number, cx: number, cy: number, radius: number) =>
        Math.hypot(x - cx, y - cy) <= radius - 60;
      expect(safe(ev.x, ev.y, w.zone.x, w.zone.y, w.zone.r)).toBe(true);
      expect(safe(ev.tx, ev.ty, w.zone.x, w.zone.y, w.zone.r)).toBe(true);
      expect(safe(ev.x, ev.y, w.zone.nx, w.zone.ny, w.zone.nr)).toBe(true);
      expect(safe(ev.tx, ev.ty, w.zone.nx, w.zone.ny, w.zone.nr)).toBe(true);
      validEvents++;
    }
    expect(validEvents).toBeGreaterThan(0);
  });

});

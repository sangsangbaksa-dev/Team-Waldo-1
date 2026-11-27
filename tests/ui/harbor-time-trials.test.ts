import { describe, expect, it } from 'vitest';
import { beginTrial, COURSES, nearbyCourse, recordTrial, stepTrial } from '../../project-harbor/world/time-trials';
import { World } from '../../project-harbor/world/application';
import { districtAt, roadDistance } from '../../project-harbor/world/domain';
const course = COURSES[0]!;
const driver = { ...course.start, id: 5, health: 100, speed: 0 };
describe('Harbor time trials', () => {
  it('offers six reachable road courses with ordered gates', () => {
    const world = new World({ load() {}, unload() {} });
    expect(COURSES).toHaveLength(6);
    for (const c of COURSES) {
      expect(nearbyCourse(c.start)).toBe(c);
      for (const point of [c.start, ...c.gates]) {
        expect(districtAt(point.x, point.z).id).toBe(c.id);
        expect(roadDistance(point.x, point.z)).toBeLessThanOrEqual(0);
        expect(world.open(point.x, point.z)).toBe(true);
      }
    }
  });
  it('requires a stationary, healthy vehicle and no wanted level', () => {
    expect(beginTrial(course, driver, 0)).not.toBeNull();
    expect(beginTrial(course, null, 0)).toBeNull();
    expect(beginTrial(course, driver, 1)).toBeNull();
    expect(beginTrial(course, { ...driver, speed: 5 }, 0)).toBeNull();
    expect(beginTrial(course, { ...driver, x: driver.x + 50 }, 0)).toBeNull();
  });
  it('does not allow skipped gates and completes once in sequence', () => {
    let trial = beginTrial(course, driver, 0)!;
    expect(stepTrial(trial, { ...driver, ...course.gates[2]! }, 0, .05).event).toBe('none');
    for (const gate of course.gates.slice(0, -1)) {
      const update = stepTrial(trial, { ...driver, ...gate }, 0, .05);
      expect(update.event).toBe('gate'); trial = update.trial!;
    }
    const finish = stepTrial(trial, { ...driver, ...course.gates.at(-1)! }, 0, .05);
    expect(finish.event).toBe('finish'); expect(finish.trial).toBeNull();
  });
  it('cancels on exit, wanted or vehicle change and enforces the limit', () => {
    const trial = beginTrial(course, driver, 0)!;
    expect(stepTrial(trial, null, 0, .05).event).toBe('cancel');
    expect(stepTrial(trial, { ...driver, id: 6 }, 0, .05).event).toBe('cancel');
    expect(stepTrial(trial, driver, 1, .05).event).toBe('cancel');
    expect(stepTrial({ ...trial, elapsed: course.limit - .01 }, driver, 0, .05).event).toBe('timeout');
  });
  it('keeps the fastest legitimate record', () => {
    const records = new Map<string, number>();
    expect(recordTrial(records, course, 50)).toBe(true);
    expect(recordTrial(records, course, 55)).toBe(false);
    expect(recordTrial(records, course, 40)).toBe(true);
    expect(recordTrial(records, course, NaN)).toBe(false);
    expect(records.get(course.id)).toBe(40);
  });
});

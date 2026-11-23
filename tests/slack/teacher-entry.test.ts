// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClassroomView } from '../../src/slack/classroom';
import { teacherPose } from '../../src/slack/teacher-motion';
import { createSim } from '../../src/slack/sim';
import type { SlackAudio, Watcher } from '../../src/slack/types';

const watcher = (mode: Watcher['mode'], t: number, prog: number) => ({ mode, t, prog });

describe('classroom teacher entrance choreography', () => {
  it('keeps the door shut until the teacher reaches the handle', () => {
    const distant = teacherPose(watcher('approach', 1, 0.6));
    expect(distant.door).toBe(0);
    expect(distant.presence).toBe(0);
    const peek = teacherPose(watcher('peek', 1.6, 0.9));
    expect(peek.handle).toBeGreaterThan(0);
    expect(peek.door).toBe(0);
  });

  it('opens the door before showing the teacher and closes after crossing the threshold', () => {
    const start = teacherPose(watcher('scan', 0.2, 0.04));
    const open = teacherPose(watcher('scan', 0.9, 0.17));
    const crossing = teacherPose(watcher('scan', 1.25, 0.25));
    const inside = teacherPose(watcher('scan', 2.45, 0.5));
    expect(start.presence).toBe(0);
    expect(open.door).toBeGreaterThan(0.99);
    expect(open.presence).toBeLessThan(0.5);
    expect(crossing.walking).toBe(true);
    expect(crossing.presence).toBeGreaterThan(0.4);
    expect(inside.advance).toBe(1);
    expect(inside.presence).toBe(1);
    expect(inside.door).toBe(0);
  });

  it('walks back to the door, opens it and disappears before the door shuts', () => {
    const inClass = teacherPose(watcher('leave', 0, 0));
    const doorway = teacherPose(watcher('leave', 1.1, 0.55));
    const gone = teacherPose(watcher('leave', 2.8, 1));
    expect(inClass.advance).toBe(1);
    expect(inClass.presence).toBe(1);
    expect(doorway.advance).toBeLessThan(inClass.advance);
    expect(doorway.door).toBeGreaterThan(0.9);
    expect(doorway.walking).toBe(true);
    expect(gone.presence).toBe(0);
    expect(gone.door).toBe(0);
    expect(teacherPose(watcher('away', 0, 0)).door).toBe(0);
  });
});

afterEach(() => { document.body.replaceChildren(); vi.clearAllMocks(); });

it('ties classroom visual state and door sounds to the patrol clock', () => {
  const audio: SlackAudio = {
    resume: vi.fn(), hold: vi.fn(), play: vi.fn(), ambience: vi.fn(),
    muffle: vi.fn(), setMuted: vi.fn(), dispose: vi.fn(),
  };
  const sim = createSim('class', 5, 1);
  sim.start();
  const view = createClassroomView(sim, audio);
  document.body.append(view.el);
  const room = view.el.querySelector<HTMLElement>('.sl-room')!;
  const teacher = view.el.querySelector<HTMLElement>('.sl-teacher')!;

  sim.state.watcher.mode = 'peek';
  sim.state.watcher.prog = 0.95;
  view.frame(0);
  expect(room.style.getPropertyValue('--sl-handle-angle')).not.toBe('0deg');
  expect(teacher.style.opacity).toBe('');

  sim.state.watcher.mode = 'scan';
  sim.state.watcher.t = 0.9;
  sim.state.watcher.prog = 0.2;
  view.onEvent({ t: 'door', open: true });
  view.frame(0);
  expect(room.style.getPropertyValue('--sl-door-angle')).toMatch(/-\d+deg/);
  expect(audio.play).toHaveBeenCalledWith('doorOpen');
  expect(teacher.dataset.walking).toBe('true');

  const before = vi.mocked(audio.play).mock.calls.length;
  view.frame(0);
  expect(vi.mocked(audio.play).mock.calls.length).toBe(before);

  sim.state.watcher.t = 2.55;
  view.frame(0);
  expect(room.style.getPropertyValue('--sl-door-angle')).toBe('0deg');
  expect(audio.play).toHaveBeenCalledWith('doorClose');
  expect(teacher.dataset.walking).toBe('false');

  sim.state.watcher.mode = 'leave';
  sim.state.watcher.prog = 0.55;
  view.frame(0);
  expect(audio.play).toHaveBeenCalledWith('doorOpen');
  expect(teacher.dataset.facing).toBe('exit');

  sim.state.watcher.prog = 1;
  view.frame(0);
  expect(room.style.getPropertyValue('--sl-teacher-opacity')).toBe('0.00');
  expect(room.style.getPropertyValue('--sl-door-angle')).toBe('0deg');
  view.dispose();
});

import type { Watcher } from './types';

type PatrolClock = Pick<Watcher, 'mode' | 't' | 'prog'>;

export interface TeacherPose {
  door: number;
  handle: number;
  presence: number;
  advance: number;
  walking: boolean;
  exiting: boolean;
}

const ease = (value: number, from: number, to: number): number => {
  const x = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return x * x * (3 - 2 * x);
};

export function teacherPose(watcher: PatrolClock): TeacherPose {
  const t = Math.max(0, watcher.t);
  const progress = Math.max(0, Math.min(1, watcher.prog));
  const idle: TeacherPose = { door: 0, handle: 0, presence: 0, advance: 0, walking: false, exiting: false };

  if (watcher.mode === 'peek') {
    return { ...idle, handle: ease(progress, 0.65, 1) * 0.55 };
  }

  if (watcher.mode === 'scan') {
    return {
      door: ease(t, 0.12, 0.9) * (1 - ease(t, 1.65, 2.45)),
      handle: 1 - ease(t, 0.18, 0.5),
      presence: ease(t, 0.75, 1.25),
      advance: ease(t, 0.95, 2.35),
      walking: t >= 0.85 && t < 2.4,
      exiting: false,
    };
  }

  if (watcher.mode === 'leave') {
    return {
      door: ease(progress, 0.23, 0.49) * (1 - ease(progress, 0.72, 0.98)),
      handle: ease(progress, 0.15, 0.32) * (1 - ease(progress, 0.46, 0.6)),
      presence: 1 - ease(progress, 0.7, 0.87),
      advance: 1 - ease(progress, 0.05, 0.72),
      walking: progress > 0.05 && progress < 0.77,
      exiting: true,
    };
  }

  return idle;
}

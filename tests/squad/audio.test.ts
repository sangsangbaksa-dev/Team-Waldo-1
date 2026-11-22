import { beforeEach, expect, it, vi } from 'vitest';
import { SquadAudio } from '../../src/squad/audio';
import type { Effect } from '../../src/squad/sim';

const sound = vi.hoisted(() => ({ tone: vi.fn(), burst: vi.fn() }));
vi.mock('../../src/audio-core', () => ({
  AudioEngine: class {
    enabled = true;
    setEnabled = vi.fn(); unlock = vi.fn(); dispose = vi.fn();
  },
  tone: sound.tone, burst: sound.burst,
}));
const hit = (age: number): Effect => ({ x: 1, y: 1, x2: 2, y2: 2, value: 10, side: 0, kind: 'hit', age });

beforeEach(() => { sound.tone.mockClear(); sound.burst.mockClear(); });

it('plays each squad battle effect only when it is newly created', () => {
  const audio = new SquadAudio();
  audio.battle([hit(0.2)], 100);
  expect(sound.tone).not.toHaveBeenCalled();
  audio.battle([hit(0.2), hit(0)], 200);
  expect(sound.tone).toHaveBeenCalledTimes(1);
  audio.battle([hit(0.3)], 300);
  expect(sound.tone).toHaveBeenCalledTimes(1);
  audio.dispose();
});

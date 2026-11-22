import { afterEach, expect, it, vi } from 'vitest';
import { createSlackAudio } from '../../src/slack/audio';

afterEach(() => vi.unstubAllGlobals());

it('requires a gesture, retries rejected resumes, and closes only once', async () => {
  const node = () => ({ connect: vi.fn(), gain: { value: 0 }, frequency: { value: 0 },
    threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 },
  });
  const ctx = {
    state: 'suspended',
    createGain: node, createBiquadFilter: node, createDynamicsCompressor: node,
    resume: vi.fn().mockRejectedValueOnce(new Error('gesture required')).mockResolvedValue(undefined),
    close: vi.fn().mockRejectedValue(new Error('already closed')),
  };
  const Context = vi.fn(function () { return ctx; });
  vi.stubGlobal('AudioContext', Context);
  const audio = createSlackAudio();
  audio.play('click');
  expect(Context).not.toHaveBeenCalled();
  audio.resume(); audio.resume();
  expect(ctx.resume).toHaveBeenCalledTimes(1);
  await Promise.resolve(); await Promise.resolve();
  audio.resume();
  expect(ctx.resume).toHaveBeenCalledTimes(2);
  audio.dispose(); audio.dispose(); audio.resume(); audio.play('click');
  expect(ctx.close).toHaveBeenCalledTimes(1);
  expect(Context).toHaveBeenCalledTimes(1);
});

it('restores sound when resume wins the race with a pending suspend', async () => {
  const node = () => ({ connect: vi.fn(), gain: { value: 0 }, frequency: { value: 0 },
    threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 } });
  let finishSuspend: (() => void) | undefined;
  const ctx = {
    state: 'suspended',
    createGain: node, createBiquadFilter: node, createDynamicsCompressor: node,
    resume: vi.fn().mockImplementation(() => { ctx.state = 'running'; return Promise.resolve(); }),
    suspend: vi.fn().mockImplementation(() => new Promise<void>(resolve => { finishSuspend = () => { ctx.state = 'suspended'; resolve(); }; })),
    close: vi.fn().mockResolvedValue(undefined),
  };
  vi.stubGlobal('AudioContext', vi.fn(function () { return ctx; }));
  const audio = createSlackAudio();
  audio.resume();
  await Promise.resolve(); await Promise.resolve();
  audio.hold(true);
  audio.hold(false);
  audio.resume(); // The context still looks running before suspension resolves.
  finishSuspend?.();
  await Promise.resolve(); await Promise.resolve();
  expect(ctx.suspend).toHaveBeenCalledTimes(1);
  expect(ctx.resume).toHaveBeenCalledTimes(2);
  expect(ctx.state).toBe('running');
  audio.dispose();
});

it('does not allocate silent oscillator or noise voices while SFX are muted', () => {
  const parameter = () => ({ value: 0, setTargetAtTime: vi.fn() });
  const node = () => ({
    connect: vi.fn(), gain: parameter(), frequency: parameter(), threshold: parameter(),
    knee: parameter(), ratio: parameter(), attack: parameter(), release: parameter(),
  });
  const ctx = {
    state: 'running', destination: {},
    createGain: vi.fn(node), createBiquadFilter: vi.fn(node), createDynamicsCompressor: vi.fn(node),
    createOscillator: vi.fn(), createBuffer: vi.fn(), createBufferSource: vi.fn(),
    resume: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined),
  };
  vi.stubGlobal('AudioContext', vi.fn(function () { return ctx; }));
  const audio = createSlackAudio();
  audio.resume();
  audio.setMuted(true);
  audio.play('click');
  audio.play('hum');
  audio.play('footstep');
  expect(ctx.createBuffer).not.toHaveBeenCalled();
  expect(ctx.createOscillator).not.toHaveBeenCalled();
  expect(ctx.createBufferSource).not.toHaveBeenCalled();
  audio.dispose();
});

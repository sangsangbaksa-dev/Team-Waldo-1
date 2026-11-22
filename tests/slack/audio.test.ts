// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { createSlackAudio } from '../../src/slack/audio';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });

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

it('suspends procedural earbud note timers while sound is muted', () => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  const param = () => ({ value: 0, setTargetAtTime: vi.fn() });
  const node = () => ({
    connect: vi.fn(), gain: param(), frequency: param(),
    threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(),
  });
  const ctx = {
    state: 'running', currentTime: 0, destination: {},
    createGain: vi.fn(node), createBiquadFilter: vi.fn(node), createDynamicsCompressor: vi.fn(node),
    resume: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined),
  };
  vi.stubGlobal('AudioContext', vi.fn(function () { return ctx; }));
  const audio = createSlackAudio();
  audio.resume();
  audio.setMuted(true);
  audio.muffle(true);
  expect(vi.getTimerCount()).toBe(0);
  audio.setMuted(false);
  expect(vi.getTimerCount()).toBe(1);
  audio.setMuted(true);
  expect(vi.getTimerCount()).toBe(0);
  audio.dispose();
});

it('stops earbud loop while paused and does not restart it while muted', async () => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // silence note synth, count timers only
  const node = () => ({
    connect: vi.fn(), gain: { value: 0, setTargetAtTime: vi.fn() },
    frequency: { value: 0, setTargetAtTime: vi.fn() },
    threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 },
    attack: { value: 0 }, release: { value: 0 },
  });
  const ctx = {
    state: 'running', currentTime: 0, destination: {},
    createGain: vi.fn(node), createBiquadFilter: vi.fn(node),
    createDynamicsCompressor: vi.fn(node), resume: vi.fn().mockResolvedValue(undefined),
    suspend: vi.fn().mockImplementation(() => { ctx.state = 'suspended'; return Promise.resolve(); }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  vi.stubGlobal('AudioContext', vi.fn(function () { return ctx; }));
  const audio = createSlackAudio();
  audio.resume();
  audio.muffle(true);
  expect(vi.getTimerCount()).toBe(1);
  audio.hold(true);
  expect(vi.getTimerCount()).toBe(0);
  audio.setMuted(true);
  expect(vi.getTimerCount()).toBe(0);
  audio.hold(false);
  await Promise.resolve();
  expect(vi.getTimerCount()).toBe(0);
  audio.setMuted(false);
  expect(vi.getTimerCount()).toBe(1);
  audio.hold(true);
  expect(vi.getTimerCount()).toBe(0);
  audio.dispose();
});

it('stops silent ambience generation on mute and restores the selected stage on unmute', () => {
  vi.useFakeTimers();
  const param = () => ({ value: 0, setTargetAtTime: vi.fn() });
  const node = () => ({
    connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(),
    gain: param(), frequency: param(), Q: param(), threshold: param(),
    knee: param(), ratio: param(), attack: param(), release: param(),
  });
  const ctx = {
    state: 'running', currentTime: 0, sampleRate: 200, destination: {},
    createGain: vi.fn(node), createBiquadFilter: vi.fn(node),
    createDynamicsCompressor: vi.fn(node), createOscillator: vi.fn(node),
    createBufferSource: vi.fn(node),
    createBuffer: vi.fn(() => ({ getChannelData: () => new Float32Array(400) })),
    resume: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined),
  };
  vi.stubGlobal('AudioContext', vi.fn(function () { return ctx; }));
  const audio = createSlackAudio();
  audio.resume();
  audio.setMuted(true);
  audio.ambience('class');
  expect(ctx.createBuffer).not.toHaveBeenCalled();
  expect(ctx.createOscillator).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  audio.setMuted(false);
  expect(ctx.createBuffer).toHaveBeenCalledTimes(2);
  expect(ctx.createOscillator).toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(1);
  audio.setMuted(true);
  expect(vi.getTimerCount()).toBe(0);
  audio.setMuted(false);
  expect(ctx.createBuffer).toHaveBeenCalledTimes(4);
  audio.ambience(null);
  expect(vi.getTimerCount()).toBe(0);
  audio.dispose();
});

it('throttles rapid click/key bursts without muting alerts and footsteps', () => {
  const param = () => ({ value: 0, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(),
    gain: param(), frequency: param(), Q: param(), threshold: param(), knee: param(),
    ratio: param(), attack: param(), release: param() });
  const ctx = {
    state: 'running', currentTime: 0, sampleRate: 1000, destination: {},
    createGain: vi.fn(node), createBiquadFilter: vi.fn(node),
    createDynamicsCompressor: vi.fn(node), createBufferSource: vi.fn(node),
    createOscillator: vi.fn(node),
    createBuffer: vi.fn(() => ({ getChannelData: () => new Float32Array(500) })),
    resume: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined),
  };
  vi.stubGlobal('AudioContext', vi.fn(function () { return ctx; }));
  const now = vi.spyOn(performance, 'now').mockReturnValue(0);
  const audio = createSlackAudio(); audio.resume();
  for (let i = 0; i < 120; i++) audio.play(i % 2 ? 'key' : 'click');
  expect(ctx.createBuffer).toHaveBeenCalledTimes(1);
  now.mockReturnValue(45);
  audio.play('key');
  expect(ctx.createBuffer).toHaveBeenCalledTimes(2);
  audio.play('footstep', 0.6);
  expect(ctx.createBuffer).toHaveBeenCalledTimes(4); // Alert-like ambient cues are not throttled.
  audio.dispose();
});

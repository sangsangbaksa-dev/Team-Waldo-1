import { afterEach, describe, expect, it, vi } from "vitest";
import { Sound } from "../../src/room-tone/sound.js";

function harness() {
  const ctx={
    state:"suspended",
    currentTime:12,
    suspend:vi.fn(async()=>{ctx.state="suspended";}),
    resume:vi.fn(async()=>{ctx.state="running";}),
  };
  const gain={
    cancelScheduledValues:vi.fn(),
    setTargetAtTime:vi.fn(),
  };
  const sound=new Sound();
  sound.ctx=ctx as unknown as AudioContext;
  sound.level={gain} as unknown as GainNode;
  sound.paused=true;
  sound.muted=false;
  return {sound,ctx};
}

describe("ROOM TONE WebAudio suspend and resume",()=>{
  afterEach(()=>{vi.useRealTimers()});
  it("starts the heartbeat after asynchronous audio resume",async()=>{
    vi.useFakeTimers();
    const {sound,ctx}=harness();
    let completeResume:()=>void=()=>{};
    let signalStarted:()=>void=()=>{};
    const started=new Promise<void>(resolve=>{signalStarted=resolve;});
    ctx.resume=vi.fn(()=>{
      signalStarted();
      return new Promise<void>(resolve=>{
        completeResume=()=>{
          ctx.state="running";
          resolve();
        };
      });
    });
    sound.pause(false);
    await started;
    expect(ctx.resume).toHaveBeenCalledOnce();
    expect(sound.clock).toBeNull();
    completeResume();
    await sound.powerQueue;
    expect(sound.clock).not.toBeNull();
    sound.pause(true);
    expect(sound.clock).toBeNull();
    await sound.powerQueue;
    expect(ctx.suspend).toHaveBeenCalledOnce();
  });
  it("never resurrects a timer after a later pause or mute",async()=>{
    vi.useFakeTimers();
    let finish:()=>void=()=>{};
    const {sound,ctx}=harness();
    ctx.resume=vi.fn(()=>new Promise<void>(resolve=>{finish=()=>{
      ctx.state="running";
      resolve();
    };}));
    sound.pause(false);
    sound.pause(true);
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(sound.clock).toBeNull();
    sound.muted=true;
    sound.pause(false);
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(sound.clock).toBeNull();
  });

  it("releases the context and heartbeat on an actual unload",async()=>{
    vi.useFakeTimers();
    const {sound,ctx}=harness();
    const close=vi.fn(async()=>{ctx.state="closed";});
    Object.assign(ctx,{close});
    sound.pause(false);
    await sound.powerQueue;
    expect(sound.clock).not.toBeNull();
    sound.dispose();
    expect(sound.clock).toBeNull();
    expect(sound.ctx).toBeNull();
    expect(close).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(ctx.state).toBe("closed");
    sound.dispose();
    expect(close).toHaveBeenCalledOnce();
  });
  it("does not throw when an audio output rejects transitions",async()=>{
    vi.useFakeTimers();
    const {sound,ctx}=harness();
    ctx.resume=vi.fn(async()=>{throw Error("device revoked")});
    expect(()=>sound.pause(false)).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(sound.clock).toBeNull();
  });
});

describe("ROOM TONE audio mute power management",()=>{
  afterEach(()=>vi.useRealTimers());
  it("suspends the active audio graph on mute and resumes after unmuting",async()=>{
    vi.useFakeTimers();
    const {sound,ctx}=harness();
    ctx.state="running";
    sound.paused=false;
    sound.startClock();
    expect(sound.clock).not.toBeNull();
    sound.setMute(true);
    await sound.powerQueue;
    expect(ctx.state).toBe("suspended");
    expect(sound.clock).toBeNull();
    expect(ctx.suspend).toHaveBeenCalledOnce();
    sound.setMute(false);
    await sound.powerQueue;
    expect(ctx.state).toBe("running");
    expect(sound.clock).not.toBeNull();
    expect(ctx.resume).toHaveBeenCalledOnce();
    sound.dispose();
  });
  it("never wakes a muted graph when a paused game resumes",async()=>{
    vi.useFakeTimers();
    const {sound,ctx}=harness();
    sound.setMute(true);
    sound.pause(false);
    await sound.powerQueue;
    expect(ctx.resume).not.toHaveBeenCalled();
    expect(sound.clock).toBeNull();
    sound.dispose();
  });
  it("serializes rapidly toggled mute and pause without leaving running sound",async()=>{
    vi.useFakeTimers();
    const {sound,ctx}=harness();
    ctx.state="running";
    sound.paused=false;
    sound.setMute(true);
    sound.pause(true);
    sound.setMute(false);
    await sound.powerQueue;
    expect(ctx.state).toBe("suspended");
    expect(sound.clock).toBeNull();
    sound.dispose();
  });
});

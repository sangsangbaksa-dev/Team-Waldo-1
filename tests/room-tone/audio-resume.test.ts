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
    sound.pause(false);
    expect(ctx.resume).toHaveBeenCalledOnce();
    expect(sound.clock).toBeNull();
    await Promise.resolve();
    await Promise.resolve();
    expect(sound.clock).not.toBeNull();
    sound.pause(true);
    expect(sound.clock).toBeNull();
    await Promise.resolve();
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
    await Promise.resolve();
    await Promise.resolve();
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

import { describe,expect,it } from "vitest";
import { shouldResumeSessionAudio } from "../../src/room-tone/session-audio.mjs";
describe("ROOM TONE transient audio restoration",()=>{
  it.each(["puzzle","capture"])("restores %s audio only when visible and focused",(state)=>{
    expect(shouldResumeSessionAudio(state,false,true)).toBe(true);
    expect(shouldResumeSessionAudio(state,true,true)).toBe(false);
    expect(shouldResumeSessionAudio(state,false,false)).toBe(false);
  });
  it.each(["home","load","play","pause","map","lost","won","error"])("does not resume audio for %s",state=>{
    expect(shouldResumeSessionAudio(state,false,true)).toBe(false);
  });
});

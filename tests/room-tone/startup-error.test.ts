import { describe,expect,it } from "vitest";
import { describeStartupError } from "../../src/room-tone/startup-error.mjs";
describe("ROOM TONE actionable loading failures",()=>{
  it("offers a retry for failed GLB requests and dynamic module downloads",()=>{
    for(const err of [
      new Error("캐릭터 모델 다운로드 실패"),
      new TypeError("Failed to fetch"),
      new Error("Failed to fetch dynamically imported module"),
      new Error("Loading chunk 123 failed"),
    ]){
      const reason=describeStartupError(err);
      expect(reason.retryable).toBe(true);
      expect(reason.title).toMatch(/파일/);
      expect(reason.description).toMatch(/다시 시도/);
    }
  });
  it("keeps renderer failures distinct from recoverable network faults",()=>{
    for(const err of [new Error("WebGL2 not supported"),null,undefined,{}]){
      const reason=describeStartupError(err);
      expect(reason.retryable).toBe(false);
      expect(reason.title).toMatch(/게임/);
    }
  });
});

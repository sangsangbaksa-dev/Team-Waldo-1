import { describe, expect, it } from "vitest";
import { loadFailureText } from "../../src/room-tone/loading-error.mjs";

describe("ROOM TONE recoverable loading errors", () => {
  it("identifies a missing model and browser network errors", () => {
    expect(loadFailureText(new Error("캐릭터 모델 다운로드 실패"))).toContain("인터넷 연결");
    expect(loadFailureText(new TypeError("Failed to fetch"))).toContain("인터넷 연결");
    expect(loadFailureText(new DOMException("Aborted", "AbortError"))).toContain("인터넷 연결");
    expect(loadFailureText(new Error("GLTFLoader: Invalid GLB magic bytes"))).toContain("인터넷 연결");
  });
  it("distinguishes unsupported graphics hardware", () => {
    expect(loadFailureText(new Error("Error creating WebGL context."))).toContain("WebGL 2");
    expect(loadFailureText(new Error("GPU device unavailable"))).toContain("WebGL 2");
  });
  it("keeps opaque internal error details hidden from the interface", () => {
    expect(loadFailureText(new Error("internal/private/details"))).not.toContain("internal/private");
    expect(loadFailureText(null)).toContain("초기화");
  });
});

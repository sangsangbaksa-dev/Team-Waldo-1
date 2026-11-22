let request;
/** Share the same in-flight download between session start and callers. */
export function modelBytes() {
  if (!request) {
    const pending = fetch("./room-tone.glb").then((response) => {
      if (!response.ok) throw new Error("캐릭터 모델 다운로드 실패");
      return response.arrayBuffer();
    });
    // A stale, released download must never clear the newer active request.
    let attempt;
    attempt = pending.catch((error) => {
      if (request === attempt) request = null;
      throw error;
    });
    request = attempt;
  }
  return request;
}
/** Decoded Three.js geometry replaces the temporary source bytes. */
export function releaseModelBytes() { request = null; }

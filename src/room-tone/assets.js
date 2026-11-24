let request;
const listeners = new Set();
/** 받는 동안의 바이트. 늦게 붙은 구독자도 마지막 값부터 이어 받습니다. */
let announced = 0;
let announcedTotal = 0;
function emit(loaded, total) {
  announced = Math.max(announced, loaded);
  announcedTotal = Math.max(announcedTotal, total || announced);
  for (const fn of listeners) fn(announced, announcedTotal);
}
/** 모델 다운로드 진행률. 구독을 끊는 함수를 돌려줍니다. */
export function onModelProgress(fn) {
  listeners.add(fn);
  if (announced > 0) fn(announced, announcedTotal);
  return () => listeners.delete(fn);
}
/** Share the same in-flight download between session start and callers. */
export function modelBytes() {
  if (!request) {
    const pending = fetch("./room-tone.glb").then(async (response) => {
      if (!response.ok) throw new Error("캐릭터 모델 다운로드 실패");
      const total = Number(response.headers?.get?.("content-length")) || 0;
      if (!response.body?.getReader) {
        const buffer = await response.arrayBuffer();
        emit(buffer.byteLength, buffer.byteLength || total);
        return buffer;
      }
      const reader = response.body.getReader();
      const chunks = [];
      let loaded = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        emit(loaded, total || loaded);
      }
      const out = new Uint8Array(loaded);
      let offset = 0;
      for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; }
      emit(loaded, loaded);
      return out.buffer;
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
export function releaseModelBytes() {
  request = null;
  announced = 0;
  announcedTotal = 0;
}

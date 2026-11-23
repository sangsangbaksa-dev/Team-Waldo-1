let request;
/** Share one in-flight model download, but never wait forever on a stalled CDN. */
export function modelBytes() {
  if (!request) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? globalThis.setTimeout(() => controller.abort(), 90_000) : null;
    const pending = fetch("./room-tone.glb", controller ? { signal: controller.signal } : undefined)
      .then((response) => {
        if (!response.ok) throw new Error("캐릭터 모델 다운로드 실패");
        return response.arrayBuffer();
      }).finally(() => {
        if (timer !== null) globalThis.clearTimeout(timer);
      });
    // A stale, released download must never clear a newer active request.
    let attempt;
    attempt = pending.catch((error) => {
      if (request === attempt) request = null;
      throw error;
    });
    request = attempt;
  }
  return request;
}
/** Parsed Three.js geometry replaces the temporary source bytes. */
export function releaseModelBytes() { request = null; }

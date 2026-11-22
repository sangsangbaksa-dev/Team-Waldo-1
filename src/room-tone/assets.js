let request;
let controller;
/** Share the same in-flight download between session start and callers. */
export function modelBytes() {
  if (!request) {
    const activeController = new AbortController();
    const pending = fetch("./room-tone.glb", { signal: activeController.signal }).then((response) => {
      if (!response.ok) throw new Error("캐릭터 모델 다운로드 실패");
      return response.arrayBuffer();
    });
    // A stale, released download must never clear the newer active request.
    let attempt;
    attempt = pending.catch((error) => {
      if (request === attempt) {
        request = null;
        controller = null;
      }
      throw error;
    });
    request = attempt;
    controller = activeController;
  }
  return request;
}
/** Free decoded bytes and cancel a request whose startup path is no longer active. */
export function releaseModelBytes() {
  const activeController = controller;
  request = null;
  controller = null;
  activeController?.abort();
}

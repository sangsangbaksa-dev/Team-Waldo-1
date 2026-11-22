let request;
/** Share one in-flight binary download between hover prefetch and game start. */
export function modelBytes() {
  if (!request) {
    request = fetch("./room-tone.glb")
      .then((response) => {
        if (!response.ok) throw new Error("캐릭터 모델 다운로드 실패");
        return response.arrayBuffer();
      })
      .catch((error) => {
        request = null;
        throw error;
      });
  }
  return request;
}

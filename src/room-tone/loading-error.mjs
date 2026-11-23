/** Keep technical exceptions out of player-facing start-up guidance. */
export function loadFailureText(error) {
  const description = error instanceof Error ? error.message : String(error ?? "");
  const name = error && typeof error === "object" ? error.name : "";
  if (/glb|gltf|invalid binary/i.test(description)) {
    return "캐릭터 파일을 읽지 못했습니다. 다시 시도하거나 브라우저를 새로고침해 주세요.";
  }
  if (name === "AbortError" || /캐릭터 모델|download|network|failed to fetch|fetch failed|http\s*[45]\d\d/i.test(description)) {
    return "캐릭터 데이터를 다운로드하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.";
  }
  if (/webgl|graphics context|gpu|hardware acceleration/i.test(description)) {
    return "그래픽 장치를 초기화하지 못했습니다. WebGL 2 또는 하드웨어 가속을 켜고 다시 시도해 주세요.";
  }
  return "게임을 초기화하지 못했습니다. 다시 시도하거나 브라우저를 새로고침해 주세요.";
}

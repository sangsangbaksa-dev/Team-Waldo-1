/** Map startup failures to actionable retry text without exposing stack traces. */
export function describeStartupError(error) {
  const reason = typeof error?.message === "string" ? error.message : String(error ?? "");
  const retryable = /캐릭터 모델 다운로드|failed to fetch|network|dynamically imported module|loading chunk/i.test(reason);
  return retryable
    ? {
      title:"파일을 불러오지 못했습니다",
      description:"모델 또는 게임 파일 다운로드가 중단됐습니다. 연결을 확인한 뒤 다시 시도해 주세요.",
      retryable:true,
    }
    : {
      title:"게임을 열 수 없습니다",
      description:"WebGL 2를 지원하는 브라우저에서 하드웨어 가속을 켜고 다시 열어 주세요.",
      retryable:false,
    };
}

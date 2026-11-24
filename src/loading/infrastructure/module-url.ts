/**
 * 동적 import 가 네트워크에서 실패하면 브라우저는 그 주소를 실패한 모듈로 기억합니다.
 * 같은 주소를 다시 import 해도 요청이 나가지 않으므로, 재시도에만 쿼리를 붙여 새 요청으로 이어 갑니다.
 * 진행 중인 로딩 화면을 갈아 끼우거나 페이지를 새로고침하지는 않습니다.
 */
export function retryModuleUrl(message: string, attempt: number): string | null {
  if (attempt < 1) return null;
  const found = message.match(/https?:\/\/[^\s)'"]+/);
  if (!found) return null;
  try {
    const url = new URL(found[0]);
    url.searchParams.set('waldo-retry', String(attempt));
    return url.href;
  } catch {
    return null;
  }
}

export async function importFresh<T>(load: () => Promise<T>, attempt: number, error: unknown): Promise<T> {
  const next = retryModuleUrl(error instanceof Error ? error.message : '', attempt);
  if (!next) return load();
  return import(/* @vite-ignore */ next) as Promise<T>;
}

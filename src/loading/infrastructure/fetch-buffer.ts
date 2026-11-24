/**
 * 한 파일을 받습니다. 한참 데이터가 없으면 이미 받은 바이트 다음부터 이어 받습니다.
 * 진행 콜백은 한 번 알린 바이트 수보다 작아지지 않습니다. 시간 초과로 0부터 다시 세지 않습니다.
 */
export async function fetchBuffer(url: string, onProgress?: (loaded: number, total: number) => void, stallMs = 30000): Promise<ArrayBuffer> {
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  let announced = 0;
  let total = 0;
  let resumable = true;
  const publish = (bytes: number, size: number): void => {
    announced = Math.max(announced, bytes);
    onProgress?.(announced, Math.max(size, announced));
  };

  for (;;) {
    const ctl = new AbortController();
    const before = loaded;
    let timer = 0;
    const arm = (): void => {
      window.clearTimeout(timer);
      if (resumable) timer = window.setTimeout(() => ctl.abort(), stallMs);
    };
    try {
      arm();
      const res = await fetch(url, { signal: ctl.signal, headers: loaded > 0 && resumable ? { Range: `bytes=${loaded}-` } : undefined });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      arm();
      if (loaded > 0 && res.status !== 206) {
        // 서버가 이어 받기를 거절했습니다. 받은 양 표시는 유지하고, 이 응답을 끝까지 읽습니다.
        resumable = false;
        chunks.length = 0;
        loaded = 0;
        window.clearTimeout(timer);
      }
      const len = Number(res.headers.get('content-length')) || 0;
      if (res.headers.get('content-encoding')) { resumable = false; window.clearTimeout(timer); }
      total = len ? loaded + len : total;
      if (!res.body) {
        const bytes = new Uint8Array(await res.arrayBuffer());
        chunks.push(bytes);
        loaded += bytes.byteLength;
        publish(loaded, loaded);
      } else {
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.byteLength;
          arm();
          publish(loaded, total);
        }
      }
      if (total && loaded < total) throw new Error(`short ${loaded}/${total} ${url}`);
      const out = new Uint8Array(loaded);
      let offset = 0;
      for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; }
      publish(loaded, loaded);
      return out.buffer;
    } catch (error) {
      if (ctl.signal.aborted && resumable) continue;
      if (loaded > before && resumable) continue;
      throw error;
    } finally { window.clearTimeout(timer); }
  }
}

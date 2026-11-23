/**
 * 게임을 불러오는 동안 보여 주는 로딩 화면과, 네트워크가 불안정해도 끝까지 받아 내는 재시도 도구.
 * 느리거나 끊겨도 "실패"로 중단하지 않고, 받을 수 있을 때까지 조용히 다시 시도합니다.
 */

export interface LoadingScreen {
  /** 진행률(0~1). null 이면 막대를 진행 중 표시로 둡니다. */
  progress(fraction: number | null, label?: string): void;
  /** 진행 막대 아래 보조 안내(재시도 중 등). 빈 문자열이면 지웁니다. */
  note(text: string): void;
  close(): void;
}

export function showLoading(title: string): LoadingScreen {
  document.querySelector('.ld-screen')?.remove();
  const el = document.createElement('div');
  el.className = 'ld-screen';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = `<div class="ld-box"><div class="ld-kicker">WALDO</div><h2 class="ld-title"></h2><div class="ld-bar"><i></i></div><div class="ld-row"><span class="ld-label">불러오는 중</span><span class="ld-pct"></span></div><p class="ld-note"></p></div>`;
  el.querySelector('.ld-title')!.textContent = title;
  document.body.append(el);
  const bar = el.querySelector<HTMLElement>('.ld-bar')!, fill = el.querySelector<HTMLElement>('.ld-bar i')!;
  const label = el.querySelector<HTMLElement>('.ld-label')!, pct = el.querySelector<HTMLElement>('.ld-pct')!, noteEl = el.querySelector<HTMLElement>('.ld-note')!;
  let shown = 0;
  return {
    progress(fraction, text) {
      if (text) label.textContent = text;
      if (fraction === null || !Number.isFinite(fraction)) { bar.classList.add('busy'); pct.textContent = ''; return; }
      bar.classList.remove('busy');
      shown = Math.max(shown, Math.min(1, Math.max(0, fraction))); // 재시도로 되돌아가도 막대는 뒤로 가지 않습니다
      fill.style.width = `${(shown * 100).toFixed(1)}%`;
      pct.textContent = `${Math.floor(shown * 100)}%`;
    },
    note(text) { noteEl.textContent = text; },
    close() { el.remove(); },
  };
}

const sleep = (ms: number): Promise<void> => new Promise(r => window.setTimeout(r, ms));

export function backoffMs(attempt: number): number { return Math.min(8000, 600 * 2 ** Math.min(attempt, 5)); }

export interface RetryOptions {
  /** 이 횟수에 도달하면 마지막 오류를 던집니다. 생략하면 성공할 때까지 계속합니다. */
  maxAttempts?: number;
  /** 실패 후 다음 시도를 기다리기 직전에 호출됩니다(attempt 는 지금까지 실패한 횟수). */
  onRetry?: (attempt: number, error: unknown) => void;
  /** 재시도를 멈춰야 하면 true (예: 사용자가 다른 화면으로 나감). 멈추면 마지막 오류를 던집니다. */
  cancelled?: () => boolean;
}

export async function retry<T>(task: (attempt: number) => Promise<T>, opt: RetryOptions = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await task(attempt); }
    catch (e) {
      if ((opt.maxAttempts !== undefined && attempt + 1 >= opt.maxAttempts) || opt.cancelled?.()) throw e;
      opt.onRetry?.(attempt + 1, e);
      await sleep(backoffMs(attempt));
    }
  }
}

/**
 * 한 파일을 받습니다. 일정 시간 아무 데이터도 오지 않으면(연결이 멈춤) 그 지점부터 이어 받고(Range),
 * 이어 받기를 서버가 안 되면 처음부터 다시 받습니다. 연결이 느려도 받은 만큼은 버리지 않습니다.
 * 이어 받아도 진척이 없는 일이 두 번 연속이면 오류를 내어 바깥 retry 가 처리하게 합니다.
 */
export async function fetchBuffer(url: string, onProgress?: (loaded: number, total: number) => void, stallMs = 30000): Promise<ArrayBuffer> {
  let chunks: Uint8Array[] = [], loaded = 0, total = 0, resumable = true, idle = 0;
  let validator: string | null = null; // Strong ETag for conditional byte-range downloads.
  for (;;) {
    const ctl = new AbortController(), before = loaded;
    let timer = window.setTimeout(() => ctl.abort(), stallMs);
    const poke = (): void => { window.clearTimeout(timer); timer = window.setTimeout(() => ctl.abort(), stallMs); };
    try {
      const headers = loaded && resumable
        ? { Range: `bytes=${loaded}-`, ...(validator ? { 'If-Range': validator } : {}) }
        : undefined;
      const res = await fetch(url, { signal: ctl.signal, headers });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      poke();
      if (res.status === 200) {
        // Strong ETags identify exact bytes even when a CDN replaces an asset
        // with a different version of the same length during a slow transfer.
        const etag = res.headers.get('etag');
        validator = etag?.startsWith('"') && etag.endsWith('"') ? etag : null;
      }
      let expectedRangeLength = 0, expectedFullLength = 0;
      if (res.status === 206) {
        // A proxy/CDN can return HTTP 206 for a different byte interval.
        // Appending it would produce a full-size but corrupt GLB/media file.
        // A range is only safe if the server explicitly confirms the exact
        // offset we requested; otherwise retry the whole file without Range.
        const range = /^bytes (\d+)-(\d+)\/(\d+|\*)$/i.exec(res.headers.get('content-range') ?? '');
        // Number(undefined) produces NaN, which the finite-integer guards
        // below reject; this also keeps the types non-nullable.
        const start = Number(range?.[1]), end = Number(range?.[2]);
        const size = range?.[3] === '*' ? Infinity : Number(range?.[3]);
        const newTag = res.headers.get('etag');
        if (validator && newTag && newTag !== validator) {
          resumable = false; chunks = []; loaded = 0;
          throw new TypeError('Resumed asset ETag changed; restarting full download');
        }
        if (!loaded || !range || start !== loaded || !Number.isSafeInteger(start) ||
            !Number.isSafeInteger(end) || end < start || !Number.isSafeInteger(size) ||
            size <= end || (total > 0 && size !== total)) {
          resumable = false; chunks = []; loaded = 0;
          throw new TypeError('Invalid resume Content-Range; restarting full download');
        }
        // Content-Range is authoritative even if Content-Length is absent.
        // Never accept a truncated resumed chunk as a complete asset.
        expectedRangeLength = end - start + 1;
        expectedFullLength = size;
        const declaredLength = Number(res.headers.get('content-length')) || 0;
        if ((declaredLength && declaredLength !== expectedRangeLength) || res.headers.get('content-encoding')) {
          resumable = false; chunks = []; loaded = 0;
          throw new TypeError('Inconsistent resumed response; restarting full download');
        }
      } else if (loaded) { chunks = []; loaded = 0; resumable = false; } // Range ignored: use the complete 200 response
      const rawLength = res.headers.get('content-length');
      const declaredLength = rawLength === null ? 0 : Number(rawLength);
      if (rawLength !== null && (!Number.isSafeInteger(declaredLength) || declaredLength < 0)) {
        resumable = false; chunks = []; loaded = 0;
        throw new TypeError('Invalid Content-Length; restarting full download');
      }
      const len = declaredLength || expectedRangeLength;
      const encoded = !!res.headers.get('content-encoding');
      if (encoded) resumable = false; // 브라우저 스트림은 압축 해제된 바이트를 전달하므로 Range 와 원본 길이를 신뢰할 수 없습니다
      // The wire Content-Length of gzip/br responses is not the number of
      // decoded bytes returned by fetch(). Never compare those two lengths.
      // For uncompressed ranges, Content-Range gives the full object size.
      total = encoded ? 0 : expectedFullLength || (len ? loaded + len : 0);
      if (!res.body) { const b = new Uint8Array(await res.arrayBuffer()); chunks.push(b); loaded += b.byteLength; onProgress?.(loaded, loaded); }
      else {
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value); loaded += value.byteLength; poke(); onProgress?.(loaded, total);
        }
      }
      if (total && loaded > total) {
        resumable = false; chunks = []; loaded = 0;
        throw new TypeError(`oversized response for ${url}`);
      }
      if (total && loaded < total) throw new Error(`short ${loaded}/${total} ${url}`);
      const out = new Uint8Array(loaded);
      let o = 0; for (const c of chunks) { out.set(c, o); o += c.byteLength; }
      onProgress?.(loaded, loaded);
      return out.buffer;
    } catch (e) {
      if (loaded > before && resumable) { idle = 0; continue; }       // 조금이라도 받았으면 이어서
      if (!resumable) { chunks = []; loaded = 0; }
      if (++idle >= 2 || ctl.signal.aborted === false && !(e instanceof TypeError)) throw e;
    } finally { window.clearTimeout(timer); }
  }
}

/** 재시도 안내 문구: 처음엔 조용히, 반복되면 상황을 알려 줍니다. */
export function retryNote(attempt: number): string {
  return attempt < 2 ? '' : `연결이 느립니다. 계속 시도하는 중입니다 (${attempt}회)`;
}

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
      if (fraction === null) { bar.classList.add('busy'); pct.textContent = ''; return; }
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

/** 한 번 받기. 일정 시간 아무 데이터도 오지 않으면(연결이 멈춤) 중단하고 오류를 냅니다. */
export async function fetchBuffer(url: string, onProgress?: (loaded: number, total: number) => void, stallMs = 20000): Promise<ArrayBuffer> {
  const ctl = new AbortController();
  let timer = window.setTimeout(() => ctl.abort(), stallMs);
  const poke = (): void => { window.clearTimeout(timer); timer = window.setTimeout(() => ctl.abort(), stallMs); };
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    poke();
    const total = Number(res.headers.get('content-length')) || 0;
    if (!res.body) { const b = await res.arrayBuffer(); onProgress?.(b.byteLength, b.byteLength); return b; }
    const reader = res.body.getReader(), chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); loaded += value.byteLength; poke(); onProgress?.(loaded, total);
    }
    const out = new Uint8Array(loaded);
    let o = 0; for (const c of chunks) { out.set(c, o); o += c.byteLength; }
    onProgress?.(loaded, loaded);
    return out.buffer;
  } finally { window.clearTimeout(timer); }
}

/** 재시도 안내 문구: 처음엔 조용히, 반복되면 상황을 알려 줍니다. */
export function retryNote(attempt: number): string {
  return attempt < 2 ? '' : `연결이 느립니다. 계속 시도하는 중입니다 (${attempt}회)`;
}

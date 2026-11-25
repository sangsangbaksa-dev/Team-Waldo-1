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

/** 로딩이 길어질 때 나타나는 "처음 화면으로" 버튼이 나타나기까지의 시간(ms). 기다리는 쪽을 가두지 않으려는 출구입니다. */
const ESCAPE_AFTER_MS = 8000;

/**
 * 로딩 화면. 오래 걸려도 계속 기다리되, `onEscape` 를 주면 일정 시간이 지난 뒤(또는 재시도 안내가 뜨면)
 * "처음 화면으로" 버튼을 보여 줘서 사용자가 언제든 빠져나올 수 있게 합니다.
 */
export function showLoading(title: string, onEscape?: () => void): LoadingScreen {
  document.querySelector('.ld-screen')?.remove();
  const el = document.createElement('div');
  el.className = 'ld-screen';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = `<div class="ld-box"><div class="ld-kicker">WALDO</div><h2 class="ld-title"></h2><div class="ld-bar"><i></i></div><div class="ld-row"><span class="ld-label">불러오는 중</span><span class="ld-pct"></span></div><p class="ld-note"></p><button type="button" class="ld-escape" hidden>처음 화면으로</button></div>`;
  el.querySelector('.ld-title')!.textContent = title;
  document.body.append(el);
  const bar = el.querySelector<HTMLElement>('.ld-bar')!, fill = el.querySelector<HTMLElement>('.ld-bar i')!;
  const label = el.querySelector<HTMLElement>('.ld-label')!, pct = el.querySelector<HTMLElement>('.ld-pct')!, noteEl = el.querySelector<HTMLElement>('.ld-note')!;
  const escapeBtn = el.querySelector<HTMLButtonElement>('.ld-escape')!;
  let shown = 0, escapeTimer = 0;
  const showEscape = (): void => { if (onEscape) escapeBtn.hidden = false; };
  if (onEscape) {
    escapeBtn.onclick = onEscape;
    escapeTimer = window.setTimeout(showEscape, ESCAPE_AFTER_MS);
  }
  return {
    progress(fraction, text) {
      if (text) label.textContent = text;
      if (fraction === null) { bar.classList.add('busy'); pct.textContent = ''; return; }
      bar.classList.remove('busy');
      shown = Math.max(shown, Math.min(1, Math.max(0, fraction))); // 재시도로 되돌아가도 막대는 뒤로 가지 않습니다
      fill.style.width = `${(shown * 100).toFixed(1)}%`;
      pct.textContent = `${Math.floor(shown * 100)}%`;
    },
    note(text) { noteEl.textContent = text; if (text) showEscape(); },
    close() { window.clearTimeout(escapeTimer); el.remove(); },
  };
}

/** ms 만큼 쉬되, 인터넷이 다시 연결되면(online) 바로 깨어나 다시 시도합니다. */
const sleep = (ms: number): Promise<void> => new Promise(resolve => {
  const done = (): void => { window.clearTimeout(timer); window.removeEventListener('online', done); resolve(); };
  const timer = window.setTimeout(done, ms);
  window.addEventListener('online', done);
});

export function backoffMs(attempt: number): number { return Math.min(8000, 600 * 2 ** Math.min(attempt, 5)); }

export interface RetryOptions {
  /** 이 횟수에 도달하면 마지막 오류를 던집니다. 생략하면 성공할 때까지 계속합니다. */
  maxAttempts?: number;
  /** 실패 후 다음 시도를 기다리기 직전에 호출됩니다(attempt 는 지금까지 실패한 횟수). */
  onRetry?: (attempt: number, error: unknown) => void;
  /** 재시도를 멈춰야 하면 true (예: 사용자가 다른 화면으로 나감). 멈추면 마지막 오류를 던집니다. */
  cancelled?: () => boolean;
  /** false 를 돌려주면 그 오류는 다시 시도해도 소용없다고 보고 바로 던집니다(예: 코드 오류). 생략하면 모두 재시도합니다. */
  retryable?: (error: unknown) => boolean;
}

export async function retry<T>(task: (attempt: number) => Promise<T>, opt: RetryOptions = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await task(attempt); }
    catch (e) {
      if ((opt.maxAttempts !== undefined && attempt + 1 >= opt.maxAttempts) || opt.cancelled?.() || opt.retryable?.(e) === false) throw e;
      opt.onRetry?.(attempt + 1, e);
      await sleep(backoffMs(attempt));
      if (opt.cancelled?.()) throw e;
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
  for (;;) {
    const ctl = new AbortController(), before = loaded;
    let timer = window.setTimeout(() => ctl.abort(), stallMs);
    const poke = (): void => { window.clearTimeout(timer); timer = window.setTimeout(() => ctl.abort(), stallMs); };
    try {
      const res = await fetch(url, { signal: ctl.signal, headers: loaded && resumable ? { Range: `bytes=${loaded}-` } : undefined });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      poke();
      if (loaded && res.status !== 206) { chunks = []; loaded = 0; resumable = false; } // 이어 받기를 안 받아 주면 처음부터
      const len = Number(res.headers.get('content-length')) || 0;
      if (res.headers.get('content-encoding')) resumable = false; // 압축 전송은 바이트 위치가 안 맞아 이어 받을 수 없습니다
      total = len ? loaded + len : 0;
      if (!res.body) { const b = new Uint8Array(await res.arrayBuffer()); chunks.push(b); loaded += b.byteLength; onProgress?.(loaded, loaded); }
      else {
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value); loaded += value.byteLength; poke(); onProgress?.(loaded, total);
        }
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

/** 게임 파일(청크)을 받다 생긴 오류인지: 네트워크 끊김·새 배포로 사라진 옛 파일 등. 이런 오류만 계속 다시 시도합니다. */
export function isFetchError(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /dynamically imported module|importing a module script|module script failed|Failed to fetch|NetworkError|Load failed|Unable to preload|ChunkLoadError|HTTP \d{3}/i.test(m);
}

const RELOAD_KEY = 'waldo.chunkReload';

/**
 * 새 버전이 배포되면 열어 둔 탭이 가리키는 옛 파일 이름이 사라집니다. 브라우저는 한 번 실패한 모듈 주소를 기억해
 * 다시 import 해도 계속 실패하므로, 인터넷이 되는 걸 확인한 뒤 페이지를 새로 엽니다(주소의 #/게임 이 다시 열어 줍니다).
 * 무한 새로고침을 막으려고 간격을 점점 늘립니다(10초 → 20초 → … 최대 2분).
 */
export async function reloadIfStale(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  let count = 0, last = 0;
  try { const saved = JSON.parse(sessionStorage.getItem(RELOAD_KEY) ?? 'null') as { t?: number; n?: number } | null; count = saved?.n ?? 0; last = saved?.t ?? 0; } catch { /* 저장소를 못 쓰면 새로고침하지 않습니다 */ return false; }
  if (Date.now() - last < Math.min(120_000, 10_000 * 2 ** Math.min(count, 4))) return false;
  try {
    const res = await fetch(`${location.pathname}${location.search}`, { cache: 'no-store' });
    if (!res.ok) return false;
    sessionStorage.setItem(RELOAD_KEY, JSON.stringify({ t: Date.now(), n: count + 1 }));
  } catch { return false; }
  location.reload();
  return true;
}

/** 게임이 정상적으로 열렸을 때 새로고침 기록을 지웁니다. */
export function clearReloadGuard(): void { try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* 선택 사항 */ } }

export interface LoadModuleOptions {
  cancelled?: () => boolean;
  /** 재시도 안내 문구(빈 문자열이면 조용히). */
  onNote?: (text: string) => void;
}

/**
 * `import()` 로 게임·화면 코드를 받습니다. 연결이 느리거나 끊겨도 포기하지 않고 계속 다시 시도하며,
 * 두 번 넘게 실패하면 새 배포로 파일이 바뀐 경우를 위해 한 번 페이지를 새로 엽니다.
 * 파일은 받았는데 코드 자체가 오류를 내는 경우(네트워크와 무관)에만 바로 오류를 냅니다.
 */
export function loadModule<T>(load: () => Promise<T>, opt: LoadModuleOptions = {}): Promise<T> {
  return retry(load, {
    cancelled: opt.cancelled,
    retryable: e => isFetchError(e),
    onRetry: n => { opt.onNote?.(retryNote(n)); if (n >= 2) void reloadIfStale(); },
  });
}

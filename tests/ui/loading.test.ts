// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLoadSession } from '../../src/loading/application/session';
import { decideRetry } from '../../src/loading/domain/policy';
import { backoffMs, fetchBuffer, retry, retryModuleUrl, showLoading } from '../../src/loading';

afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

describe('로딩 화면', () => {
  it('진행률을 표시하고 뒤로 가지 않으며 닫으면 100% 뒤에 사라진다', () => {
    vi.useFakeTimers();
    const ld = showLoading('LAST CITY');
    ld.progress(0.4);
    expect(document.querySelector('.ld-pct')!.textContent).toBe('40%');
    expect(document.querySelector('.ld-bar')?.getAttribute('role')).toBe('progressbar');
    ld.progress(0.1);
    expect(document.querySelector('.ld-pct')!.textContent).toBe('40%');
    expect(document.querySelector<HTMLElement>('.ld-bar i')!.style.width).toBe('40.0%');
    ld.progress(null);
    expect(document.querySelector('.ld-bar')!.classList.contains('busy')).toBe(true);
    expect(document.querySelector('.ld-pct')!.textContent).toBe('40%');
    ld.note('응답을 기다리는 중');
    expect(document.querySelector('.ld-note')!.textContent).toBe('응답을 기다리는 중');
    expect(document.body.textContent).not.toMatch(/연결이 안|불러오지 못/);
    vi.advanceTimersByTime(5000);
    expect(document.querySelector('.ld-screen')).not.toBeNull();
    expect(Number.parseInt(document.querySelector('.ld-pct')!.textContent ?? '0', 10)).toBeGreaterThanOrEqual(40);
    ld.close();
    expect(document.querySelector('.ld-pct')!.textContent).toBe('100%');
    vi.advanceTimersByTime(500);
    expect(document.querySelector('.ld-screen')).toBeNull();
  });
  it('이미 있는 로딩 화면을 겹쳐 만들지 않는다', () => {
    showLoading('A'); showLoading('B');
    expect(document.querySelectorAll('.ld-screen').length).toBe(1);
    expect(document.querySelector('.ld-title')!.textContent).toBe('B');
  });
});

describe('로딩 세션', () => {
  it('측정 전에는 조금 움직이고, 시간 초과에도 실패로 바꾸거나 되돌리지 않는다', () => {
    const waiting = createLoadSession();
    for (let i = 0; i < 80; i++) waiting.tick(i * 1000);
    expect(waiting.snapshot().phase).toBe('loading');
    expect(waiting.snapshot().fraction).toBeGreaterThan(0.2);
    expect(waiting.snapshot().fraction).toBeLessThanOrEqual(0.35);

    const session = createLoadSession('모델을 받는 중');
    session.report(0.46, '모델을 받는 중', 0);
    for (let t = 0; t < 30; t++) session.tick(10_000 + t * 1000);
    const stalled = session.snapshot();
    expect(stalled.phase).toBe('loading');
    expect(stalled.fraction).toBeGreaterThanOrEqual(0.46);
    expect(stalled.fraction).toBeLessThan(1);
    session.report(0.1, undefined, 50_000);
    expect(session.snapshot().fraction).toBeGreaterThanOrEqual(stalled.fraction);
    expect(decideRetry({ attempt: 12, cancelled: false, definitive: false })).toBe('continue');
    session.complete();
    expect(session.snapshot()).toMatchObject({ phase: 'ready', fraction: 1, percent: 100 });
  });
});

describe('retry', () => {
  it('실패해도 성공할 때까지 계속 다시 시도한다', async () => {
    vi.useFakeTimers();
    let n = 0; const seen: number[] = [];
    const p = retry(async () => { if (++n < 6) throw new Error('net'); return 'ok'; }, { onRetry: a => seen.push(a) });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe('ok');
    expect(n).toBe(6); expect(seen).toEqual([1, 2, 3, 4, 5]);
  });
  it('maxAttempts 가 있으면 마지막 오류를 던지고, cancelled 면 멈춘다', async () => {
    vi.useFakeTimers();
    const a = retry(async () => { throw new Error('x'); }, { maxAttempts: 3 });
    const assertion = expect(a).rejects.toThrow('x');
    await vi.runAllTimersAsync(); await assertion;
    const b = retry(async () => { throw new Error('y'); }, { cancelled: () => true });
    await expect(b).rejects.toThrow('y');
  });
  it('연결 지연은 횟수와 상관없이 이어 가고, 없는 파일은 멈춘다', () => {
    expect(decideRetry({ attempt: 40, cancelled: false, definitive: false })).toBe('continue');
    expect(decideRetry({ attempt: 1, cancelled: false, definitive: true })).toBe('stop');
    expect(decideRetry({ attempt: 3, cancelled: false, definitive: false, maxAttempts: 3 })).toBe('stop');
  });
  it('대기 시간은 늘어나다 8초에서 멈춘다', () => {
    expect(backoffMs(0)).toBeLessThan(backoffMs(2)); expect(backoffMs(20)).toBe(8000);
  });
  it('실패한 모듈 주소는 다시 요청할 때만 쿼리를 붙인다', () => {
    const message = 'Failed to fetch dynamically imported module: http://127.0.0.1:5173/src/sky/game.ts';
    expect(retryModuleUrl(message, 0)).toBeNull();
    expect(retryModuleUrl(message, 2)).toBe('http://127.0.0.1:5173/src/sky/game.ts?waldo-retry=2');
    expect(retryModuleUrl('syntax error', 1)).toBeNull();
  });
});

describe('fetchBuffer', () => {
  it('멈춘 뒤 다시 받아도 진행 콜백이 줄어들지 않는다', async () => {
    const samples: number[] = [];
    let calls = 0;
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      calls += 1;
      if (calls === 1) {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(1000));
            init?.signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')));
          },
        });
        return new Response(stream, { status: 200, headers: { 'content-length': '5000' } });
      }
      const bytes = new Uint8Array(5000);
      return new Response(bytes, { status: 200, headers: { 'content-length': '5000' } });
    });
    const buf = await fetchBuffer('/models/characters.glb', n => samples.push(n), 20);
    expect(buf.byteLength).toBe(5000);
    expect(samples.length).toBeGreaterThan(1);
    for (let i = 1; i < samples.length; i++) expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]!);
    expect(samples.at(-1)).toBe(5000);
    vi.unstubAllGlobals();
  });
});

// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { backoffMs, isFetchError, loadModule, retry, showLoading } from '../../src/loading';

afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

describe('로딩 화면', () => {
  it('진행률을 표시하고 뒤로 가지 않으며 닫으면 사라진다', () => {
    const ld = showLoading('LAST CITY');
    ld.progress(0.4);
    expect(document.querySelector('.ld-pct')!.textContent).toBe('40%');
    ld.progress(0.1);
    expect(document.querySelector('.ld-pct')!.textContent).toBe('40%');
    ld.progress(null);
    expect(document.querySelector('.ld-bar')!.classList.contains('busy')).toBe(true);
    ld.note('연결이 느립니다');
    expect(document.querySelector('.ld-note')!.textContent).toBe('연결이 느립니다');
    ld.close();
    expect(document.querySelector('.ld-screen')).toBeNull();
  });
  it('이미 있는 로딩 화면을 겹쳐 만들지 않는다', () => {
    showLoading('A'); showLoading('B');
    expect(document.querySelectorAll('.ld-screen').length).toBe(1);
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
  it('대기 시간은 늘어나다 8초에서 멈춘다', () => {
    expect(backoffMs(0)).toBeLessThan(backoffMs(2)); expect(backoffMs(20)).toBe(8000);
  });
});

describe('처음 화면으로 버튼', () => {
  it('onEscape 가 있으면 8초 뒤 또는 재시도 안내가 뜰 때 나타나고, 눌러 빠져나간다', () => {
    vi.useFakeTimers();
    const out = vi.fn();
    const ld = showLoading('A', out);
    const btn = document.querySelector<HTMLButtonElement>('.ld-escape')!;
    expect(btn.hidden).toBe(true);
    vi.advanceTimersByTime(8100);
    expect(btn.hidden).toBe(false);
    btn.click(); expect(out).toHaveBeenCalledTimes(1);
    ld.close();
    const b = showLoading('B', out); b.note('연결이 느립니다');
    expect(document.querySelector<HTMLButtonElement>('.ld-escape')!.hidden).toBe(false);
  });
  it('onEscape 가 없으면 버튼이 나타나지 않는다', () => {
    vi.useFakeTimers();
    showLoading('A').note('x'); vi.advanceTimersByTime(20000);
    expect(document.querySelector<HTMLButtonElement>('.ld-escape')!.hidden).toBe(true);
  });
});

describe('loadModule', () => {
  it('네트워크 오류는 횟수 제한 없이 성공할 때까지 계속 다시 시도한다', async () => {
    vi.useFakeTimers();
    let n = 0;
    const p = loadModule(async () => { if (++n < 12) throw new TypeError('Failed to fetch dynamically imported module: /a.js'); return 'ok'; });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe('ok'); expect(n).toBe(12);
  });
  it('코드 자체의 오류(네트워크와 무관)는 바로 던진다', async () => {
    let n = 0;
    await expect(loadModule(async () => { n++; throw new Error('boom'); })).rejects.toThrow('boom');
    expect(n).toBe(1);
  });
  it('연결 오류 문구를 알아본다', () => {
    for (const m of ['Failed to fetch dynamically imported module: x', 'error loading dynamically imported module', 'Importing a module script failed.', 'HTTP 404 /a.glb']) expect(isFetchError(new TypeError(m))).toBe(true);
    expect(isFetchError(new Error('x is not a function'))).toBe(false);
  });
});

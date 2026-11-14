// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { backoffMs, retry, showLoading } from '../../src/loading';

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

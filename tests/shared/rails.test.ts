// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RailInfo } from '../../src/shared/rails';

const details: RailInfo = {
  name: 'WALDO', genre: '모험', summary: '진입 전 확인할 게임 설명',
  facts: ['저장', '키보드 · 터치'], image: '/assets/test.jpg',
  imageAlt: '미리보기', status: '3판 · 2승',
};
class MockResizeObserver {
  static observers: MockResizeObserver[] = [];
  readonly targets = new Set<Element>();
  constructor(private callback: ResizeObserverCallback) { MockResizeObserver.observers.push(this); }
  observe(el: Element): void { this.targets.add(el); }
  unobserve(el: Element): void { this.targets.delete(el); }
  disconnect(): void { this.targets.clear(); }
  fire(target: Element): void {
    this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
}
let rails: typeof import('../../src/shared/rails');
const screen = (name = 'wd-screen'): HTMLElement => {
  const el = document.createElement('section');
  el.className = name;
  el.innerHTML = '<div class="wd-panel"><h2>시작 화면</h2></div>';
  document.body.append(el);
  return el;
};
beforeEach(async () => {
  vi.resetModules();
  MockResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  document.body.replaceChildren();
  rails = await import('../../src/shared/rails');
});
afterEach(() => {
  rails.setRails(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('WALDO shared side rails', () => {
  it('decorates each screen only once, with descriptive, lazy-loaded images', () => {
    const s = screen();
    rails.setRails(details);
    expect(s.querySelectorAll(':scope > .wd-rail')).toHaveLength(2);
    expect(s.querySelector('.wd-card-big')?.textContent).toContain('3판');
    expect(s.querySelector('.wd-art img')?.getAttribute('loading')).toBe('lazy');
    s.querySelector('.wd-panel')?.append(document.createElement('button'));
    return Promise.resolve().then(() => {
      expect(s.querySelectorAll(':scope > .wd-rail')).toHaveLength(2);
    });
  });

  it('notices new dialogs and avoids scanning the document for unrelated HUD changes', async () => {
    rails.setRails(details);
    const hud = document.createElement('section');
    document.body.append(hud);
    const query = vi.spyOn(document, 'querySelectorAll');
    for (let i = 0; i < 30; i++) hud.append(document.createElement('span'));
    await Promise.resolve();
    expect(query).not.toHaveBeenCalled();
    query.mockRestore();
    const modal = screen('c-modal');
    await vi.waitFor(() => expect(modal.querySelectorAll(':scope > .wd-rail')).toHaveLength(2));
  });

  it('unobserves detached screens and removes rails on return to the hub', async () => {
    const old = screen();
    rails.setRails(details);
    const obs = MockResizeObserver.observers[0];
    expect(obs?.targets.has(old)).toBe(true);
    old.remove();
    await vi.waitFor(() => expect(obs?.targets.has(old)).toBe(false));
    const current = screen();
    await vi.waitFor(() => expect(current.querySelectorAll(':scope > .wd-rail')).toHaveLength(2));
    rails.setRails(null);
    expect(current.querySelectorAll(':scope > .wd-rail')).toHaveLength(0);
    expect(current.classList.contains('wd-has-rails')).toBe(false);
    expect(obs?.targets.size).toBe(0);
  });

  it('removes stale decoration when the active panel is replaced or removed', async () => {
    const s = screen();
    rails.setRails(details);
    s.querySelector('.wd-panel')?.remove();
    await vi.waitFor(() => expect(s.querySelectorAll(':scope > .wd-rail')).toHaveLength(0));
    expect(s.classList.contains('wd-has-rails')).toBe(false);
    const next = document.createElement('article');
    next.className = 'wd-panel';
    s.append(next);
    await vi.waitFor(() => expect(s.querySelectorAll(':scope > .wd-rail')).toHaveLength(2));
  });

  it('shows a centered panel when the viewport cannot fit 260px rails', () => {
    const s = screen(), p = s.querySelector('.wd-panel')!;
    let viewport = 800;
    Object.defineProperty(s, 'clientWidth', { configurable: true, get: () => viewport });
    Object.defineProperty(p, 'offsetWidth', { configurable: true, get: () => 460 });
    rails.setRails(details);
    expect(s.classList.contains('wd-rails-off')).toBe(true);
    viewport = 1600;
    MockResizeObserver.observers[0]?.fire(p);
    expect(s.classList.contains('wd-rails-off')).toBe(false);
  });

  it('keeps the arcade working in browsers without ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const s = screen();
    expect(() => rails.setRails(details)).not.toThrow();
    expect(s.querySelectorAll(':scope > .wd-rail')).toHaveLength(2);
    window.dispatchEvent(new Event('resize'));
  });

  it('escapes status, labels and images rather than inserting arbitrary HTML', () => {
    const s = screen();
    rails.setRails({ ...details, name: '<script>bad</script>', status: '<img src=x onerror=alert(1)>' });
    expect(s.querySelector('script')).toBeNull();
    expect(s.querySelectorAll('img')).toHaveLength(1);
    expect(s.querySelector('.wd-art figcaption b')?.textContent).toContain('<script>');
  });
});

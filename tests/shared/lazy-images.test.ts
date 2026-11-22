// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { deferTileImages } from '../../src/shared/lazy-images';

class Observer {
  static last: Observer | null = null;
  targets = new Set<Element>();
  disconnected = false;
  constructor(private readonly callback: IntersectionObserverCallback, readonly options?: IntersectionObserverInit) {
    Observer.last = this;
  }
  observe(el: Element): void { this.targets.add(el); }
  unobserve(el: Element): void { this.targets.delete(el); }
  disconnect(): void { this.targets.clear(); this.disconnected = true; }
  show(el: Element, intersecting = true): void {
    this.callback([{ target: el, isIntersecting: intersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}
const add = (): HTMLDivElement => {
  const root = document.createElement('div');
  root.innerHTML = '<img src="/first.svg"><img data-deferred-src="/near.jpg"><img data-deferred-src="/later.jpg">';
  document.body.append(root);
  return root;
};
beforeEach(() => { vi.stubGlobal('IntersectionObserver', Observer); Observer.last = null; document.body.replaceChildren(); });
afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });

describe('lazy homepage thumbnails', () => {
  it('preserves the eager first image and defers distant images', () => {
    const root = add(), stop = deferTileImages(root);
    const images = root.querySelectorAll('img');
    expect(images[0].getAttribute('src')).toBe('/first.svg');
    expect(images[1].hasAttribute('src')).toBe(false);
    expect(images[2].hasAttribute('src')).toBe(false);
    expect(Observer.last?.options?.rootMargin).toBe('320px 0px');
    Observer.last!.show(images[1]);
    expect(images[1].getAttribute('src')).toBe('/near.jpg');
    expect(images[2].hasAttribute('src')).toBe(false);
    expect(Observer.last?.targets.has(images[1])).toBe(false);
    stop();
  });
  it('does not download non-intersecting thumbnails', () => {
    const root = add(); deferTileImages(root);
    const image = root.querySelectorAll('img')[1];
    Observer.last!.show(image, false);
    expect(image.hasAttribute('src')).toBe(false);
  });
  it('disconnects its observer on menu exit', () => {
    const root = add(), stop = deferTileImages(root);
    stop();
    expect(Observer.last?.disconnected).toBe(true);
    expect(Observer.last?.targets.size).toBe(0);
  });
  it('has an immediate-load fallback when IntersectionObserver is missing', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const root = add();
    expect(() => deferTileImages(root)()).not.toThrow();
    expect(root.querySelectorAll('img')[2].getAttribute('src')).toBe('/later.jpg');
  });
  it('does nothing without pending images', () => {
    const root = document.createElement('div');
    expect(() => deferTileImages(root)()).not.toThrow();
    expect(Observer.last).toBeNull();
  });
});

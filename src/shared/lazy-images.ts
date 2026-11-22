/**
 * Do not issue requests for large home thumbnails until they approach the viewport.
 * The first (LCP) tile keeps its ordinary eager src. Safe fallback for older browsers.
 */
export function deferTileImages(root: ParentNode, margin = '320px 0px'): () => void {
  const images = Array.from(root.querySelectorAll<HTMLImageElement>('img[data-deferred-src]'));
  if (!images.length) return () => undefined;
  const load = (img: HTMLImageElement): void => {
    const src = img.dataset.deferredSrc;
    if (!src) return;
    delete img.dataset.deferredSrc;
    img.src = src;
  };
  if (typeof IntersectionObserver === 'undefined') {
    images.forEach(load);
    return () => undefined;
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const img = entry.target as HTMLImageElement;
      observer.unobserve(img);
      load(img);
    }
  }, { rootMargin: margin, threshold: 0 });
  for (const img of images) observer.observe(img);
  return (): void => observer.disconnect();
}

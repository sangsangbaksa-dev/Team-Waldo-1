// 넓은 화면의 게임 시작·일시정지·결과 화면에 붙는 공통 정보 패널.
// Observer lifetime is scoped to a launched game; regular HUD changes never trigger a full document scan.
export interface RailInfo { name: string; genre: string; summary: string; facts: string[]; image: string; imageAlt: string; status: string }

const SCREEN = '.wd-screen, .c-modal';
const PANEL = ':scope > .wd-panel';
const esc = (s: string): string => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
let info: RailInfo | null = null;
let mutations: MutationObserver | null = null;
let sizes: ResizeObserver | null = null;
const observed = new Map<HTMLElement, HTMLElement>();

function left(i: RailInfo): string {
  return `<aside class="wd-rail wd-rail-l" aria-hidden="true">
    <figure class="wd-art"><img src="${esc(i.image)}" alt="${esc(i.imageAlt)}" width="660" height="825" loading="lazy" decoding="async" fetchpriority="low"><figcaption><span>${esc(i.genre)}</span><b>${esc(i.name)}</b></figcaption></figure>
    <p class="wd-rail-note">${esc(i.summary)}</p></aside>`;
}
function right(i: RailInfo): string {
  const record = i.status || '아직 기록이 없어요. 첫 판을 시작해 보세요.';
  return `<aside class="wd-rail wd-rail-r" aria-hidden="true">
    <div class="wd-card"><h3 class="wd-label">한눈에 보기</h3><ul>${i.facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>
    <div class="wd-card"><h3 class="wd-label">내 기록</h3><p class="wd-card-big">${esc(record)}</p></div></aside>`;
}

const px = (v: string): number => Number.parseFloat(v) || 0;
function fit(screen: HTMLElement): void {
  const panel = observed.get(screen);
  if (!panel || !screen.isConnected || !panel.isConnected || screen.clientWidth === 0) return;
  const style = getComputedStyle(screen);
  const gap = px(style.columnGap);
  const padding = px(style.paddingLeft) + px(style.paddingRight);
  const panelWidth = panel.getBoundingClientRect().width || panel.offsetWidth;
  // Each side needs enough space for readable text rather than a sliver of a card.
  const minimum = panelWidth + 2 * (260 + gap) + padding;
  screen.classList.toggle('wd-rails-off', screen.clientWidth < minimum);
}
function fitAll(): void { for (const screen of observed.keys()) fit(screen); }

function resizeObserver(): ResizeObserver | null {
  if (!sizes && typeof ResizeObserver !== 'undefined') {
    sizes = new ResizeObserver(entries => {
      const screens = new Set<HTMLElement>();
      for (const entry of entries) {
        if (!(entry.target instanceof HTMLElement)) continue;
        const screen = observed.has(entry.target) ? entry.target : entry.target.closest<HTMLElement>(SCREEN);
        if (screen && observed.has(screen)) screens.add(screen);
      }
      screens.forEach(fit);
    });
  }
  return sizes;
}
function prune(): void {
  for (const [screen, panel] of observed) {
    if (screen.isConnected && screen.querySelector(PANEL) === panel && screen.dataset.noRails === undefined) continue;
    sizes?.unobserve(screen);
    sizes?.unobserve(panel);
    observed.delete(screen);
    if (screen.isConnected) {
      screen.querySelectorAll(':scope > .wd-rail').forEach(rail => rail.remove());
      screen.classList.remove('wd-has-rails', 'wd-rails-off');
    }
  }
}
function decorate(): void {
  if (!info) return;
  prune();
  for (const screen of document.querySelectorAll<HTMLElement>(SCREEN)) {
    const panel = screen.querySelector<HTMLElement>(PANEL);
    if (!panel || screen.dataset.noRails !== undefined) continue;
    const old = observed.get(screen);
    if (old === panel && screen.querySelector(':scope > .wd-rail-l') && screen.querySelector(':scope > .wd-rail-r')) continue;
    if (old && old !== panel) sizes?.unobserve(old);
    screen.querySelectorAll(':scope > .wd-rail').forEach(rail => rail.remove());
    screen.insertAdjacentHTML('afterbegin', left(info));
    screen.insertAdjacentHTML('beforeend', right(info));
    screen.classList.add('wd-has-rails');
    observed.set(screen, panel);
    const observer = resizeObserver();
    observer?.observe(screen);
    observer?.observe(panel);
    fit(screen);
  }
}
function relevant(node: Node): boolean {
  if (!(node instanceof Element)) return false;
  return node.matches(SCREEN) || node.matches('.wd-panel') || !!node.querySelector(`${SCREEN}, .wd-panel`);
}
function onMutations(records: MutationRecord[]): void {
  // Ignore the thousands of text/HUD updates produced by a running 3D game.
  const changed = records.some(record =>
    Array.from(record.addedNodes).some(relevant) || Array.from(record.removedNodes).some(relevant));
  if (changed) decorate();
}
function stop(): void {
  mutations?.disconnect();
  sizes?.disconnect();
  window.removeEventListener('resize', fitAll);
  for (const screen of observed.keys()) {
    screen.querySelectorAll(':scope > .wd-rail').forEach(rail => rail.remove());
    screen.classList.remove('wd-has-rails', 'wd-rails-off');
  }
  observed.clear();
}

/** 게임 진입 시 정보를 설정하고 메뉴 복귀 시 DOM·resize 구독을 함께 정리합니다. */
export function setRails(next: RailInfo | null): void {
  stop();
  info = next;
  if (!next) return;
  decorate();
  if (typeof MutationObserver !== 'undefined') {
    mutations ??= new MutationObserver(onMutations);
    mutations.observe(document.body, { childList: true, subtree: true });
  }
  window.addEventListener('resize', fitAll, { passive: true });
}

// 넓은 화면에서 메뉴 카드 양옆을 채우는 좌우 정보 패널입니다.
// 게임이 열려 있는 동안 .wd-panel 을 가진 .wd-screen(시작·일시정지·결과 화면)에 자동으로 붙고, 전투·플레이 화면에는 붙지 않습니다.
export interface RailInfo { name: string; genre: string; summary: string; facts: string[]; image: string; imageAlt: string; status: string }

let info: RailInfo | null = null;
const esc = (s: string): string => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

function left(i: RailInfo): string {
  return `<aside class="wd-rail wd-rail-l" aria-hidden="true">
    <figure class="wd-art"><img src="${esc(i.image)}" alt="${esc(i.imageAlt)}" decoding="async"><figcaption><span>${esc(i.genre)}</span><b>${esc(i.name)}</b></figcaption></figure>
    <p class="wd-rail-note">${esc(i.summary)}</p></aside>`;
}

function right(i: RailInfo): string {
  const record = i.status || '아직 기록이 없어요. 첫 판을 시작해 보세요.';
  return `<aside class="wd-rail wd-rail-r" aria-hidden="true">
    <div class="wd-card"><h3 class="wd-label">한눈에 보기</h3><ul>${i.facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>
    <div class="wd-card"><h3 class="wd-label">내 기록</h3><p class="wd-card-big">${esc(record)}</p></div></aside>`;
}

function decorate(): void {
  if (!info) return;
  document.querySelectorAll<HTMLElement>('.wd-screen, .c-modal').forEach(s => {
    if (s.dataset.noRails !== undefined || s.querySelector(':scope > .wd-rail') || !s.querySelector(':scope > .wd-panel')) return;
    s.classList.add('wd-has-rails');
    s.insertAdjacentHTML('afterbegin', left(info!));
    s.insertAdjacentHTML('beforeend', right(info!));
    sizer.observe(s); const panel = s.querySelector<HTMLElement>(':scope > :not(.wd-rail)'); if (panel) sizer.observe(panel); fit(s);
  });
}

/** 카드가 넓어 양옆 자리가 부족하면(패널 폭 + 양쪽 260px + 간격) 좌우 패널을 숨깁니다. */
function fit(s: HTMLElement): void {
  const panel = s.querySelector<HTMLElement>(':scope > :not(.wd-rail)'); if (!panel) return;
  s.classList.toggle('wd-rails-off', s.clientWidth > 0 && s.clientWidth < panel.offsetWidth + 2 * (260 + 56));
}
const fitAll = (): void => document.querySelectorAll<HTMLElement>('.wd-has-rails').forEach(fit);
const sizer = new ResizeObserver(fitAll);

const observer = new MutationObserver(decorate);

/** 게임을 열 때 정보를 넘기고, 게임 목록으로 돌아오면 null 로 끕니다. */
export function setRails(next: RailInfo | null): void {
  info = next; observer.disconnect(); sizer.disconnect();
  if (!next) return;
  observer.observe(document.body, { childList: true, subtree: true });
  decorate();
}

import './style.css';
import { retireUpgradeSaves } from './shared/retire-upgrades';
import { readPreferences, writePreferences } from './prefs';
import { showLoading, retry, retryNote } from './loading';
import { ENTRIES, type Entry } from './game-catalog';
import { dailyChallenge } from './daily-challenge';
import { CHAT_ENABLED, PVP_ENABLED } from './net/config';

import { gameLoaders, type GameId } from './game-launchers';

const base = import.meta.env.BASE_URL;

retireUpgradeSaves();
const app = document.querySelector<HTMLDivElement>('#game')!;
let generation = 0;
let launching = false;
let unsubscribeAccount: (() => void) | undefined;
/** 허브의 '전체' 채팅 창. 게임을 시작하면 치웁니다. */
let hubChat: { close(): void } | undefined;

function tile(entry: Entry, index: number): string {
  return `
    <li class="tile-item">
      <button class="tile" id="start-${entry.id}" type="button" data-game="${entry.id}" aria-describedby="summary-${entry.id}">
        <span class="tile-media"><img src="${entry.image}" alt="${entry.imageAlt}" width="1280" height="800" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></span>
        <span class="tile-body">
          <span class="tile-genre">${entry.genre}</span>
          <span class="tile-name">${entry.name}</span>
          <span class="tile-summary" id="summary-${entry.id}">${entry.summary}</span>
          <span class="tile-facts">${entry.facts.map(f => `<span>${f}</span>`).join('')}</span>
          <span class="tile-foot"><span class="tile-status"></span><span class="tile-cta">플레이<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 8h9m-3.5-4L12.5 8 8.5 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span></span>
        </span>
      </button>
    </li>`;
}

function renderMenu(): void {
  generation++;
  launching = false;
  app.inert = false;
  unsubscribeAccount?.();
  unsubscribeAccount = undefined;
  const prefs = readPreferences();
  const sound = prefs.sound;
  const challenge = dailyChallenge(new Date());
  const featured = ENTRIES.find(entry => entry.id === challenge.game)!;
  document.title = 'WALDO · 일곱 편의 3D 게임';
  app.hidden = false;
  app.innerHTML = `
    <main class="home">
      <header class="home-head">
        <a class="mark" href="${base}" aria-label="WALDO 홈">WALDO</a>
        <div class="head-tools">
          <button class="sound-toggle" id="sound-toggle" type="button" aria-pressed="${sound}" aria-label="소리 ${sound ? '켜짐' : '꺼짐'}">
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3 8v4h3l4 3.5v-11L6 8z" fill="currentColor"/>${sound
              ? '<path d="M13 7.2a4 4 0 0 1 0 5.6M15.2 5a7 7 0 0 1 0 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
              : '<path d="M13.2 7.8l4.6 4.4m0-4.4l-4.6 4.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'}</svg>
            <span id="sound-label">소리 ${sound ? '켜짐' : '꺼짐'}</span>
          </button>
          ${PVP_ENABLED ? '<button class="head-account" id="head-account" type="button" aria-label="로그인과 랭킹">로그인 · 랭킹</button>' : ''}
        </div>
      </header>
      <section class="home-intro">
        <h1>${['', '한', '두', '세', '네', '다섯', '여섯', '일곱'][ENTRIES.length] ?? ENTRIES.length} 편의 3D 게임.</h1>
        <p>설치 없이 이 페이지에서 바로 시작합니다.</p>
        <div class="home-controls" aria-label="그래픽 설정">
          <label>그래픽 <select id="home-quality" aria-label="그래픽 품질"><option value="low" ${prefs.quality === 'low' ? 'selected' : ''}>낮음</option><option value="standard" ${prefs.quality === 'standard' ? 'selected' : ''}>표준</option><option value="high" ${prefs.quality === 'high' ? 'selected' : ''}>높음</option></select></label>
          <label><input id="home-motion" type="checkbox" ${prefs.reducedMotion ? 'checked' : ''}> 움직임 줄이기</label>
        </div>
      </section>
      <section class="daily-challenge" aria-labelledby="daily-heading">
        <div><span class="daily-kicker">DAILY CHALLENGE · 오늘의 도전</span><h2 id="daily-heading">${featured.name}</h2><p>${challenge.goal}</p><small>자율 도전 · 추가 보상이나 영구 강화 없음</small></div>
        <button id="daily-play" type="button">도전 시작 <span aria-hidden="true">↗</span></button>
      </section>
      <ul class="tiles" aria-label="게임 목록">${ENTRIES.map(tile).join('')}</ul>
      <p class="home-notice" id="home-notice" role="status" aria-live="polite"></p>
      <footer class="home-foot">
        <span>WebGL을 지원하는 최신 브라우저에서 가장 잘 동작합니다.</span>
        <span>Team Waldo</span>
      </footer>
    </main>`;
  app.querySelector<HTMLButtonElement>('#sound-toggle')!.onclick = () => {
    writePreferences({ ...readPreferences(), sound: !sound });
    renderMenu();
    document.querySelector<HTMLButtonElement>('#sound-toggle')?.focus();
  };
  const quality = app.querySelector<HTMLSelectElement>('#home-quality')!;
  quality.onchange = () => { const value = quality.value; if (value === 'low' || value === 'standard' || value === 'high') writePreferences({ ...readPreferences(), quality: value }); };
  const motion = app.querySelector<HTMLInputElement>('#home-motion')!;
  motion.onchange = () => { writePreferences({ ...readPreferences(), reducedMotion: motion.checked }); app.classList.toggle('home-reduced-motion', motion.checked); };
  app.classList.toggle('home-reduced-motion', prefs.reducedMotion);
  app.querySelector<HTMLButtonElement>('#daily-play')!.onclick = () => { void launch(challenge.game); };
  app.querySelectorAll<HTMLButtonElement>('.tile').forEach(button => {
    const game = ENTRIES.find(entry => entry.id === button.dataset.game);
    if (!game) return;
    button.querySelector('.tile-status')!.textContent = game.status();
    button.onclick = () => { void launch(game.id); };
  });
  wireAccount();
  wireChat();
}

/** 허브 오른쪽 아래의 전체 채팅. 첫 화면을 가볍게 두려고 한가할 때 불러옵니다. */
function wireChat(): void {
  if (!PVP_ENABLED || !CHAT_ENABLED || hubChat) return;
  const gen = generation;
  window.setTimeout(() => {
    if (gen !== generation || hubChat) return;
    void import('./net/chat-dock').then(({ openChat }) => {
      if (gen !== generation || hubChat || app.hidden) return;
      hubChat = openChat({ mode: 'hub', tabs: [{ key: 'lobby', label: '전체 채팅' }] });
    }).catch(() => undefined);
  }, 1500);
}
function closeHubChat(): void { hubChat?.close(); hubChat = undefined; }

/** 헤더의 계정 버튼. 네트워크 모듈은 누를 때나 한가한 때에만 불러와서 첫 화면을 가볍게 둡니다. */
function wireAccount(): void {
  const button = app.querySelector<HTMLButtonElement>('#head-account');
  if (!button) return;
  const label = (nickname: string | null): void => { button.textContent = nickname ? `${nickname} · 랭킹` : '로그인 · 랭킹'; };
  button.onclick = () => {
    const gen = generation;
    button.disabled = true;
    void import('./net/lobby').then(({ openLobby }) => { if (gen !== generation || launching || !button.isConnected) return; openLobby({ onClose: () => { button.disabled = false; } }); })
      .catch(() => { button.disabled = false; });
  };
  const gen = generation;
  window.setTimeout(() => {
    if (gen !== generation) return;
    void import('./net/backend').then(async ({ currentAccount, onAccount }) => {
      const account = await currentAccount();
      if (gen !== generation || !button.isConnected) return;
      label(account?.nickname ?? null);
      unsubscribeAccount = onAccount(a => { if (button.isConnected) label(a?.nickname ?? null); });
    }).catch(() => undefined);
  }, 1200);
}

async function launch(id: GameId): Promise<void> {
  if (launching) return;
  launching = true;
  if (id === 'room-tone') {
    location.assign(`${base}room-tone/`);
    return;
  }
  const navigation = ++generation;
  unsubscribeAccount?.();
  unsubscribeAccount = undefined;
  const buttons = app.querySelectorAll<HTMLButtonElement>('.tile');
  const notice = app.querySelector<HTMLElement>('#home-notice');
  const label = app.querySelector<HTMLElement>(`#start-${id} .tile-cta`);
  buttons.forEach(b => { b.disabled = true; });
  app.inert = true;
  closeHubChat();
  if (label) label.textContent = '불러오는 중…';
  if (notice) notice.textContent = '';
  // 일시적인 다운로드 오류에는 재시도하고, 계속 실패하면 메뉴로 복귀합니다.
  const loading = showLoading(ENTRIES.find(entry => entry.id === id)?.name ?? 'WALDO');
  loading.progress(null, '게임을 불러오는 중');
  const cancelled = (): boolean => generation !== navigation;
  const fetchGame = <T,>(load: () => Promise<T>): Promise<T> => retry(load, { cancelled, maxAttempts: 4, onRetry: n => loading.note(retryNote(n)) });
  try {
    const start = await fetchGame(gameLoaders[id]);
    if (cancelled()) { loading.close(); return; }
    app.hidden = true;
    start(renderMenu, loading);
  } catch {
    loading.close();
    if (cancelled()) return;
    renderMenu();
    app.querySelector<HTMLElement>('#home-notice')!.textContent = '게임을 불러오지 못했습니다. 연결을 확인한 뒤 다시 선택해 주세요.';
    app.querySelector<HTMLButtonElement>(`#start-${id}`)?.focus();
  }
}

/**
 * 가입 확인 메일의 링크로 돌아왔을 때의 처리. 성공이면 Supabase 가 주소의 토큰으로 로그인 상태를 만들어 주고,
 * 실패(링크 만료·이미 사용)면 `#error=...` 가 붙어 오므로 알아듣기 쉬운 안내와 재전송 버튼을 보여 줍니다.
 */
function handleAuthRedirect(): void {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const failed = params.has('error') || params.has('error_code'), signedIn = params.has('access_token');
  if (!failed && !signedIn) return;
  const clean = (): void => { try { history.replaceState(null, '', location.pathname + location.search); } catch { /* 주소 정리는 선택 사항 */ } };
  const open = (notice: string): void => {
    void import('./net/lobby').then(({ openLobby }) => { openLobby({ notice, onClose: () => undefined }); }).catch(() => undefined);
  };
  if (failed) { clean(); open('인증 링크가 만료되었거나 이미 사용됐습니다. 이메일을 입력하고 "인증 메일 다시 받기"를 눌러 새 링크를 받아 주세요.'); return; }
  // 성공: 클라이언트가 만들어지면서 주소의 토큰을 읽어 로그인합니다(주소 정리는 그 뒤에).
  void import('./net/backend').then(async ({ currentAccount, setAccount }) => {
    const account = await currentAccount(); clean();
    if (account) { setAccount(account); open('이메일 인증이 끝났습니다. 로그인되었습니다.'); } else open('로그인 상태를 확인하지 못했습니다. 이메일과 비밀번호로 로그인해 주세요.');
  }).catch(() => clean());
}

renderMenu();
handleAuthRedirect();

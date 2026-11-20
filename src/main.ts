import './style.css';
import { retireUpgradeSaves } from './shared/retire-upgrades';
import { readPreferences, writePreferences } from './prefs';
import { showLoading, retry, retryNote } from './loading';
import { readCityCareer, readRaceRecords, readRtsRecords, fmtTime } from './records';
import { readShooterCareer } from './shooter/records';
import { readOutlawSummary } from './outlaw/records';
import { PVP_ENABLED } from './net/config';

type GameId = 'city' | 'race' | 'rts' | 'shooter' | 'outlaw';

interface Entry {
  id: GameId;
  name: string;
  genre: string;
  summary: string;
  facts: string[];
  image: string;
  imageAlt: string;
  status: () => string;
}

const base = import.meta.env.BASE_URL;

const ENTRIES: Entry[] = [
  {
    id: 'city',
    name: 'LAST CITY',
    genre: '도시 점령 서바이벌',
    summary: '여덟 세력이 한 도시에 떨어졌습니다. 직접 총을 들고 사업체를 사들이고, 군대를 키워 마지막까지 남으세요.',
    facts: ['1인 플레이', '1인칭 · 3인칭 · 전술 시점', '키보드 · 마우스 · 터치'],
    image: `${base}assets/home/last-city.jpg`,
    imageAlt: '해 질 녘 LAST CITY의 거리 풍경',
    status: () => {
      const { matches, wins } = readCityCareer();
      return matches > 0 ? `${matches}판 · ${wins}승` : '';
    },
  },
  {
    id: 'race',
    name: 'SPEED RUSH',
    genre: '스포츠카 레이싱',
    summary: '라이벌과 순위를 겨루거나 타임어택에서 자신의 최고 기록에 도전하세요. 드리프트로 부스트를 모아 코너를 빠르게 탈출할 수 있습니다.',
    facts: ['코스 7곳 · 차량 8종', 'AI 레이스 · 타임어택', '키보드 · 터치'],
    image: `${base}assets/home/speed-rush.jpg`,
    imageAlt: '도심 서킷을 달리는 붉은 스포츠카',
    status: () => {
      const { bestLap, last } = readRaceRecords(), best = last ? bestLap[last.map] : undefined;
      return last && best !== undefined ? `${last.label} 최고 랩 ${fmtTime(best)}` : '';
    },
  },
  {
    id: 'rts',
    name: 'FRONTLINE',
    genre: '실시간 전략',
    summary: '광물을 캐고 기지를 세워 병력을 키우고, 상대의 모든 건물을 무너뜨리세요. AI는 쉬움부터 매우 어려움까지.',
    facts: ['AI 4단계 · 라인전', '일꾼 · 보병 · 전차 · 의무병', '키보드 · 마우스 · 터치'],
    image: `${base}assets/home/frontline.jpg`,
    imageAlt: '두 기지가 마주 선 FRONTLINE의 전장',
    status: () => {
      const { matches, wins } = readRtsRecords();
      return matches > 0 ? `${matches}판 · ${wins}승` : '';
    },
  },
  {
    id: 'shooter',
    name: 'ZERO ZONE',
    genre: '배틀로열 슈터',
    summary: '줄어드는 자기장 안에서 총을 줍고 싸웁니다. 비행기에서 낙하산으로 뛰어내려 AI 99명과 겨룹니다.',
    facts: ['AI 99명 · 비행기 낙하산 강하 · 난이도 4단계', '키보드 · 마우스 · 터치'],
    image: `${base}assets/home/zero-zone.jpg`,
    imageAlt: '자기장이 다가오는 들판에서 총을 든 병사',
    status: () => {
      const { matches, wins } = readShooterCareer();
      return matches > 0 ? `${matches}판 · ${wins}승` : '';
    },
  },
  {
    id: 'outlaw',
    name: 'OUTLAW CITY',
    genre: '오픈월드 범죄 액션',
    summary: '시민 8명 중 한 명으로 시작해 의뢰를 받고, 차를 몰고, 경찰을 따돌리세요. 배달·응급 이송·지하 격투·카지노·부동산·차고 수집까지 — 도시는 네 놀이터입니다.',
    facts: ['3인칭 오픈월드 · 차량 14종 · 무기 11종', '의뢰 7개 · 일거리 6종 · 카지노', '키보드 · 마우스 · 터치'],
    image: `${base}assets/home/outlaw-city.jpg`,
    imageAlt: '네온이 켜지는 황혼의 도시 거리와 추격전',
    status: () => {
      const r = readOutlawSummary();
      return r.has ? `의뢰 ${r.missions}/7 · 스턴트 ${r.stunts}/12` : '';
    },
  },
];

retireUpgradeSaves();
const app = document.querySelector<HTMLDivElement>('#game')!;
let generation = 0;
let unsubscribeAccount: (() => void) | undefined;

function tile(entry: Entry, index: number): string {
  return `
    <li class="tile-item">
      <button class="tile" id="start-${entry.id}" type="button" data-game="${entry.id}" aria-describedby="summary-${entry.id}">
        <span class="tile-media"><span class="tile-index" aria-hidden="true">${String(index + 1).padStart(2, '0')} / 05</span><img src="${entry.image}" alt="${entry.imageAlt}" width="1280" height="800" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></span>
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
  unsubscribeAccount?.();
  unsubscribeAccount = undefined;
  const sound = readPreferences().sound;
  document.title = 'WALDO · 다섯 편의 3D 게임';
  app.hidden = false;
  app.innerHTML = `
    <main class="home">
      <header class="home-head">
        <a class="mark" href="${base}" aria-label="WALDO 홈">WALDO<span>GAME STUDIO</span></a>
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
        <div class="intro-copy"><span class="home-kicker">WALDO GAME COLLECTION / 01</span><h1>${['', '한', '두', '세', '네', '다섯'][ENTRIES.length] ?? ENTRIES.length} 개의 세계,<br>하나의 플레이 공간.</h1><p>전략부터 레이싱, 오픈월드까지. 설치 없이 바로 플레이하세요.</p></div><div class="intro-count" aria-hidden="true"><b>${String(ENTRIES.length).padStart(2, '0')}</b><span>GAMES IN COLLECTION</span></div>
      </section>
      <div class="collection-heading"><h2>게임 라이브러리</h2><span>${ENTRIES.length} TITLES</span></div>
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
  app.querySelectorAll<HTMLButtonElement>('.tile').forEach(button => {
    const game = ENTRIES.find(entry => entry.id === button.dataset.game);
    if (!game) return;
    const status = button.querySelector('.tile-status')!;
    const record = game.status();
    status.textContent = record || '첫 플레이';
    status.classList.toggle('has-record', Boolean(record));
    button.onclick = () => { void launch(game.id); };
  });
  wireAccount();
}

/** 헤더의 계정 버튼. 네트워크 모듈은 누를 때나 한가한 때에만 불러와서 첫 화면을 가볍게 둡니다. */
function wireAccount(): void {
  const button = app.querySelector<HTMLButtonElement>('#head-account');
  if (!button) return;
  const label = (nickname: string | null): void => { button.textContent = nickname ? `${nickname} · 랭킹` : '로그인 · 랭킹'; };
  button.onclick = () => {
    button.disabled = true;
    const gen = generation;
    void import('./net/lobby').then(({ openLobby }) => { if (gen !== generation || !button.isConnected || app.hidden) return; openLobby({ onClose: () => { button.disabled = false; } }); })
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
  if (app.hidden || app.querySelector<HTMLButtonElement>(`#start-${id}`)?.disabled) return;
  const navigation = ++generation;
  const buttons = app.querySelectorAll<HTMLButtonElement>('button');
  const notice = app.querySelector<HTMLElement>('#home-notice');
  const label = app.querySelector<HTMLElement>(`#start-${id} .tile-cta`);
  buttons.forEach(b => { b.disabled = true; });
  if (label) label.textContent = '불러오는 중…';
  if (notice) notice.textContent = '';
  // 일시적인 다운로드 오류에는 재시도하고, 계속 실패하면 메뉴로 복귀합니다.
  const loading = showLoading(id === 'city' ? 'LAST CITY' : id === 'rts' ? 'FRONTLINE' : id === 'shooter' ? 'ZERO ZONE' : id === 'outlaw' ? 'OUTLAW CITY' : 'SPEED RUSH');
  loading.progress(null, '게임을 불러오는 중');
  const cancelled = (): boolean => generation !== navigation;
  const fetchGame = <T,>(load: () => Promise<T>): Promise<T> => retry(load, { cancelled, maxAttempts: 4, onRetry: n => loading.note(retryNote(n)) });
  try {
    if (id === 'city') {
      const { openCity } = await fetchGame(() => import('./city/game'));
      if (cancelled()) { loading.close(); return; }
      app.hidden = true;
      openCity(renderMenu, { loading });
    } else if (id === 'rts') {
      const { openRts } = await fetchGame(() => import('./rts/game'));
      if (cancelled()) { loading.close(); return; }
      app.hidden = true;
      openRts(renderMenu, { loading });
    } else if (id === 'shooter') {
      const { openShooter } = await fetchGame(() => import('./shooter/game'));
      if (cancelled()) { loading.close(); return; }
      app.hidden = true;
      openShooter(renderMenu, { loading });
    } else if (id === 'outlaw') {
      const { openOutlaw } = await fetchGame(() => import('./outlaw/game'));
      if (cancelled()) { loading.close(); return; }
      app.hidden = true;
      openOutlaw(renderMenu, { loading });
    } else {
      const { openRace } = await fetchGame(() => import('./race/game'));
      if (cancelled()) { loading.close(); return; }
      app.hidden = true;
      openRace(renderMenu);
      loading.close();
    }
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
  const authGeneration = generation;
  const open = (notice: string): void => {
    if (!PVP_ENABLED || authGeneration !== generation || app.hidden) return;
    void import('./net/lobby').then(({ openLobby }) => { if (authGeneration === generation && !app.hidden) openLobby({ notice, onClose: () => undefined }); }).catch(() => undefined);
  };
  if (!PVP_ENABLED) { clean(); return; }
  if (failed) { clean(); open('인증 링크가 만료되었거나 이미 사용됐습니다. 이메일을 입력하고 "인증 메일 다시 받기"를 눌러 새 링크를 받아 주세요.'); return; }
  // 성공: 클라이언트가 만들어지면서 주소의 토큰을 읽어 로그인합니다(주소 정리는 그 뒤에).
  void import('./net/backend').then(async ({ currentAccount, setAccount }) => {
    const account = await currentAccount(); clean();
    if (account) { setAccount(account); open('이메일 인증이 끝났습니다. 로그인되었습니다.'); } else open('로그인 상태를 확인하지 못했습니다. 이메일과 비밀번호로 로그인해 주세요.');
  }).catch(() => clean());
}

renderMenu();
handleAuthRedirect();

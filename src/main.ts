import './style.css';
import { retireUpgradeSaves } from './shared/retire-upgrades';
import { readPreferences, writePreferences } from './prefs';
import { showLoading, loadModule, clearReloadGuard } from './loading';
import { deferTileImages } from './shared/lazy-images';
import { readCityCareer, readRaceRecords, fmtTime } from './records';
import { readShooterCareer } from './shooter/records';
import { readSkySummary } from './sky/records';
import { readSlackRecord } from './slack/records';
import { readTycoonSummary, STAGE_NAMES } from './tycoon/core/summary';
import { CHAT_ENABLED, PVP_ENABLED } from './net/config';
import { setRails } from './shared/rails';

type GameId = 'city' | 'race' | 'shooter' | 'tycoon' | 'sky' | 'room-tone' | 'slack' | 'parry-gladiator' | 'dead-ground' | 'project-harbor';

/** 자기 주소(/<id>/)에서 열리는 게임 또는 다운로드 페이지. */
const STANDALONE: ReadonlySet<GameId> = new Set<GameId>(['room-tone', 'parry-gladiator', 'dead-ground', 'project-harbor']);

interface Entry {
  id: GameId;
  name: string;
  genre: string;
  summary: string;
  facts: string[];
  image: string;
  imageAlt: string;
  badge?: 'New';
  desktop?: boolean;
  status?: () => string;
}

const base = import.meta.env.BASE_URL;

const ENTRIES: Entry[] = [
  {
    id: 'project-harbor', name: 'Project Harbor', genre: '3D 오픈월드 액션',
    summary: '포트 캘러웨이의 숲, 사막, 도시, 부촌, 빈민가, 군사기지를 자유롭게 걷습니다. 무기를 주워 사격하고 소매치기와 강도로 돈을 법니다.',
    facts: ['Windows · Linux 다운로드', '미션 없는 오픈월드', '6개 지역'],
    image: `${base}assets/home/project-harbor-lighthouse.webp`, imageAlt: '포트 캘러웨이 부두의 청록색 등대와 방파제',
    badge: 'New', desktop: true,
  },
  {
    id: 'slack', name: 'SLACK OFF', genre: '딴짓 시뮬레이션',
    summary: '자습시간 교실과 심야 기숙사 컴퓨터실에서 선생님과 사감 몰래 진짜 딴짓을 즐기세요. 발소리가 다가오면 공부하는 척!',
    facts: ['교실 · 컴퓨터실 2개 무대', '난이도 3단계 · 적발 3회 아웃', '키보드 · 마우스 · 터치'],
    image: `${base}assets/home/slack-off.svg`, imageAlt: '어두운 교실 책상 위 교과서와 몰래 켠 휴대폰, 복도 창에 비친 감독의 그림자',
    status: () => {
      const { best } = readSlackRecord();
      const grades = [best.class?.grade, best.dorm?.grade].filter((grade): grade is string => !!grade);
      grades.sort((a, b) => 'SABCD'.indexOf(a) - 'SABCD'.indexOf(b));
      return grades.length ? `최고 ${grades[0]}등급` : '';
    },
  },
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
    id: 'tycoon',
    name: 'HUSTLE',
    genre: '발로 뛰는 도시 타이쿤',
    summary: '벤치에서 눈을 뜬 빈털터리가 빈 병을 줍고, 알바를 뛰고, 작은 가게를 열어 사업·대기업을 거쳐 세계를 정복합니다. 도시는 당신의 걸음과 함께 자랍니다.',
    facts: ['3D 도시 · 차량 운전 · 순간이동', '빈털터리 → 세계 정복 7단계', '키보드 · 마우스 · 터치'],
    image: `${base}assets/home/hustle.jpg`,
    imageAlt: '해 질 녘 번화한 도시 거리와 간판 불빛',
    status: () => {
      const r = readTycoonSummary();
      return r.has ? (r.won ? `세계 정복 · ${r.day}일` : `${STAGE_NAMES[r.stage]} · ${r.day}일차`) : '';
    },
  },
  {
    id: 'sky',
    name: 'SKY WAR',
    genre: '전투기 공중전',
    summary: '군도 위 하늘에서 끝없이 몰려오는 적기와 맞서세요. 커서만 움직여 조종하고, 자동 조준으로 기관포를 쏘고, 락온 미사일과 플레어로 에이스를 격추합니다.',
    facts: ['터치패드 조종 · 자동 조준/사격', '웨이브 무한 · 난이도 3단계 · 락온 미사일', '키보드 · 마우스 · 터치'],
    image: `${base}assets/home/sky-war.jpg`,
    imageAlt: '구름 위에서 적기를 쫓는 전투기',
    status: () => {
      const r = readSkySummary();
      return r.has ? `최고 ${r.bestScore}점 · 웨이브 ${r.bestWave}` : '';
    },
  },
  {
    id: 'parry-gladiator',
    name: 'PARRY GLADIATOR',
    genre: '1대1 패링 결투',
    summary: '검투장에서 상대의 공격을 읽고 막고 받아치세요. 패링에 성공하면 반격 기회가 열리고, 먼저 두 라운드를 따내면 승리합니다.',
    facts: ['AI 대전 · 연습', '검과 방패로 펼치는 결투', '키보드 · 마우스 · 터치'],
    image: `${base}assets/home/parry-gladiator.svg`,
    imageAlt: '노을 진 검투장에서 검과 방패를 든 두 검투사가 마주 선 모습',
  },
  {
    id: 'dead-ground',
    name: 'DEAD GROUND',
    genre: '저격 서바이벌 아레나',
    summary: '무너진 공업 계곡에서 볼트액션 저격총 한 자루로 싸우세요. 탄도 낙차를 읽고 엄폐물 사이를 움직여 12킬을 먼저 채웁니다.',
    facts: ['AI 5명과 생존 대결', '폐허 속 저격 아레나', '키보드 · 마우스 (PC)'],
    image: `${base}assets/home/dead-ground.webp`,
    imageAlt: '폐허가 된 공업 계곡 위로 저격 조준경이 겨눠진 Dead Ground 타이틀 이미지',
  },
  {
    id: 'room-tone',
    name: 'ROOM TONE',
    genre: '1인칭 심리 공포',
    summary: '폐쇄된 녹음 시설의 신호를 복원하세요. 발소리를 쫓아오는 잔향을 피해 네 구역을 빠져나가야 합니다.',
    facts: ['1인 플레이 · 약 30분', '탐색 · 퍼즐 · 추적', '자동 저장 · 터치 지원'],
    image: `${base}room-tone/keyart.jpg`,
    imageAlt: '녹음실 문 뒤에서 복도를 응시하는 잔향',
  },
];

retireUpgradeSaves();
const app = document.querySelector<HTMLDivElement>('#game')!;
let generation = 0;
let unsubscribeAccount: (() => void) | undefined;
/** 허브의 '전체' 채팅 창. 게임을 시작하면 치웁니다. */
let hubChat: { close(): void } | undefined;

function tile(entry: Entry, index: number): string {
  return `
    <li class="tile-item${entry.badge ? ' tile-item--featured' : ''}" style="--tile-index: ${index}">
      <button class="tile" id="start-${entry.id}" type="button" data-game="${entry.id}" aria-describedby="summary-${entry.id}">
        <span class="tile-media${entry.id === 'room-tone' ? ' is-scary' : ''}"><img ${index === 0 ? `src="${entry.image}" fetchpriority="high"` : `data-deferred-src="${entry.image}" loading="lazy" fetchpriority="low"`} alt="${entry.imageAlt}" width="1280" height="800" decoding="async">${entry.id === 'room-tone' ? '<span class="tile-warn" aria-hidden="true">⚠ 공포 이미지 · 올려 보면 보여요</span>' : ''}</span>
        <span class="tile-body">
          <span class="tile-tags">
            ${entry.badge ? `<span class="tile-new">${entry.badge}</span>` : ''}
            <span class="tile-genre">${entry.genre}${entry.id === 'room-tone' ? ' · 공포 주의' : ''}</span>
          </span>
          <span class="tile-name">${entry.name}</span>
          <span class="tile-summary" id="summary-${entry.id}">${entry.summary}</span>
          <span class="tile-facts">${entry.facts.map(f => `<span>${f}</span>`).join('')}</span>
          <span class="tile-foot"><span class="tile-status"></span><span class="tile-cta">${entry.desktop ? '다운로드' : '플레이'}<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 8h9m-3.5-4L12.5 8 8.5 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span></span>
        </span>
      </button>
    </li>`;
}

let hubScrollY = 0;
let stopTileImages: (() => void) | undefined;
const HUB_TITLE = `WALDO · ${ENTRIES.length}편의 게임`;
/** 지금 열려 있는 게임. 뒤로가기·새로고침 경고가 이 값을 봅니다. */
let activeGame: GameId | null = null;
/** 게임을 열면서 우리가 기록(history)을 하나 쌓았는지. 목록으로 돌아올 때 한 칸 되돌릴지 정합니다. */
let pushedEntry = false;
let returningToHubViaHistory = false;
const gameHash = (id: GameId): string => `#/${id}`;
const hashGame = (): GameId | null => {
  const id = location.hash.startsWith('#/') ? location.hash.slice(2) : '';
  return ENTRIES.find(e => e.id === id)?.id ?? null;
};
function leaveGameEntry(): void {
  if (pushedEntry) { pushedEntry = false; history.back(); }
  else if (location.hash.startsWith('#/')) { try { history.replaceState(null, '', location.pathname + location.search); } catch { /* 주소 정리는 선택 사항 */ } }
}
function renderMenu(): void {
  stopTileImages?.(); stopTileImages = undefined;
  setRails(null);
  const previousGame = activeGame;
  activeGame = null;
  if (previousGame) leaveGameEntry();
  generation++;
  unsubscribeAccount?.();
  unsubscribeAccount = undefined;
  const sound = readPreferences().sound;
  document.title = HUB_TITLE;
  app.hidden = false;
  app.innerHTML = `
    <main class="home">
      <header class="home-head">
        <a class="mark" href="${base}" aria-label="WALDO 홈">WALDO</a>
        <div class="head-tools">
          <button class="sound-toggle" id="sound-toggle" type="button" aria-pressed="${sound}" aria-label="소리 ${sound ? '켜짐' : '꺼짐'}" title="소리 ${sound ? '끄기' : '켜기'}">
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3 8v4h3l4 3.5v-11L6 8z" fill="currentColor"/>${sound
              ? '<path d="M13 7.2a4 4 0 0 1 0 5.6M15.2 5a7 7 0 0 1 0 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
              : '<path d="M13.2 7.8l4.6 4.4m0-4.4l-4.6 4.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'}</svg>
            <span id="sound-label">소리 ${sound ? '켜짐' : '꺼짐'}</span>
          </button>
          ${PVP_ENABLED ? '<button class="head-account" id="head-account" type="button" aria-label="로그인과 랭킹">로그인 · 랭킹</button>' : ''}
        </div>
      </header>
      <section class="home-intro">
        <h1>${ENTRIES.length}편의 게임, 한곳에서.</h1>
        <p>브라우저 게임은 바로 시작하고, 데스크톱 게임은 내려받아 플레이하세요.</p>
      </section>
      <ul class="tiles" aria-label="게임 목록">${ENTRIES.map(tile).join('')}</ul>
      <p class="home-notice" id="home-notice" role="status" aria-live="polite"></p>
      <footer class="home-foot">
        <span>브라우저 게임은 WebGL을 지원하는 최신 브라우저에서 가장 잘 동작합니다.</span>
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
    const status = game.status?.();
    if (status) button.querySelector('.tile-status')!.textContent = `내 기록 · ${status}`;
    const image = button.querySelector<HTMLImageElement>('.tile-media img')!;
    const settleImage = (): void => {
      image.parentElement?.classList.add(image.naturalWidth ? 'is-loaded' : 'is-error');
    };
    if (image.complete && image.hasAttribute('src')) settleImage();
    else {
      image.addEventListener('load', settleImage, { once: true });
      image.addEventListener('error', settleImage, { once: true });
    }
    button.onclick = () => { void launch(game.id); };
  });
  stopTileImages = deferTileImages(app);
  wireAccount();
  wireChat();
  if (hubScrollY) restoreScroll();
  if (previousGame) app.querySelector<HTMLButtonElement>(`#start-${previousGame}`)?.focus({ preventScroll: true });
}

/** 이미지·애니메이션으로 문서 높이가 늦게 정해져도 원래 위치로 돌아가도록 몇 프레임 동안 다시 맞춥니다. */
function restoreScroll(): void {
  const target = hubScrollY, gen = generation;
  let tries = 0;
  const step = (): void => {
    if (gen !== generation) return;
    window.scrollTo({ top: target, behavior: 'instant' });
    if (Math.abs(window.scrollY - target) > 2 && ++tries < 30) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** 허브 오른쪽 아래의 전체 채팅. 첫 화면을 가볍게 두려고 한가할 때 불러옵니다. */
function wireChat(): void {
  if (!PVP_ENABLED || !CHAT_ENABLED || hubChat) return;
  const gen = generation;
  window.setTimeout(() => {
    if (gen !== generation || hubChat) return;
    void loadModule(() => import('./net/chat-dock'), { cancelled: () => gen !== generation }).then(({ openChat }) => {
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
    button.disabled = true;
    const before = button.textContent;
    const restore = (): void => { if (button.textContent === '다시 연결하는 중…') button.textContent = before; };
    void loadModule(() => import('./net/lobby'), { onNote: text => { if (text) button.textContent = '다시 연결하는 중…'; } })
      .then(({ openLobby }) => { restore(); openLobby({ onClose: () => { button.disabled = false; } }); })
      .catch(() => { restore(); button.disabled = false; });
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

/** 로딩이 길어질 때의 출구: 주소의 #/게임 을 지우고 허브를 새로 엽니다(게임이 만든 화면·루프도 함께 정리됩니다). */
function backToHub(): void {
  returningToHubViaHistory = true;
  try { history.replaceState(null, '', location.pathname + location.search); } catch { /* 주소 정리는 선택 사항 */ }
  location.reload();
}

async function launch(id: GameId, fromHistory = false): Promise<void> {
  const entry = ENTRIES.find(game => game.id === id);
  if (!entry) return;
  if (!fromHistory) hubScrollY = window.scrollY;
  stopTileImages?.(); stopTileImages = undefined;
  if (STANDALONE.has(id)) {
    const url = `${base}${id}/`;
    if (fromHistory) location.replace(url);
    else location.assign(url);
    return;
  }
  const navigation = ++generation;
  activeGame = id;
  // 게임마다 기록 한 칸: 브라우저 뒤로가기가 사이트를 떠나지 않고 게임 목록으로 돌아옵니다. 새로고침해도 같은 게임 화면이 열립니다.
  pushedEntry = history.state?.game === id;
  if (hashGame() !== id) {
    try { history.pushState({ game: id }, '', gameHash(id)); pushedEntry = true; } catch { /* 기록 실패 시 뒤로가기만 기본 동작 */ }
  }
  document.title = `${entry.name} · WALDO`;
  const buttons = app.querySelectorAll<HTMLButtonElement>('.tile');
  const notice = app.querySelector<HTMLElement>('#home-notice');
  const label = app.querySelector<HTMLElement>(`#start-${id} .tile-cta`);
  buttons.forEach(b => { b.disabled = true; });
  closeHubChat();
  if (label) label.textContent = '불러오는 중…';
  if (notice) notice.textContent = '';
  // 느리거나 끊겨도 포기하지 않고 계속 다시 시도합니다. 오래 걸리면 "처음 화면으로" 버튼이 나타납니다.
  const loading = showLoading(entry.name, backToHub);
  loading.progress(null, '게임을 불러오는 중');
  const cancelled = (): boolean => generation !== navigation;
  const fetchGame = <T,>(load: () => Promise<T>): Promise<T> => loadModule(load, { cancelled, onNote: text => loading.note(text) }).then(m => { clearReloadGuard(); return m; });
  try {
    setRails({ name: entry.name, genre: entry.genre, summary: entry.summary, facts: entry.facts, image: entry.image, imageAlt: entry.imageAlt, status: entry.status?.() ?? '' });
    if (id === 'city') {
      const { openCity } = await fetchGame(() => import('./city/game'));
      if (cancelled()) { loading.close(); return; }
      app.hidden = true;
      openCity(renderMenu, { loading });
    } else if (id === 'shooter') {
      const { openShooter } = await fetchGame(() => import('./shooter/game'));
      if (cancelled()) { loading.close(); return; }
      app.hidden = true;
      openShooter(renderMenu, { loading });
    } else if (id === 'slack') {
      const { openSlack } = await fetchGame(() => import('./slack/game'));
      if (cancelled()) { loading.close(); return; }
      app.hidden = true;
      openSlack(renderMenu, { loading });
    } else if (id === 'sky') {
      const { openSky } = await fetchGame(() => import('./sky/game'));
      if (cancelled()) { loading.close(); return; }
      app.hidden = true;
      openSky(renderMenu, { loading });
    } else if (id === 'tycoon') {
      const { openTycoon } = await fetchGame(() => import('./tycoon/game'));
      if (cancelled()) { loading.close(); return; }
      app.hidden = true;
      openTycoon(renderMenu, { loading });
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
    // 여기까지 오는 건 네트워크가 아니라 게임 코드 자체의 오류뿐입니다(연결 문제는 위에서 계속 다시 시도).
    app.querySelector<HTMLElement>('#home-notice')!.textContent = '게임을 여는 중 문제가 생겼습니다. 페이지를 새로고침한 뒤 다시 선택해 주세요.';
    app.querySelector<HTMLButtonElement>(`#start-${id}`)?.focus();
  }
}

// 이전 인증 링크에 포함된 토큰을 처리하지 않고 주소에서 제거합니다.
function handleAuthRedirect(): void {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (params.has('access_token') || params.has('error') || params.has('error_code')) {
    try { history.replaceState(null, '', location.pathname + location.search); } catch { /* 주소 정리는 선택 사항 */ }
  }
}

window.addEventListener('popstate', () => {
  const target = hashGame();
  if (target && !activeGame) { void launch(target, true); return; }
  // 게임 화면에서 뒤로가기를 누르면 게임 목록으로. 게임이 만든 화면·루프를 확실히 치우도록 페이지를 다시 엽니다.
  if (!target && activeGame) {
    returningToHubViaHistory = true;
    try { sessionStorage.setItem('waldo.hubScroll', String(hubScrollY)); } catch { /* 선택 사항 */ }
    location.reload();
  } else if (!target && location.hash.startsWith('#/')) {
    leaveGameEntry();
  }
});
// 게임 중 새로고침·탭 닫기: 진행이 사라진다고 먼저 알립니다.
window.addEventListener('beforeunload', e => {
  if (returningToHubViaHistory) {
    // 뒤로가기로 허브에 돌아갈 때는 게임에서 등록한 종료 경고도 건너뜁니다.
    e.stopImmediatePropagation();
    return;
  }
  if (!activeGame) return;
  e.preventDefault();
  e.returnValue = '';
}, { capture: true });

try { history.scrollRestoration = 'manual'; } catch { /* 선택 사항 */ }
try { hubScrollY = Number(sessionStorage.getItem('waldo.hubScroll')) || 0; sessionStorage.removeItem('waldo.hubScroll'); } catch { /* 선택 사항 */ }
const startGame = hashGame();
if (!startGame && location.hash.startsWith('#/')) leaveGameEntry();
renderMenu();
handleAuthRedirect();
if (startGame) void launch(startGame, true);

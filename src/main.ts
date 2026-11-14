import './style.css';
import { readCityCareer, readRaceRecords, fmtTime } from './records';

type GameId = 'city' | 'race';

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
    summary: '코스 다섯 곳 가운데 하나를 골라 달립니다. 차량과 난이도, 1~3랩을 정하고 드리프트로 부스트를 모아 라이벌 세 대를 앞지르세요.',
    facts: ['코스 5곳 · 차량 6종', '난이도 5단계 · 1~3랩', '키보드 · 터치'],
    image: `${base}assets/home/speed-rush.jpg`,
    imageAlt: '도심 서킷을 달리는 붉은 스포츠카',
    status: () => {
      const { bestLap, last } = readRaceRecords(), best = last ? bestLap[last.map] : undefined;
      return last && best !== undefined ? `${last.label} 최고 랩 ${fmtTime(best)}` : '';
    },
  },
];

const app = document.querySelector<HTMLDivElement>('#game')!;
let generation = 0;

function tile(entry: Entry, index: number): string {
  const status = entry.status();
  return `
    <li class="tile-item">
      <button class="tile" id="start-${entry.id}" type="button" data-game="${entry.id}" aria-describedby="summary-${entry.id}">
        <span class="tile-media"><img src="${entry.image}" alt="${entry.imageAlt}" width="1280" height="800" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></span>
        <span class="tile-body">
          <span class="tile-genre">${entry.genre}</span>
          <span class="tile-name">${entry.name}</span>
          <span class="tile-summary" id="summary-${entry.id}">${entry.summary}</span>
          <span class="tile-facts">${entry.facts.map(f => `<span>${f}</span>`).join('')}</span>
          <span class="tile-foot"><span class="tile-status">${status}</span><span class="tile-cta">플레이<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 8h9m-3.5-4L12.5 8 8.5 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span></span>
        </span>
      </button>
    </li>`;
}

function renderMenu(): void {
  generation++;
  document.title = 'WALDO · LAST CITY / SPEED RUSH';
  app.hidden = false;
  app.innerHTML = `
    <main class="home">
      <header class="home-head">
        <a class="mark" href="${base}" aria-label="WALDO 홈">WALDO</a>
        <span class="head-note">브라우저 3D 게임</span>
      </header>
      <section class="home-intro">
        <h1>두 편의 3D 게임.</h1>
        <p>설치도 가입도 없이, 이 페이지에서 바로 시작합니다.</p>
      </section>
      <ul class="tiles" aria-label="게임 목록">${ENTRIES.map(tile).join('')}</ul>
      <p class="home-notice" id="home-notice" role="status" aria-live="polite"></p>
      <footer class="home-foot">
        <span>WebGL을 지원하는 최신 브라우저에서 가장 잘 동작합니다.</span>
        <span>Team Waldo</span>
      </footer>
    </main>`;
  app.querySelectorAll<HTMLButtonElement>('.tile').forEach(button => {
    button.onclick = () => { void launch(button.dataset.game as GameId); };
  });
}

async function launch(id: GameId): Promise<void> {
  const navigation = ++generation;
  const buttons = app.querySelectorAll<HTMLButtonElement>('.tile');
  const notice = app.querySelector<HTMLElement>('#home-notice');
  const label = app.querySelector<HTMLElement>(`#start-${id} .tile-cta`);
  buttons.forEach(b => { b.disabled = true; });
  if (label) label.textContent = '불러오는 중…';
  if (notice) notice.textContent = '';
  try {
    if (id === 'city') {
      const { openCity } = await import('./city/game');
      if (generation !== navigation) return;
      app.hidden = true;
      openCity(renderMenu);
    } else {
      const { openRace } = await import('./race/game');
      if (generation !== navigation) return;
      app.hidden = true;
      openRace(renderMenu);
    }
  } catch {
    renderMenu();
    const retry = document.querySelector<HTMLElement>('#home-notice');
    if (retry) retry.textContent = '게임을 불러오지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
  }
}

renderMenu();

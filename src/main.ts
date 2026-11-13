import './style.css';
import './landing.css';
import './battle/war.css';
import { loadWar } from './battle/save';
import { DIFFICULTIES, type Difficulty } from './battle/war';
import { readPreferences, writePreferences, readCareer } from './battle/preferences';
import { icon } from './ui/icons';
import { showDialog } from './ui/dialog';

const app = document.querySelector<HTMLDivElement>('#game')!;
let disposePreview: (() => void) | undefined;
let generation = 0;
let selectedDifficulty: Difficulty = 'normal';
const clock = (time: number) => `${Math.floor(time / 60)}분 ${Math.floor(time % 60)}초`;

function renderMenu(): void {
  generation++;
  const currentGeneration = generation;
  disposePreview?.(); disposePreview = undefined;
  const saved = loadWar();
  const unfinished = saved && saved.factions[0].alive && !saved.over;
  const resumable = unfinished && saved.grandBattle;
  const career = readCareer();
  let launching = false;
  app.hidden = false;
  app.innerHTML = `
    <main class="landing" data-release="kingdoms-1.0">
      <header class="site-header">
        <a class="wordmark" href="#" aria-label="Waldo 왕국 전쟁 홈"><span class="brand-seal">${icon('crown', 25)}</span><span>WALDO<small>KINGDOMS AT WAR</small></span></a>
        <nav class="header-nav" aria-label="메뉴"><span class="offline-status"><i></i>싱글플레이 · AI 대전</span><button id="guide" class="nav-button">전장 가이드 ${icon('arrow', 15)}</button><button id="preferences" class="icon-button" aria-label="게임 설정">${icon('settings', 19)}</button></nav>
      </header>
      <div class="campaign-layout">
        <section class="hero-content" aria-labelledby="campaign-title">
          <div class="edition"><i></i>REAL-TIME KINGDOM STRATEGY <span>VOL. 01</span></div>
          <h1 id="campaign-title">전장을 읽고,<br>왕국을 <em>지휘하라.</em></h1>
          <p class="hero-description">100명의 아군, 500명의 적군.<br>거점을 확보하고 군단을 이끌어<br class="compact-break"> 마지막까지 살아남는 왕국을 만드세요.</p>
          <div class="game-facts"><div><b>4</b><span>경쟁 왕국</span></div><div><b>9</b><span>전략 거점</span></div><div><b>4</b><span>병종 조합</span></div></div>
        </section>
        <figure class="theater" aria-label="에메랄드 왕국 3D 전장 미리보기">
          <div class="theater-heading"><span><i></i>EMERALD FRONT</span><span>3D 전장 미리보기 ${icon('target', 14)}</span></div>
          <div class="landing-art" aria-hidden="true"><img src="${import.meta.env.BASE_URL}kingdom-art.svg" alt="" class="kingdom-illustration"><div class="landing-preview" id="landing-preview"></div><div class="art-vignette"></div></div>
          <span class="theater-coordinate" aria-hidden="true">NW SECTOR / 01</span>
          <div class="deployment-card"><div class="deployment-heading"><span class="kicker">대규모 군단전</span><span>600명 동시 출전</span></div><div class="force-balance"><div><span>YOUR ARMY</span><b>100</b><small>에메랄드 왕국</small></div><span class="versus">VS</span><div><span>ENEMY ALLIANCE</span><b>500</b><small>세 개의 라이벌 왕국</small></div></div><div class="deployment-footer"><span><i></i>아군 군단</span><span><i></i><i></i><i></i>적군 3개 세력</span>${icon('flag', 15)}</div></div>
          <figcaption><span>THE EMERALD KINGDOM</span><span>당신의 첫 번째 명령을 기다립니다.</span></figcaption>
        </figure>
        <section class="launch-console" aria-label="대규모 전쟁 시작">
          <div class="section-heading"><h2>작전 난이도</h2><span>01 — DEPLOYMENT</span></div>
          <div class="difficulty-picker" role="group" aria-label="작전 난이도">${(['easy', 'normal', 'hard'] as Difficulty[]).map((key, i) => `<button id="difficulty-${key}" data-difficulty="${key}" class="difficulty-option${key === selectedDifficulty ? ' selected' : ''}" aria-pressed="${key === selectedDifficulty}" aria-describedby="difficulty-description"><span>0${i + 1}</span><b>${DIFFICULTIES[key].label}</b><small>${['첫 지휘를 위한 여유', '균형 잡힌 전장', '노련한 지휘관의 도전'][i]}</small></button>`).join('')}</div>
          <p id="difficulty-description" class="difficulty-description" aria-live="polite">${DIFFICULTIES[selectedDifficulty].description}</p>
          <div class="launch-actions"><button id="start-grand" class="button primary launch-button" aria-label="대규모 전쟁 시작, 아군 100명 대 적군 500명"><span class="launch-icon">${icon('sword', 22)}</span><span>대규모 전쟁 시작<small>100 VS 500 · 새로운 원정</small></span>${icon('arrow', 22)}</button>${resumable ? `<button id="continue-war" class="button continue-button">${icon('play', 18)}<span>저장한 전투 이어하기<small>${DIFFICULTIES[saved.difficulty].label} · ${clock(saved.time)}</small></span>${icon('arrow', 17)}</button>` : ''}</div>
          <p class="play-note">${icon('save', 13)}15초마다 자동 저장<span>설치 없이 바로 플레이</span></p>
        </section>
      </div>
      <section class="campaign-features" aria-label="전략의 세 가지 축">
        <article><span class="feature-number">01</span>${icon('flag', 23)}<div><h2>거점을 선점하세요</h2><p>9개의 전략 거점으로 자원과 전선을 확보하세요.</p></div></article>
        <article><span class="feature-number">02</span>${icon('army', 23)}<div><h2>나만의 군단을 편성하세요</h2><p>네 병종과 세 부대, 하나의 정교한 작전.</p></div></article>
        <article><span class="feature-number">03</span>${icon('tower', 23)}<div><h2>끝까지 버티는 왕국으로</h2><p>시설을 강화하고 장군을 배치해 전세를 바꾸세요.</p></div></article>
      </section>
      <footer class="landing-footer"><span class="footer-credit">TEAM WALDO <i>/</i> KINGDOMS AT WAR</span><div class="career-inline">${career.matches ? `<span>완료한 원정 <b>${career.matches}</b></span><span>승리 <b>${career.wins}</b></span><span>최다 처치 <b>${career.bestKills}</b></span>` : '<span>모든 왕국의 역사는 하나의 명령에서 시작됩니다.</span>'}</div><span class="footer-mode"><i></i>1 PLAYER · 3 AI KINGDOMS</span></footer>
    </main>`;
  document.title = 'WALDO · 왕국 전쟁 | 100 대 500 군단전';
  const start = async (resume: boolean) => {
    if (launching) return;
    launching = true;
    const navigation = ++generation;
    disposePreview?.(); disposePreview = undefined;
    const button = app.querySelector<HTMLButtonElement>(resume ? '#continue-war' : '#start-grand')!;
    app.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.disabled = true; });
    button.textContent = '전장 준비 중…';
    try {
      const { openWar } = await import('./battle/view');
      if (generation !== navigation) return;
      app.hidden = true;
      openWar(renderMenu, { forceNew: !resume, difficulty: resume && saved ? saved.difficulty : selectedDifficulty });
    } catch {
      renderMenu();
      showDialog({ title: '전장을 불러오지 못했어요', body: '<p>네트워크 연결을 확인한 뒤 다시 시작해 주세요. 저장한 전투는 변경되지 않았습니다.</p>' });
    }
  };
  app.querySelector<HTMLButtonElement>('#start-grand')!.onclick = () => {
    if (unfinished) showDialog({ eyebrow: 'NEW CAMPAIGN', title: '새로운 군단전을 시작할까요?', body: `<p>${resumable ? '새 전투가 자동 저장되면 이전 전투의 저장 내용을 덮어씁니다. 이전 전투를 계속하려면 이어하기를 선택하세요.' : '이전 버전의 소규모 전투 저장이 있습니다. 새 군단전이 자동 저장되면 이전 저장 내용을 덮어씁니다.'}</p>`, confirm: '대규모 전쟁 시작', cancel: '돌아가기', onConfirm: () => { void start(false); } });
    else void start(false);
  };
  app.querySelector<HTMLButtonElement>('#continue-war')?.addEventListener('click', () => { void start(true); });
  app.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(button => {
    button.onclick = () => {
      selectedDifficulty = button.dataset.difficulty as Difficulty;
      app.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(b => { const selected = b === button; b.classList.toggle('selected', selected); b.setAttribute('aria-pressed', String(selected)); });
      app.querySelector('#difficulty-description')!.textContent = DIFFICULTIES[selectedDifficulty].description;
    };
  });
  app.querySelector<HTMLButtonElement>('#guide')!.onclick = () => showDialog({ eyebrow: 'FIELD GUIDE / 100 VS 500', title: '첫 명령이 전세를 바꿉니다', body: `<div class="guide-steps"><article><span>01</span><div><b>북서부 관문에서 시작하세요.</b><p>낙하산 착륙 후 깃발 옆에 머물러 거점을 점령하세요. T 또는 전략 지도 버튼으로 군단 지휘 시점에 돌아갑니다.</p></div></article><article><span>02</span><div><b>100명의 병력을 나누어 지휘하세요.</b><p>작전 탭에서 기동대와 수비대를 25명씩 편성하세요. 부대를 선택하고 전장이나 미니맵에서 목적지를 지정할 수 있습니다.</p></div></article><article><span>03</span><div><b>준비된 기지로 전선을 뒷받침하세요.</b><p>모든 시설은 Lv.3에서 시작합니다. 네 병종을 즉시 훈련하고 연구할 수 있습니다. K로 기지를 열어 시설을 강화하고 장군을 모집하세요.</p></div></article><article><span>04</span><div><b>거점을 확보하고 본부를 지키세요.</b><p>거점 점령은 자원 생산을 늘리고 본부의 폭풍 피해를 줄여 줍니다. 세 라이벌의 본부를 함락하면 승리합니다.</p></div></article></div><p class="dialog-tip">아군 100명과 적군 총 500명이 출전하는 싱글플레이 AI 대전입니다. 진행 상황은 현재 브라우저와 사이트 주소에 저장됩니다.</p>`, cancel: '지휘 준비 완료' });
  app.querySelector<HTMLButtonElement>('#preferences')!.onclick = () => {
    const p = readPreferences();
    showDialog({ eyebrow: 'PREFERENCES', title: '나에게 맞는 전장', body: '<div class="settings-grid"><label>그래픽 품질<select id="menu-quality"><option value="high">높음 · 그림자와 효과</option><option value="standard">보통 · 성능 우선</option><option value="low">낮음 · 저사양 기기</option></select></label><label>효과음<input id="menu-sound" type="checkbox"></label><label>움직임 줄이기<input id="menu-motion" type="checkbox"></label></div><p class="dialog-tip">게임에는 WebGL을 지원하는 브라우저가 필요합니다. 모바일에서는 가로 화면을 권장합니다.</p>', cancel: '설정 완료' });
    const quality = document.querySelector<HTMLSelectElement>('#menu-quality')!, sound = document.querySelector<HTMLInputElement>('#menu-sound')!, motion = document.querySelector<HTMLInputElement>('#menu-motion')!;
    quality.value = p.quality; sound.checked = p.sound; motion.checked = p.reducedMotion;
    const update = () => { p.quality = quality.value === 'high' ? 'high' : quality.value === 'low' ? 'low' : 'standard'; p.sound = sound.checked; p.reducedMotion = motion.checked; writePreferences(p); };
    quality.onchange = update; sound.onchange = update; motion.onchange = update;
  };
  void import('./battle/preview').then(({ createLandingPreview }) => {
    const mount = app.querySelector<HTMLElement>('#landing-preview');
    if (generation === currentGeneration && mount?.isConnected) disposePreview = createLandingPreview(mount);
  }).catch(() => undefined);
}
renderMenu();

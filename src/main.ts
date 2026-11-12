import './style.css';
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
  generation++; const currentGeneration = generation; disposePreview?.(); disposePreview = undefined;
  const saved = loadWar(), resumable = saved && saved.factions[0].alive && !saved.over;
  const career = readCareer();
  let launching = false;
  app.hidden = false;
  app.innerHTML = `
    <main class="landing" data-release="kingdoms-1.0">
      <div class="landing-grain" aria-hidden="true"></div>
      <header class="site-header">
        <a class="wordmark" href="#" aria-label="Waldo 왕국 전쟁 홈"><span class="brand-seal">${icon('crown', 24)}</span><span>WALDO<small>KINGDOMS AT WAR</small></span></a>
        <nav class="header-nav" aria-label="메뉴"><span class="offline-status"><i></i>1인 플레이 · AI 대전</span><button id="guide" class="nav-button">플레이 가이드 ${icon('help', 16)}</button><button id="preferences" class="icon-button" aria-label="게임 설정">${icon('settings', 20)}</button></nav>
      </header>
      <div class="landing-art" aria-hidden="true"><img src="${import.meta.env.BASE_URL}kingdom-art.svg" alt="" class="kingdom-illustration"><div class="landing-preview" id="landing-preview"></div><div class="art-vignette"></div><div class="art-coordinates"><span>THE EMERALD KINGDOM</span><i></i><small>북서부 영지 · 당신의 이야기가 시작되는 곳</small></div></div>
      <section class="hero-content">
        <div class="edition"><span></span>THE STRATEGY COLLECTION <b>01</b></div>
        <h1>작은 영지에서,<br><em>마지막 왕국으로.</em></h1>
        <p class="hero-description">수백 명의 병사를 직접 지휘하는 3D 전쟁. <br>100 대 500 대규모 군단전 또는 클래식 원정을 선택하세요.<br>거점을 점령하고 마지막 왕국이 되세요.</p>
        <div class="game-facts"><div><b>4</b><span>경쟁하는 왕국</span></div><div><b>9</b><span>전략 거점</span></div><div><b>4</b><span>개성 있는 병종</span></div></div>
        <div class="start-section"><div class="section-heading"><h2>원정 난이도</h2><span>시작 자원은 모두 동일</span></div><div class="difficulty-picker" role="group" aria-label="원정 난이도">${(['easy', 'normal', 'hard'] as Difficulty[]).map((key, i) => `<button id="difficulty-${key}" data-difficulty="${key}" class="difficulty-option${key === selectedDifficulty ? ' selected' : ''}" aria-pressed="${key === selectedDifficulty}"><span>${['I', 'II', 'III'][i]}</span><b>${DIFFICULTIES[key].label}</b><small>${['전략을 배우는 시간', '균형 잡힌 도전', '노련한 지휘관에게'][i]}</small></button>`).join('')}</div><p id="difficulty-description" class="difficulty-description">${DIFFICULTIES[selectedDifficulty].description}</p><div class="launch-actions"><button id="start-war" class="button primary launch-button">${icon('sword', 21)}새 원정 시작<span>${icon('arrow', 20)}</span></button><button id="start-grand" class="button grand-launch-button" aria-label="대규모 전쟁 시작, 아군 100명 대 적군 500명">⚔ 대규모 전쟁 <strong>100 VS 500</strong><small>병력 600명 동시 등장 · 군단 전투</small></button>${resumable ? `<button id="continue-war" class="button continue-button">${icon('play', 19)}이어하기<small>${DIFFICULTIES[saved.difficulty].label} · ${clock(saved.time)}</small></button>` : ''}</div><p class="play-note">설치 없이 플레이 · 15초마다 자동 저장 · 키보드와 터치 지원</p></div>
      </section>
      <aside class="campaign-note"><span class="note-line"></span><div><span class="kicker">BUILD. COMMAND. CONQUER.</span><p>왕국의 운명은<br>당신의 선택에 달려 있습니다.</p></div><span class="compass-rose" aria-hidden="true">${icon('target', 38)}</span></aside>
      <footer class="landing-footer"><span class="footer-credit">TEAM WALDO <i>/</i> KINGDOMS AT WAR</span><div class="career-inline">${career.matches ? `<span>완료한 원정 <b>${career.matches}</b></span><span>승리 <b>${career.wins}</b></span><span>최다 처치 <b>${career.bestKills}</b></span>` : '<span>당신의 첫 번째 왕국을 기다립니다.</span>'}</div><button id="legacy" class="text-button">클래식 서바이벌 ${icon('arrow', 14)}</button></footer>
    </main>`;
  document.title = 'WALDO · 왕국 전쟁 | 당신의 왕국을 건설하세요';
  const start = async (resume: boolean, grandBattle = false) => {
    if (launching) return; launching = true;
    const navigation = ++generation; disposePreview?.(); disposePreview = undefined;
    const button = app.querySelector<HTMLButtonElement>(resume ? '#continue-war' : grandBattle ? '#start-grand' : '#start-war')!;
    app.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.disabled = true; });
    button.textContent = '전장 준비 중…';
    try {
      const { openWar } = await import('./battle/view');
      if (generation !== navigation) return;
      app.hidden = true;
      openWar(renderMenu, { forceNew: !resume, difficulty: resume && saved ? saved.difficulty : selectedDifficulty, ...(grandBattle ? {grandBattle:true} : {}) });
    } catch {
      renderMenu();
      showDialog({ title: '전장을 불러오지 못했어요', body: '<p>네트워크 연결을 확인한 뒤 다시 시작해 주세요. 저장한 전투는 변경되지 않았습니다.</p>' });
    }
  };
  const launchNew = (grandBattle: boolean) => {
    if (resumable) showDialog({ eyebrow: 'NEW EXPEDITION', title: grandBattle ? '600명 규모의 전쟁을 시작할까요?' : '새로운 원정을 시작할까요?', body: '<p>새 원정이 자동 저장되면 이전 전투의 저장 내용을 덮어씁니다. 이전 전투를 계속하려면 이어하기를 선택하세요.</p>', confirm: '새 원정 시작', cancel: '돌아가기', onConfirm: () => { void start(false, grandBattle); } });
    else void start(false, grandBattle);
  };
  app.querySelector<HTMLButtonElement>('#start-war')!.onclick = () => launchNew(false);
  app.querySelector<HTMLButtonElement>('#start-grand')!.onclick = () => launchNew(true);
  app.querySelector<HTMLButtonElement>('#continue-war')?.addEventListener('click', () => { void start(true); });
  app.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(button => {
    button.onclick = () => {
      selectedDifficulty = button.dataset.difficulty as Difficulty;
      app.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(b => { const selected = b === button; b.classList.toggle('selected', selected); b.setAttribute('aria-pressed', String(selected)); });
      app.querySelector('#difficulty-description')!.textContent = DIFFICULTIES[selectedDifficulty].description;
    };
  });
  app.querySelector<HTMLButtonElement>('#guide')!.onclick = () => showDialog({ eyebrow: 'FIELD GUIDE', title: '첫 원정을 위한 네 가지 조언', body: `<div class="guide-steps"><article><span>01</span><div><b>먼저, 튼튼한 경제를.</b><p>금광과 농장을 Lv.2로 강화하세요. 성장 정책은 자원 생산을 25% 늘려 줍니다.</p></div></article><article><span>02</span><div><b>가까운 거점에 깃발을.</b><p>작전 탭에서 북서부 관문을 선택해 출전하세요. 거점마다 자원 보너스가 다르고, 본부 폭풍 피해도 줄어듭니다.</p></div></article><article><span>03</span><div><b>서로 다른 병종을 조합하세요.</b><p>병영 Lv.2에서 궁병과 연구, Lv.3에서 중장병과 기병을 해금합니다. 수비대는 본부를 지킵니다.</p></div></article><article><span>04</span><div><b>폭풍보다 빠르게 정복하세요.</b><p>2분 10초부터 안전지대가 줄어듭니다. 모든 적 본부를 함락하고 마지막 생존 왕국이 되세요.</p></div></article></div><p class="dialog-tip">온라인 멀티플레이가 아닌 1명 대 AI 3개 세력의 실시간 전략 게임입니다. 저장 내용은 현재 브라우저와 사이트 주소에만 보관됩니다.</p>`, cancel: '이제 시작해 볼게요' });
  app.querySelector<HTMLButtonElement>('#preferences')!.onclick = () => {
    const p = readPreferences();
    showDialog({ eyebrow: 'PREFERENCES', title: '나에게 맞는 전장', body: '<div class="settings-grid"><label>그래픽 품질<select id="menu-quality"><option value="high">높음 · 그림자와 효과</option><option value="standard">보통 · 성능 우선</option><option value="low">낮음 · 저사양 기기</option></select></label><label>효과음<input id="menu-sound" type="checkbox"></label><label>움직임 줄이기<input id="menu-motion" type="checkbox"></label></div><p class="dialog-tip">게임에는 WebGL을 지원하는 브라우저가 필요합니다. 모바일에서는 가로 화면을 권장합니다.</p>', cancel: '설정 완료' });
    const quality = document.querySelector<HTMLSelectElement>('#menu-quality')!, sound = document.querySelector<HTMLInputElement>('#menu-sound')!, motion = document.querySelector<HTMLInputElement>('#menu-motion')!;
    quality.value = p.quality; sound.checked = p.sound; motion.checked = p.reducedMotion;
    const update = () => { p.quality = quality.value === 'high' ? 'high' : quality.value === 'low' ? 'low' : 'standard'; p.sound = sound.checked; p.reducedMotion = motion.checked; writePreferences(p); };
    quality.onchange = update; sound.onchange = update; motion.onchange = update;
  };
  app.querySelector<HTMLButtonElement>('#legacy')!.onclick = async () => {
    if (launching) return; launching = true;
    const navigation = ++generation; disposePreview?.(); disposePreview = undefined;
    app.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = true; });
    app.querySelector<HTMLButtonElement>('#legacy')!.textContent = '클래식 모드 준비 중…';
    try { const { startLegacy } = await import('./legacy'); if (generation === navigation) startLegacy(app, renderMenu); }
    catch { renderMenu(); showDialog({ title: '클래식 모드를 불러오지 못했어요', body: '<p>네트워크 연결을 확인하고 다시 시도해 주세요.</p>' }); }
  };
  // The menu is fully useful before the optional decorative 3D chunk loads.
  void import('./battle/preview').then(({ createLandingPreview }) => {
    const mount = app.querySelector<HTMLElement>('#landing-preview');
    if (generation === currentGeneration && mount?.isConnected) disposePreview = createLandingPreview(mount);
  }).catch(() => undefined);
}
renderMenu();

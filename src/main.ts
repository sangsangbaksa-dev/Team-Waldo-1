import './style.css';
import './battle/war.css';
import { loadWar } from './battle/save';
import { DIFFICULTIES, type Difficulty } from './battle/war';
import { MAPS, MAP_IDS, getMap, type BattleMap, type MapId } from './battle/maps';
import { readPreferences, writePreferences, readCareer } from './battle/preferences';
import { icon } from './ui/icons';
import { showDialog } from './ui/dialog';

const app = document.querySelector<HTMLDivElement>('#game')!;
let disposePreview: (() => void) | undefined;
let generation = 0;
let selectedDifficulty: Difficulty = 'normal';
let selectedMap: MapId = 'classic';
const clock = (time: number) => `${Math.floor(time / 60)}분 ${Math.floor(time % 60)}초`;
const MAP_PRESENTATION: Record<MapId, { code: string; terrain: string; accent: string; background: string; art: string }> = {
  classic: { code: 'SECTOR 01 · INDUSTRIAL', terrain: '산업 지대 · 기본 전장', accent: '#73deca', background: '#173c3b', art: 'frontier-command.svg' },
  frontier: { code: 'SECTOR 02 · FRONTIER', terrain: '사막 변경 · 면적 2.25배', accent: '#e4b979', background: '#443c2e', art: 'frontier-desert.svg' },
  continental: { code: 'SECTOR 03 · CONTINENTAL', terrain: '설원 대륙 · 면적 4배', accent: '#9ecde7', background: '#284452', art: 'frontier-tundra.svg' },
};

/** Small authored atlas cards use the same headquarters and outposts as the simulation. */
function mapThumbnail(map: BattleMap): string {
  const { accent, background } = MAP_PRESENTATION[map.id];
  const scale = 77 / map.halfSize;
  const point = (x: number, z: number) => [100 + x * scale, 90 + z * scale];
  const routes = map.outposts.map((post, index) => {
    const [x, y] = point(post.x, post.z);
    const target = index < 9 ? [100, 90] : point(map.outposts[index % 4].x, map.outposts[index % 4].z);
    return `<path d="M${x.toFixed(1)} ${y.toFixed(1)}L${target[0].toFixed(1)} ${target[1].toFixed(1)}"/>`;
  }).join('');
  const posts = map.outposts.map((post, index) => {
    const [x, y] = point(post.x, post.z);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${index === 4 ? 3.8 : 2.4}" fill="${accent}"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${index === 4 ? 7.5 : 5}" fill="none" stroke="${accent}" opacity=".25"/>`;
  }).join('');
  const hqs = map.factionPositions.map(([x, z], index) => {
    const [a, b] = point(x, z);
    return `<rect x="${(a - 4).toFixed(1)}" y="${(b - 4).toFixed(1)}" width="8" height="8" rx="1" fill="${['#8be8cf', '#df8290', '#e0c17d', '#b29bdf'][index]}"/><rect x="${(a - 7).toFixed(1)}" y="${(b - 7).toFixed(1)}" width="14" height="14" rx="2" fill="none" stroke="${accent}" opacity=".2"/>`;
  }).join('');
  return `<svg viewBox="0 0 200 180" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path fill="${background}" d="M0 0h200v180H0z"/>
    <g stroke="${accent}" opacity=".06"><path d="M0 30h200M0 60h200M0 90h200M0 120h200M0 150h200M20 0v180M50 0v180M80 0v180M110 0v180M140 0v180M170 0v180"/></g>
    <g stroke="${accent}" opacity=".13"><path d="M-10 36C40 10 43 53 88 34s62 9 124-10M-10 44C32 21 53 64 93 44s72 9 119-11M-10 131c47-36 62 19 111-9s63 1 111-23M-10 141c42-33 64 17 116-6s61 0 106-23"/></g>
    <rect x="18" y="8" width="164" height="164" rx="4" stroke="${accent}" stroke-opacity=".24"/>
    <g stroke="${accent}" stroke-width="1" opacity=".3">${routes}</g>
    ${posts}${hqs}
    <path d="M25 26v-8h8M175 154v8h-8" stroke="${accent}" opacity=".7"/>
    <path d="m173 18-3 7h6l-3-7Z" fill="${accent}" opacity=".65"/>
  </svg>`;
}

function mapCard(id: MapId): string {
  const map = MAPS[id], selected = selectedMap === id;
  return `<button class="map-option${selected ? ' selected' : ''}" data-map="${id}" aria-pressed="${selected}" aria-label="${map.name}, ${map.halfSize * 2} 곱하기 ${map.halfSize * 2}, ${map.outposts.length}개 거점">
    <span class="map-thumb">${mapThumbnail(map)}</span>
    <span class="map-copy"><small>${MAP_PRESENTATION[id].code}</small><b>${map.name}</b><span>${MAP_PRESENTATION[id].terrain}</span><em>${map.halfSize * 2} × ${map.halfSize * 2}<i>/</i>거점 ${map.outposts.length}개</em></span>
    <span class="map-check" aria-hidden="true">${icon('check', 10)}</span>
  </button>`;
}

function renderMenu(): void {
  generation++;
  const currentGeneration = generation;
  disposePreview?.(); disposePreview = undefined;
  const saved = loadWar(), resumable = saved && saved.factions[0].alive && !saved.over;
  const career = readCareer();
  let launching = false, recordsLoading = false;
  app.hidden = false;
  app.innerHTML = `
    <main class="landing" data-release="kingdoms-1.0" data-edition="frontiers" data-battlefield="${selectedMap}">
      <div class="landing-grain" aria-hidden="true"></div>
      <header class="site-header">
        <a class="wordmark" href="#" aria-label="Waldo 왕국 전쟁 홈"><span class="brand-seal">${icon('crown', 24)}</span><span>WALDO<small>KINGDOMS AT WAR</small></span></a>
        <nav class="header-nav" aria-label="메뉴"><span class="offline-status"><i></i>1인 플레이 · AI 대전</span><button id="guide" class="nav-button">플레이 가이드 ${icon('help', 16)}</button><button id="preferences" class="icon-button" aria-label="게임 설정">${icon('settings', 20)}</button></nav>
      </header>
      <div class="frontier-shell">
        <section class="hero-grid" aria-labelledby="campaign-title">
          <div class="hero-content">
            <div class="edition"><span></span>THE FRONTIERS EXPANSION <b>작전 지휘소</b></div>
            <h1 id="campaign-title">더 넓은 전장,<br><em>당신의 지휘로.</em></h1>
            <p class="hero-description">작은 영지를 강력한 왕국으로. 자원을 모으고, 부대를 나누어 지휘하고, 세 개의 서로 다른 전장을 정복하세요.<br>모든 결정이 당신의 전선을 바꿉니다.</p>
            <div class="game-facts"><div><b>3</b><span>선택하는 전장</span></div><div><b>4</b><span>경쟁하는 왕국</span></div><div><b>600</b><span>대규모전<br>시작 병력</span></div></div>
          </div>
          <div class="landing-art" aria-hidden="true">
            <img src="${import.meta.env.BASE_URL}${MAP_PRESENTATION[selectedMap].art}" alt="" class="kingdom-illustration">
            <div class="landing-preview" id="landing-preview"></div><div class="art-vignette"></div>
            <div class="art-coordinates"><span>EMERALD COMMAND</span><i></i><small>${MAPS[selectedMap].name} · 에메랄드 본부 전경</small></div>
            <div class="art-status">${icon('shield', 21)}<div><strong>건설. 지휘. 정복.</strong><span>YOUR NEXT EXPEDITION AWAITS</span></div></div>
          </div>
        </section>
        <section class="command-deck" aria-labelledby="operation-heading">
          <div class="deck-heading"><div><h2 id="operation-heading">01 전장 선택</h2><span class="kicker">CHOOSE YOUR BATTLEFIELD</span></div><span><i></i>세 전장 모두 플레이 가능</span></div>
          <div class="map-picker" role="group" aria-label="전장 선택">${MAP_IDS.map(mapCard).join('')}</div>
          <p class="map-intel" id="map-description" role="status">${icon('map', 14)}<span>${MAPS[selectedMap].description}</span></p>
          <div class="departure-console">
            <div class="start-section">
              <div class="section-heading"><h2><span>02</span>원정 난이도</h2><span>AI 생산량과 공세 속도 조절</span></div>
              <div class="difficulty-picker" role="group" aria-label="원정 난이도">${(['easy', 'normal', 'hard'] as Difficulty[]).map((key, i) => `<button id="difficulty-${key}" data-difficulty="${key}" class="difficulty-option${key === selectedDifficulty ? ' selected' : ''}" aria-pressed="${key === selectedDifficulty}"><span>${['I', 'II', 'III'][i]}</span><b>${DIFFICULTIES[key].label}</b><small>${['전략을 배우는 시간', '균형 잡힌 도전', '노련한 지휘관에게'][i]}</small></button>`).join('')}</div>
              <p id="difficulty-description" class="difficulty-description">${DIFFICULTIES[selectedDifficulty].description}</p>
            </div>
            <div class="launch-column">
              <div class="launch-heading"><b>03 출격 준비</b><span id="launch-map-name">${MAPS[selectedMap].name} · ${DIFFICULTIES[selectedDifficulty].label}</span></div>
              <div class="launch-actions">
                <button id="start-war" class="button primary launch-button">${icon('sword', 21)}새 원정 시작<span>${icon('arrow', 19)}</span></button>
                <button id="start-grand" class="button grand-launch-button" aria-label="대규모 전쟁 시작, 아군 100명 대 적군 500명"><strong>100 VS 500</strong><small>대규모 전쟁 · 600명 동시 출전</small></button>
                ${resumable ? `<button id="continue-war" class="button continue-button"><span>${icon('play', 16)}저장한 원정 이어하기</span><small>${getMap(saved.mapId).name} · ${DIFFICULTIES[saved.difficulty].label} · ${clock(saved.time)}</small></button>` : ''}
              </div>
              <p class="play-note">설치 없이 플레이 · 15초마다 자동 저장 · 키보드와 터치 지원</p>
            </div>
          </div>
        </section>
      </div>
      <footer class="landing-footer"><span class="footer-credit">TEAM WALDO <i>/</i> FRONTIERS EXPANSION</span><div class="career-inline">${career.matches ? `<span>완료한 원정 <b>${career.matches}</b></span><span>승리 <b>${career.wins}</b></span><span>최다 처치 <b>${career.bestKills}</b></span>` : '<span>첫 번째 원정의 기록을 남겨 보세요.</span>'}</div><button id="records" class="text-button" aria-label="원정 기록과 업적 열기">${icon('chart', 14)}원정 기록 · 업적</button><button id="legacy" class="text-button">클래식 서바이벌 ${icon('arrow', 14)}</button></footer>
    </main>`;
  document.title = 'WALDO · Frontiers | 더 넓은 전장, 당신의 지휘로';
  let previewRevision = 0;
  const updatePreview = () => {
    const revision = ++previewRevision, mapId = selectedMap;
    disposePreview?.(); disposePreview = undefined;
    // Import/renderer work from a previous selection must not replace a newer preview.
    void import('./battle/preview').then(({ createLandingPreview }) => {
      const mount = app.querySelector<HTMLElement>('#landing-preview');
      if (generation === currentGeneration && previewRevision === revision && mount?.isConnected) {
        disposePreview = createLandingPreview(mount, mapId);
      }
    }).catch(() => undefined);
  };

  const start = async (resume: boolean, grandBattle = false) => {
    if (launching) return;
    launching = true;
    const navigation = ++generation;
    disposePreview?.(); disposePreview = undefined;
    const button = app.querySelector<HTMLButtonElement>(resume ? '#continue-war' : grandBattle ? '#start-grand' : '#start-war')!;
    app.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.disabled = true; });
    button.textContent = '전장 준비 중…';
    try {
      const { openWar } = await import('./battle/view');
      if (generation !== navigation) return;
      app.hidden = true;
      openWar(renderMenu, {
        forceNew: !resume,
        difficulty: resume && saved ? saved.difficulty : selectedDifficulty,
        ...(grandBattle ? { grandBattle: true } : {}),
        ...(!resume && selectedMap !== 'classic' ? { mapId: selectedMap } : {}),
      });
    } catch {
      renderMenu();
      showDialog({ title: '전장을 불러오지 못했어요', body: '<p>네트워크 연결을 확인한 뒤 다시 시작해 주세요. 저장한 전투는 변경되지 않았습니다.</p>' });
    }
  };
  const launchNew = (grandBattle: boolean) => {
    if (resumable) {
      showDialog({ eyebrow: 'NEW EXPEDITION', title: grandBattle ? '600명 규모의 전쟁을 시작할까요?' : '새로운 원정을 시작할까요?', body: `<p><strong>${MAPS[selectedMap].name}</strong>에서 ${DIFFICULTIES[selectedDifficulty].label} 난이도로 출전합니다.</p><p>새 원정이 자동 저장되면 이전 전투의 저장 내용을 덮어씁니다. 이전 전투를 계속하려면 이어하기를 선택하세요.</p>`, confirm: '새 원정 시작', cancel: '돌아가기', onConfirm: () => { void start(false, grandBattle); } });
    } else void start(false, grandBattle);
  };
  app.querySelector<HTMLButtonElement>('#start-war')!.onclick = () => launchNew(false);
  app.querySelector<HTMLButtonElement>('#start-grand')!.onclick = () => launchNew(true);
  app.querySelector<HTMLButtonElement>('#continue-war')?.addEventListener('click', () => { void start(true); });
  const updateLaunchLabel = () => {
    app.querySelector('#launch-map-name')!.textContent = `${MAPS[selectedMap].name} · ${DIFFICULTIES[selectedDifficulty].label}`;
  };
  app.querySelectorAll<HTMLButtonElement>('[data-map]').forEach(button => {
    button.onclick = () => {
      if (launching || selectedMap === button.dataset.map) return;
      selectedMap = button.dataset.map as MapId;
      app.querySelector<HTMLElement>('.landing')!.dataset.battlefield = selectedMap;
      app.querySelector<HTMLImageElement>('.kingdom-illustration')!.src = `${import.meta.env.BASE_URL}${MAP_PRESENTATION[selectedMap].art}`;
      app.querySelectorAll<HTMLButtonElement>('[data-map]').forEach(b => {
        const selected = b === button;
        b.classList.toggle('selected', selected); b.setAttribute('aria-pressed', String(selected));
      });
      app.querySelector('#map-description span')!.textContent = MAPS[selectedMap].description;
      app.querySelector('.art-coordinates small')!.textContent = `${MAPS[selectedMap].name} · 에메랄드 본부 전경`;
      updateLaunchLabel();
      updatePreview();
    };
  });
  app.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(button => {
    button.onclick = () => {
      if (launching) return;
      selectedDifficulty = button.dataset.difficulty as Difficulty;
      app.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(b => {
        const selected = b === button;
        b.classList.toggle('selected', selected); b.setAttribute('aria-pressed', String(selected));
      });
      app.querySelector('#difficulty-description')!.textContent = DIFFICULTIES[selectedDifficulty].description;
      updateLaunchLabel();
    };
  });
  app.querySelector<HTMLButtonElement>('#records')!.onclick = async () => {
    if (launching || recordsLoading) return;
    recordsLoading = true;
    const navigation = generation;
    try {
      const { showRecordsDialog } = await import('./battle/recordsUI');
      if (generation === navigation && !launching) showRecordsDialog();
    } catch {
      if (generation === navigation && !launching) showDialog({ title: '기록실을 불러오지 못했어요', body: '<p>잠시 후 다시 열어 주세요. 저장한 원정 기록은 변경되지 않았습니다.</p>' });
    } finally { recordsLoading = false; }
  };
  app.querySelector<HTMLButtonElement>('#guide')!.onclick = () => showDialog({
    eyebrow: 'FIELD GUIDE', title: '첫 원정을 위한 네 가지 조언',
    body: `<div class="guide-steps">
      <article><span>01</span><div><b>전장과 난이도를 고르세요.</b><p>강철 분지는 기본 전장, 황혼 변경은 면적 2.25배, 서리 대륙은 면적 4배입니다. 처음이라면 강철 분지와 입문 난이도로 시작해 보세요.</p></div></article>
      <article><span>02</span><div><b>튼튼한 경제가 긴 전선을 지킵니다.</b><p>금광과 농장을 강화하고 성장 정책으로 보급을 늘리세요. 기지 관리에서 건물을 배치하고 장군을 모집할 수 있습니다.</p></div></article>
      <article><span>03</span><div><b>세 부대에 서로 다른 임무를.</b><p>주력군, 기동대, 수비대로 병력을 나누고 거점이나 지도의 원하는 위치로 보내세요. 병영을 강화하면 궁병·중장병·기병과 연구를 해금합니다.</p></div></article>
      <article><span>04</span><div><b>거점을 잇고 폭풍에 대비하세요.</b><p>거점은 자원 생산과 본부의 폭풍 피해 감소에 도움이 됩니다. 넓은 전장은 폭풍이 더 늦게 시작합니다. 모든 적 본부를 함락하고 마지막 생존 왕국이 되세요.</p></div></article>
    </div><p class="dialog-tip">1명 대 AI 3개 세력의 실시간 전략 게임입니다. 원정 저장과 전적은 현재 브라우저와 사이트 주소에 보관됩니다. 직접 플레이에서는 낙하산 강하, 현장 탐험, 성벽 사격을 경험할 수 있습니다.</p>`, cancel: '이제 시작해 볼게요',
  });
  app.querySelector<HTMLButtonElement>('#preferences')!.onclick = () => {
    const p = readPreferences();
    showDialog({ eyebrow: 'PREFERENCES', title: '나에게 맞는 전장', body: '<div class="settings-grid"><label>그래픽 품질<select id="menu-quality"><option value="high">높음 · 그림자와 효과</option><option value="standard">보통 · 성능 우선</option><option value="low">낮음 · 저사양 기기</option></select></label><label>효과음<input id="menu-sound" type="checkbox"></label><label>움직임 줄이기<input id="menu-motion" type="checkbox"></label></div><p class="dialog-tip">게임에는 WebGL을 지원하는 브라우저가 필요합니다. 모바일에서는 가로 화면과 보통 또는 낮음 품질을 권장합니다. 대규모 전쟁의 실제 성능은 기기에 따라 달라집니다.</p>', cancel: '설정 완료' });
    const quality = document.querySelector<HTMLSelectElement>('#menu-quality')!;
    const sound = document.querySelector<HTMLInputElement>('#menu-sound')!;
    const motion = document.querySelector<HTMLInputElement>('#menu-motion')!;
    quality.value = p.quality; sound.checked = p.sound; motion.checked = p.reducedMotion;
    const update = () => {
      p.quality = quality.value === 'high' ? 'high' : quality.value === 'low' ? 'low' : 'standard';
      p.sound = sound.checked; p.reducedMotion = motion.checked; writePreferences(p);
    };
    quality.onchange = update; sound.onchange = update; motion.onchange = update;
  };
  app.querySelector<HTMLButtonElement>('#legacy')!.onclick = async () => {
    if (launching) return;
    launching = true;
    const navigation = ++generation;
    disposePreview?.(); disposePreview = undefined;
    app.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = true; });
    app.querySelector<HTMLButtonElement>('#legacy')!.textContent = '클래식 모드 준비 중…';
    try {
      const { startLegacy } = await import('./legacy');
      if (generation === navigation) startLegacy(app, renderMenu);
    } catch {
      renderMenu(); showDialog({ title: '클래식 모드를 불러오지 못했어요', body: '<p>네트워크 연결을 확인하고 다시 시도해 주세요.</p>' });
    }
  };
  // Every menu action works before this optional decorative 3D chunk loads.
  updatePreview();
}
renderMenu();

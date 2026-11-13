import './records.css';
import { icon } from '../ui/icons';
import { showDialog } from '../ui/dialog';
import { getMap, MAP_IDS } from './maps';
import { DIFFICULTIES } from './war';
import { readExpeditionRecords, expeditionAchievements, MAX_EXPEDITION_RECORDS,
  type ExpeditionRecord, type ExpeditionRecords } from './records';

const number = (value: number) => value.toLocaleString('ko-KR');
const duration = (seconds: number) => `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
const date = (timestamp: number) => new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(timestamp);

function recordCard(record: ExpeditionRecord): string {
  const map = getMap(record.mapId);
  return `<article class="expedition-record ${record.victory ? 'record-victory' : 'record-defeat'}" data-expedition-record="${record.id}">
    <header><span class="record-result">${icon(record.victory ? 'crown' : 'shield', 18)}${record.victory ? '승리' : '패배'}</span><div class="record-location"><h3>${map.name}</h3><span>${DIFFICULTIES[record.difficulty].label} · ${record.grandBattle ? '100 대 500 군단전' : '일반 원정'}</span></div><time datetime="${new Date(record.recordedAt).toISOString()}">${date(record.recordedAt)}</time></header>
    <div class="record-metrics"><span><small>전투 시간</small><b>${duration(record.seconds)}</b></span><span><small>적 처치</small><b>${number(record.kills)}</b></span><span><small>거점 점령</small><b>${number(record.captures)}</b></span><span><small>계약 수령</small><b>${record.contractsCompleted} / ${record.contractsTotal}</b></span><span><small>전장 지원</small><b>${number(record.supportUses)}회</b></span></div>
    <p class="record-detail">훈련 ${number(record.trained)}명 · 손실 ${number(record.lost)}명 · 연구 ${number(record.researches)}회 · 획득 금 ${number(record.goldEarned)}</p>
  </article>`;
}

function recordsMarkup(archive: ExpeditionRecords): string {
  const { totals } = archive;
  const achievements = expeditionAchievements(archive);
  const unlocked = achievements.filter(achievement => achievement.unlocked).length;
  return `<div class="records-summary" aria-label="완료한 원정의 누적 기록"><div><b>${number(totals.matches)}</b><span>완료한 전투</span></div><div><b>${number(totals.wins)}<small>승</small></b><span>${totals.matches ? `승률 ${Math.round(totals.wins / totals.matches * 100)}%` : '첫 승리를 기다립니다'}</span></div><div><b>${number(totals.kills)}</b><span>누적 적 처치</span></div><div><b>${unlocked}<small>/ ${achievements.length}</small></b><span>획득한 업적</span></div></div>
    <div class="records-map-wins" aria-label="전장별 누적 승리">${MAP_IDS.map(id => `<span data-record-map="${id}">${icon('flag', 13)}${getMap(id).name}<b>${number(totals.mapWins[id])}승</b></span>`).join('')}</div>
    <nav class="records-tabs" role="tablist" aria-label="원정 기록 분류"><button id="records-tab-history" data-records-tab="history" role="tab" aria-selected="true" aria-controls="records-history" tabindex="0">최근 전투 <span>${archive.records.length}</span></button><button id="records-tab-achievements" data-records-tab="achievements" role="tab" aria-selected="false" aria-controls="records-achievements" tabindex="-1">업적 <span>${unlocked} / ${achievements.length}</span></button></nav>
    <section id="records-history" role="tabpanel" aria-labelledby="records-tab-history"><p class="records-caption">최근 ${MAX_EXPEDITION_RECORDS}개 전투를 표시합니다. 누적 기록과 업적은 계속 남습니다.</p><div class="record-list">${archive.records.length ? archive.records.map(recordCard).join('') : `<div class="records-empty">${icon('flag', 35)}<h3>당신의 첫 기록을 기다립니다.</h3><p>원정을 끝내면 전투 결과와 활약이 이곳에 보관됩니다.<br>진행 중인 전투와 이전 버전의 전적은 별도로 유지됩니다.</p></div>`}</div></section>
    <section id="records-achievements" role="tabpanel" aria-labelledby="records-tab-achievements" hidden><p class="records-caption">완료한 원정에서 달성한 기록 배지입니다. 전투 능력이나 자원에는 영향을 주지 않습니다.</p><div class="achievement-grid">${achievements.map(achievement => `<article class="achievement-card${achievement.unlocked ? ' achievement-unlocked' : ''}" data-achievement="${achievement.id}"><span class="achievement-symbol">${icon(achievement.symbol, 25)}</span><div><div class="achievement-title"><h3>${achievement.title}</h3><span>${achievement.unlocked ? '획득' : '도전 중'}</span></div><p>${achievement.description}</p><div class="achievement-progress" role="progressbar" aria-label="${achievement.title}" aria-valuemin="0" aria-valuemax="${achievement.target}" aria-valuenow="${achievement.current}"><i style="width:${Math.round(achievement.current / achievement.target * 100)}%"></i></div><small>${achievement.unlockedAt !== null ? `${date(achievement.unlockedAt)} 획득` : `${achievement.current} / ${achievement.target}`}</small></div></article>`).join('')}</div></section>
    <p class="records-storage-note">기록은 현재 브라우저와 사이트 주소에 보관됩니다. 표시 시간은 한국 표준시입니다.</p>`;
}

/** One modal shares the existing Escape, focus restoration, and outside-inert behavior. */
export function showRecordsDialog(): () => void {
  const archive = readExpeditionRecords();
  const close = showDialog({ eyebrow: 'CAMPAIGN ARCHIVE', title: '원정 기록실', body: recordsMarkup(archive), cancel: '사령부로 돌아가기' });
  const root = document.querySelector<HTMLElement>('.game-dialog')!;
  root.classList.add('records-dialog');
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-records-tab]')];
  const activate = (tab: HTMLButtonElement, focus = false) => {
    for (const button of tabs) {
      const selected = button === tab;
      button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
      root.querySelector<HTMLElement>(`#records-${button.dataset.recordsTab}`)!.hidden = !selected;
    }
    if (focus) tab.focus();
  };
  for (const tab of tabs) {
    tab.onclick = () => activate(tab);
    tab.addEventListener('keydown', event => {
      const index = tabs.indexOf(tab);
      const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ?
        (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault(); event.stopPropagation(); activate(tabs[next], true);
    });
  }
  // Shared dialogs normally focus the close button. Open a long archive at its
  // title, then expose the two navigation tabs in the normal keyboard sequence.
  const heading = root.querySelector<HTMLElement>('#dialog-title')!;
  heading.tabIndex = -1; heading.focus({ preventScroll: true }); root.scrollTop = 0;
  return close;
}

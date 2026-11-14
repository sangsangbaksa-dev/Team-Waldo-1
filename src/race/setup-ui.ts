// SPEED RUSH — 출발 전 선택 화면(코스·랩 수·난이도·차량). DOM 만 쓰며 THREE 에 의존하지 않습니다.
import { CARS, LAP_OPTIONS, LEVELS, STAT_KEYS, STAT_LABELS, carById, levelById, sanitizeSetup, type RaceSetup } from './config';
import { MAPS, mapById } from './maps';
import { buildMapTrack } from './track';
import { fmtTime, raceRaceKey, type RaceRecords } from '../records';

const esc = (s: string): string => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

const outlineCache = new Map<string, { d: string; km: string }>();
/** 코스 윤곽선(SVG path)과 길이. 처음 한 번만 계산합니다. */
function outline(id: string): { d: string; km: string } {
  const hit = outlineCache.get(id); if (hit) return hit;
  const t = buildMapTrack(mapById(id)); let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < t.n; i++) { x0 = Math.min(x0, t.x[i]); x1 = Math.max(x1, t.x[i]); z0 = Math.min(z0, t.z[i]); z1 = Math.max(z1, t.z[i]); }
  const W = 120, H = 64, pad = 6, s = Math.min((W - pad * 2) / (x1 - x0), (H - pad * 2) / (z1 - z0)), ox = (W - (x1 - x0) * s) / 2, oz = (H - (z1 - z0) * s) / 2;
  let d = ''; for (let i = 0; i < t.n; i += 5) d += `${i ? 'L' : 'M'}${(ox + (t.x[i] - x0) * s).toFixed(1)} ${(oz + (t.z[i] - z0) * s).toFixed(1)}`;
  const out = { d: d + 'Z', km: (t.length / 1000).toFixed(1) }; outlineCache.set(id, out); return out;
}

export interface SetupHandle { read(): RaceSetup; destroy(): void }

export function mountSetup(host: HTMLElement, initial: RaceSetup, records: RaceRecords, cb: { onStart: (s: RaceSetup) => void; onExit: () => void }): SetupHandle {
  let cur = sanitizeSetup(initial);
  const root = document.createElement('div'); root.className = 'rc-setup'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', '레이스 설정');
  const mapCard = (m: (typeof MAPS)[number]): string => { const o = outline(m.id); return `<button type="button" class="rc-opt rc-map" data-pick="map:${m.id}"><svg viewBox="0 0 120 64" aria-hidden="true"><path d="${o.d}"/></svg><span class="rc-opt-name">${esc(m.name)}</span><span class="rc-opt-sub">${esc(m.place)} · ${o.km}km</span></button>`; };
  const carCard = (c: (typeof CARS)[number]): string => `<button type="button" class="rc-opt rc-car" data-pick="car:${c.id}"><span class="rc-car-head"><i style="background:${c.color}"></i><b>${c.name}</b><em>${c.role}</em></span><span class="rc-stats">${STAT_KEYS.map(k => `<span class="rc-stat"><label>${STAT_LABELS[k]}</label><span class="bar" role="img" aria-label="${STAT_LABELS[k]} ${c.points[k]} / 5"><span style="width:${c.points[k] * 20}%"></span></span></span>`).join('')}</span></button>`;
  root.innerHTML = `
    <div class="rc-setup-inner">
      <header><span class="rc-eyebrow">SPEED RUSH</span><h2>레이스 설정</h2></header>
      <div class="rc-setup-cols">
        <div class="rc-setup-col">
          <section><h3>코스</h3><div class="rc-grid maps">${MAPS.map(mapCard).join('')}</div><p class="rc-note" data-note="map"></p></section>
          <section><h3>종목</h3><div class="rc-seg" data-seg="laps">${LAP_OPTIONS.map(n => `<button type="button" class="rc-opt" data-pick="laps:${n}">${n}랩</button>`).join('')}</div><p class="rc-note" data-note="record"></p></section>
          <section><h3>난이도</h3><div class="rc-seg lv" data-seg="level">${LEVELS.map(l => `<button type="button" class="rc-opt" data-pick="level:${l.id}"><b>${l.id}</b>${l.name}</button>`).join('')}</div><p class="rc-note" data-note="level"></p></section>
        </div>
        <section class="rc-setup-col"><h3>차량</h3><div class="rc-grid cars">${CARS.map(carCard).join('')}</div><p class="rc-note" data-note="car"></p></section>
      </div>
      <footer><button type="button" class="ghost" data-setup="exit">메뉴로</button><span class="rc-pick" data-note="summary"></span><button type="button" class="primary" data-setup="start">출발</button></footer>
    </div>`;
  host.append(root);
  const note = (k: string): HTMLElement => root.querySelector<HTMLElement>(`[data-note="${k}"]`)!;

  function paint(): void {
    const map = mapById(cur.map), car = carById(cur.car), lv = levelById(cur.level);
    root.querySelectorAll<HTMLElement>('[data-pick]').forEach(b => { const [k, v] = b.dataset.pick!.split(':'); const on = String(cur[k as keyof RaceSetup]) === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    note('map').textContent = map.blurb; note('level').textContent = lv.blurb; note('car').textContent = `${car.name} · ${car.role} — ${car.blurb}`;
    const lap = records.bestLap[map.id], race = records.bestRace[raceRaceKey(map.id, cur.laps)];
    note('record').textContent = lap !== undefined || race !== undefined ? `${map.name} 최고 랩 ${lap !== undefined ? fmtTime(lap) : '--'} · ${cur.laps}랩 최고 ${race !== undefined ? fmtTime(race) : '--'}` : '기록 없음';
    note('summary').textContent = `${map.name} · ${cur.laps}랩 · ${lv.name} · ${car.name}`;
  }
  root.addEventListener('click', e => {
    const t = e.target as HTMLElement, pick = t.closest<HTMLElement>('[data-pick]'), act = t.closest<HTMLElement>('[data-setup]');
    if (pick) { const [k, v] = pick.dataset.pick!.split(':'); cur = sanitizeSetup({ ...cur, [k]: k === 'laps' || k === 'level' ? Number(v) : v }); paint(); }
    else if (act?.dataset.setup === 'start') cb.onStart(cur);
    else if (act?.dataset.setup === 'exit') cb.onExit();
  });
  paint();
  return { read: () => cur, destroy: () => root.remove() };
}

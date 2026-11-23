import { CARS, LAP_OPTIONS, LEVELS, SKINS, STAT_KEYS, STAT_LABELS, carById, levelById, paintOf, sanitizeSetup, type RaceSetup } from './config';
import { MAPS, mapById } from './maps';
import { buildMapTrack } from './track';
import { buySkin, ownsSkin, writeGarage, type Garage } from './garage';
import { readGhost } from './ghost';
import { fmtTime, raceRaceKey, type RaceRecords } from '../records';

const esc = (s: string): string => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

const outlineCache = new Map<string, { d: string; km: string }>();
function outline(id: string): { d: string; km: string } {
  const hit = outlineCache.get(id); if (hit) return hit;
  const t = buildMapTrack(mapById(id)); let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < t.n; i++) { x0 = Math.min(x0, t.x[i]); x1 = Math.max(x1, t.x[i]); z0 = Math.min(z0, t.z[i]); z1 = Math.max(z1, t.z[i]); }
  const W = 120, H = 64, pad = 6, s = Math.min((W - pad * 2) / (x1 - x0), (H - pad * 2) / (z1 - z0)), ox = (W - (x1 - x0) * s) / 2, oz = (H - (z1 - z0) * s) / 2;
  let d = ''; for (let i = 0; i < t.n; i += 5) d += `${i ? 'L' : 'M'}${(ox + (t.x[i] - x0) * s).toFixed(1)} ${(oz + (t.z[i] - z0) * s).toFixed(1)}`;
  const out = { d: d + 'Z', km: (t.length / 1000).toFixed(1) }; outlineCache.set(id, out); return out;
}

export interface SetupHandle { read(): RaceSetup; destroy(): void }

export function mountSetup(host: HTMLElement, initial: RaceSetup, records: RaceRecords, garage: { value: Garage }, cb: { onStart: (s: RaceSetup) => void; onExit: () => void; onPvp?: (s: RaceSetup) => void }): SetupHandle {
  let cur = sanitizeSetup(initial);
  if (!ownsSkin(garage.value, cur.skin)) cur = { ...cur, skin: 'stock' };
  const root = document.createElement('div'); root.className = 'rc-setup'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', '레이스 설정');
  const mapCard = (m: (typeof MAPS)[number]): string => { const o = outline(m.id); return `<button type="button" class="rc-opt rc-map" data-pick="map:${m.id}" ><svg viewBox="0 0 120 64" aria-hidden="true"><path d="${o.d}"/></svg><span class="rc-opt-name">${esc(m.name)}</span><span class="rc-opt-sub">${esc(m.place)} · ${o.km}km</span></button>`; };
  const carCard = (c: (typeof CARS)[number]): string => `<button type="button" class="rc-opt rc-car" data-pick="car:${c.id}" style="--car:${c.color}"><span class="rc-car-head"><i style="background:${c.color}"></i><b>${c.name}</b><em>${c.role}</em></span><span class="rc-stats">${STAT_KEYS.map(k => `<span class="rc-stat"><label>${STAT_LABELS[k]}</label><span class="bar" role="img" aria-label="${STAT_LABELS[k]} ${c.points[k]} / 5"><span style="width:${c.points[k] * 20}%"></span></span></span>`).join('')}</span></button>`;
  root.innerHTML = `
    <div class="rc-setup-inner">
      <header><span class="rc-eyebrow">SPEED RUSH</span><h2>레이스 준비</h2></header>
      <div class="rc-setup-cols">
        <div class="rc-setup-col">
          <section><h3>코스</h3><div class="rc-grid maps">${MAPS.map(mapCard).join('')}</div><p class="rc-note" data-note="map"></p></section>
          <section><h3>모드</h3><div class="rc-seg" data-seg="mode"><button type="button" class="rc-opt" data-pick="mode:race">레이스</button><button type="button" class="rc-opt" data-pick="mode:trial">타임어택</button></div><p class="rc-note" data-note="mode"></p></section>
          <section><h3>랩 수</h3><div class="rc-seg" data-seg="laps">${LAP_OPTIONS.map(n => `<button type="button" class="rc-opt" data-pick="laps:${n}">${n}랩</button>`).join('')}</div><p class="rc-note" data-note="record"></p></section>
          <section><h3>난이도</h3><div class="rc-seg lv" data-seg="level">${LEVELS.map(l => `<button type="button" class="rc-opt" data-pick="level:${l.id}"><b>${l.id}</b>${l.name}</button>`).join('')}</div><p class="rc-note" data-note="level"></p></section>
        </div>
        <section class="rc-setup-col"><h3>차량</h3><div class="rc-grid cars">${CARS.map(carCard).join('')}</div><p class="rc-note" data-note="car"></p><div class="rc-garage" data-garage></div></section>
      </div>
      <footer><button type="button" class="ghost" data-setup="exit">메뉴로</button><span class="rc-pick" data-note="summary"></span>${cb.onPvp ? '<button type="button" data-setup="pvp">온라인 대전</button>' : ''}<button type="button" class="primary" data-setup="start">레이스 시작</button></footer>
    </div>`;
  host.append(root);
  const note = (k: string): HTMLElement => root.querySelector<HTMLElement>(`[data-note="${k}"]`)!;

  function paintGarage(): void {
    const car = carById(cur.car), box = root.querySelector<HTMLElement>('[data-garage]')!;
    const paintRow = SKINS.map(k => { const pt = paintOf(car, k.id), own = ownsSkin(garage.value, k.id), can = garage.value.coins >= k.cost;
      return own ? `<button type="button" class="rc-skin" data-pick="skin:${k.id}" title="${esc(k.name)}" style="--c:${pt.color};--a:${pt.accent}"><i></i><span>${esc(k.name)}</span></button>` : `<button type="button" class="rc-skin locked" data-buyskin="${k.id}" title="${esc(k.name)} ${k.cost}코인" style="--c:${pt.color};--a:${pt.accent}"${can ? '' : ' disabled'}><i></i><span>${esc(k.name)} · ${k.cost}</span></button>`; }).join('');
    box.innerHTML = `<div class="rc-garage-head"><h3>차량 도장</h3><span class="rc-coins" aria-label="보유 코인">${garage.value.coins.toLocaleString('ko-KR')} 코인</span></div><div class="rc-skins" role="group" aria-label="도장">${paintRow}</div><p class="rc-note">도장은 외형만 바뀝니다. 성능에는 영향을 주지 않습니다.</p>`;
  }
  function paint(): void {
    paintGarage();
    const map = mapById(cur.map), car = carById(cur.car), lv = levelById(cur.level);
    root.querySelectorAll<HTMLElement>('[data-pick]').forEach(b => { const [k, v] = b.dataset.pick!.split(':'); const on = String(cur[k as keyof RaceSetup]) === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    note('map').textContent = map.blurb; note('level').textContent = lv.blurb; note('car').textContent = `${car.name} · ${car.role} — ${car.blurb}`;
    const lap = records.bestLap[map.id], race = records.bestRace[raceRaceKey(map.id, cur.laps)];
    const ghost = cur.mode === 'trial' ? readGhost(map.id, cur.laps, car.id) : null;
    note('mode').textContent = cur.mode === 'trial'
      ? ghost ? `개인 기록 주행 · 저장된 고스트 ${fmtTime(ghost.time)}` : '개인 기록 주행 · 첫 완주 후 고스트가 저장됩니다.'
      : '컴퓨터 차량 3대와 경쟁합니다. 제동 지점과 코너 탈출이 순위를 가릅니다.';
    root.querySelector<HTMLElement>('[data-seg="level"]')?.closest('section')?.toggleAttribute('hidden', cur.mode === 'trial');
    note('record').textContent = lap !== undefined || race !== undefined ? `${map.name} 최고 랩 ${lap !== undefined ? fmtTime(lap) : '--'} · ${cur.laps}랩 최고 ${race !== undefined ? fmtTime(race) : '--'}` : '기록 없음';
    note('summary').textContent = `${map.name} · ${cur.laps}랩 · ${cur.mode === 'trial' ? '타임어택' : lv.name} · ${car.name}`;
  }
  root.addEventListener('click', e => {
    const t = e.target as HTMLElement, pick = t.closest<HTMLElement>('[data-pick]'), act = t.closest<HTMLElement>('[data-setup]');
    const skin = t.closest<HTMLElement>('[data-buyskin]');
    const focusSkin = (): void => root.querySelector<HTMLButtonElement>(`[data-pick="skin:${cur.skin}"]`)?.focus();
    if (skin) {
      const next = buySkin(garage.value, skin.dataset.buyskin!);
      if (next) {
        garage.value = next; writeGarage(next);
        cur = sanitizeSetup({ ...cur, skin: skin.dataset.buyskin });
        paint(); focusSkin();
      }
      return;
    }
    if (pick) {
      const [k, v] = pick.dataset.pick!.split(':');
      cur = sanitizeSetup({ ...cur, [k]: k === 'laps' || k === 'level' ? Number(v) : v });
      paint();
      if (k === 'skin') focusSkin();
    }
    else if (act?.dataset.setup === 'start') cb.onStart(cur);
    else if (act?.dataset.setup === 'pvp') cb.onPvp?.(cur);
    else if (act?.dataset.setup === 'exit') cb.onExit();
  });
  paint();
  return { read: () => cur, destroy: () => root.remove() };
}

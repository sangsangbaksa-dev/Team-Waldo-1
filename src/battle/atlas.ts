import './atlas.css';
import { icon } from '../ui/icons';
import { mapDefinitionFor, outpostName, outpostBonus } from './maps';
import { minimapToWorld, pickMapTarget } from './mapCommands';
import { drawStrategicMap } from './strategicMap';
import { SQUAD_NAMES, squadUnits, squadOf, type SquadId } from './squads';
import type { War } from './war';

export function atlasMarkup(war: War): string {
  const map = mapDefinitionFor(war);
  return `<div class="atlas-meta"><span>${map.halfSize * 2} × ${map.halfSize * 2} m</span><span>${war.outposts.length}개 전략 거점</span><span>전투 일시정지</span></div>
    <div class="atlas-layout"><div class="atlas-main"><canvas id="atlas-map" width="560" height="560" tabindex="0" role="application" aria-label="전체 작전 지도. 방향키로 위치 선택, 아래 출전 버튼으로 명령"></canvas>
      <div class="atlas-legend"><span><i class="atlas-friendly"></i>아군</span><span><i class="atlas-neutral"></i>중립 거점</span><span><i class="atlas-hostile"></i>적군</span><span>점선: 부대 경로</span></div></div>
      <aside class="atlas-sidebar"><div class="section-heading"><h3>지휘할 부대</h3></div><div class="atlas-squads" role="group" aria-label="지도에서 지휘할 부대">${SQUAD_NAMES.map((name, id) => `<button data-atlas-squad="${id}" aria-pressed="false">${name}<small>${squadUnits(war, id as SquadId).length}명</small></button>`).join('')}</div>
        <p class="atlas-help">지도를 누르거나 목록에서 목적지를 고르세요. 선택한 부대만 명령을 따릅니다.</p>
        <div id="atlas-selection-text" class="atlas-selection" role="status"></div>
        <div class="atlas-actions"><button id="atlas-center" class="button secondary">${icon('target', 15)}시점 이동</button><button id="atlas-order" class="button primary">${icon('flag', 15)}부대 출전</button></div>
        <div class="section-heading"><h3>전략 거점</h3><span>선택해서 상세 보기</span></div><div class="atlas-posts">${war.outposts.map(post => `<button data-atlas-post="${post.id}"><span>${outpostName(war, post.id)}</span><small>${post.owner === null ? '중립' : post.owner === 0 ? '아군' : '적군'}</small></button>`).join('')}</div>
      </aside></div>`;
}

/** Live, straight-line intelligence; it does not claim pathfinding or predict arrival time. */
export function atlasSituation(war: War, squad: SquadId, target: { x: number; z: number }): {
  members: number; straightDistance: number | null; nearbyEnemies: number;
  outsideZone: boolean; occupation: string | null;
} {
  const members = war.units.filter(unit => unit.owner === 0 && unit.hp > 0 && squadOf(unit) === squad);
  const centroid = members.length ? {
    x: members.reduce((sum, unit) => sum + unit.x, 0) / members.length,
    z: members.reduce((sum, unit) => sum + unit.z, 0) / members.length,
  } : null;
  const nearbyEnemies = war.units.filter(unit =>
    unit.owner !== 0 && unit.hp > 0 && war.factions[unit.owner]?.alive &&
    Math.hypot(unit.x - target.x, unit.z - target.z) <= 30).length;
  const picked = pickMapTarget(war, 0, target.x, target.z);
  const post = picked?.kind === 'outpost' ? war.outposts[picked.id] : undefined;
  const owners = ['아군', '적색', '황색', '보라'];
  const occupation = !post ? null :
    post.contender !== null && post.progress > 0 ?
      `${owners[post.contender] ?? '다른 세력'} 점령 진행 ${Math.round(post.progress)}%` :
      post.owner === null ? '중립 거점' : `${owners[post.owner] ?? '다른 세력'} 점령 거점`;
  return {
    members: members.length,
    straightDistance: centroid ? Math.round(Math.hypot(centroid.x - target.x, centroid.z - target.z)) : null,
    nearbyEnemies,
    outsideZone: Math.hypot(target.x, target.z) > war.zone,
    occupation,
  };
}

interface AtlasControls {
  squad(): SquadId;
  selectSquad(squad: SquadId): void;
  viewAt(x: number, z: number): void;
  orderAt(x: number, z: number): void;
  viewport(): ReadonlyArray<{ x: number; z: number }>;
}

export function bindAtlas(root: HTMLElement, war: War, controls: AtlasControls): void {
  root.classList.add('atlas-dialog');
  const canvas = root.querySelector<HTMLCanvasElement>('#atlas-map')!;
  const context = canvas.getContext('2d');
  const map = mapDefinitionFor(war);
  const selected = { x: war.factions[0].x, z: war.factions[0].z };
  const details = root.querySelector<HTMLElement>('#atlas-selection-text')!;
  const order = root.querySelector<HTMLButtonElement>('#atlas-order')!;
  const clamp = (value: number) => Math.max(-map.halfSize + 5, Math.min(map.halfSize - 5, value));
  const refresh = () => {
    const squad = controls.squad(), target = pickMapTarget(war, 0, selected.x, selected.z);
    if (context) drawStrategicMap(context, war, { size: canvas.width, selectedSquad: squad, labels: true, selectedPoint: selected, viewport: controls.viewport() });
    const atHome = Math.hypot(selected.x - war.factions[0].x, selected.z - war.factions[0].z) < 17;
    let title = atHome ? '내 본부 · 부대 복귀' : '지정 위치로 이동';
    let detail = `좌표 ${Math.round(selected.x)}, ${Math.round(selected.z)}`;
    if (target?.kind === 'outpost') {
      const bonus = outpostBonus(war, target.id);
      title = outpostName(war, target.id); detail = `금 +${bonus.gold}/초 · 식량 +${bonus.food}/초`;
    } else if (target?.kind === 'faction') { title = ['에메랄드', '적색', '황색', '보라'][target.id] + ' 본부 공격'; detail = `내구도 ${Math.ceil(war.factions[target.id].hp)} / ${war.factions[target.id].maxHp}`; }
    const intel = atlasSituation(war, squad, selected);
    details.replaceChildren();
    const name = document.createElement('b'), description = document.createElement('span');
    const route = document.createElement('span'), risk = document.createElement('small');
    name.textContent = title;
    description.textContent = detail;
    route.textContent = intel.members
      ? `${SQUAD_NAMES[squad]} ${intel.members}명 · 직선 거리 ${intel.straightDistance}m`
      : `${SQUAD_NAMES[squad]}에 생존 병력 없음 · 출전 불가`;
    risk.textContent = [
      intel.occupation,
      intel.nearbyEnemies ? `인근 적 병력 ${intel.nearbyEnemies}명 (반경 30m)` : '인근 적 병력 관측 없음 (반경 30m)',
      intel.outsideZone ? '현재 폭풍 안전 구역 밖' : '현재 폭풍 안전 구역 안',
    ].filter(Boolean).join(' · ');
    risk.classList.toggle('atlas-risk', intel.nearbyEnemies > 0 || intel.outsideZone);
    details.append(name, description, route, risk);
    canvas.setAttribute('aria-label', `전체 작전 지도. 선택 ${title}, 좌표 ${Math.round(selected.x)}, ${Math.round(selected.z)}. 방향키로 이동하세요.`);
    order.disabled = war.over || !war.factions[0].alive || squadUnits(war, squad).length === 0;
    order.textContent = `${SQUAD_NAMES[squad]} ${atHome ? '복귀' : '출전'}`;
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-atlas-squad]')) button.setAttribute('aria-pressed', String(Number(button.dataset.atlasSquad) === squad));
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-atlas-post]')) button.classList.toggle('selected', target?.kind === 'outpost' && Number(button.dataset.atlasPost) === target.id);
  };
  canvas.addEventListener('click', event => {
    const box = canvas.getBoundingClientRect(), point = minimapToWorld(event.clientX - box.left, event.clientY - box.top, box.width, box.height, war.mapId);
    selected.x = clamp(point.x); selected.z = clamp(point.z); refresh();
  });
  canvas.addEventListener('keydown', event => {
    const delta: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!delta[event.key]) return;
    event.preventDefault(); event.stopPropagation();
    const [dx, dz] = delta[event.key], step = map.halfSize / (event.shiftKey ? 5 : 20);
    selected.x = clamp(selected.x + dx * step); selected.z = clamp(selected.z + dz * step); refresh();
  });
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-atlas-post]')) button.onclick = () => {
    const post = war.outposts[Number(button.dataset.atlasPost)]; selected.x = post.x; selected.z = post.z; refresh();
  };
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-atlas-squad]')) button.onclick = () => { controls.selectSquad(Number(button.dataset.atlasSquad) as SquadId); refresh(); };
  root.querySelector<HTMLButtonElement>('#atlas-center')!.onclick = () => controls.viewAt(selected.x, selected.z);
  order.onclick = () => { if (!order.disabled) controls.orderAt(selected.x, selected.z); };
  refresh();
}

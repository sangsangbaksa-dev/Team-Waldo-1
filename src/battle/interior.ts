import { getBaseState, workshopLevel } from './base';
import { interiorOption, performInteriorAction, type InteriorAction } from './interiorActions';
import type { Upgrade, War } from './war';

export interface BuildingInterior {
  enter(slot: number): boolean;
  leave(): void;
  isInside(): boolean;
  refresh(): void;
}

const ROOMS: Record<Upgrade, {
  name: string; subtitle: string; blurb: string; machine: string; chamber: string; badge: string;
}> = {
  mine: {
    name: '지하 금광', subtitle: 'DEEP ORE EXTRACTION · MINING GUILD',
    blurb: '갱도 안의 채굴 설비를 증설하고, 급할 때 식량을 지급해 금을 반출할 수 있습니다.',
    machine: '◈', chamber: '광맥 채굴실', badge: '채광 가동 중',
  },
  farm: {
    name: '왕립 농장', subtitle: 'GREENHOUSE & ROYAL PROVISIONS',
    blurb: '따뜻한 온실에서 식량 생산을 확장하고, 비축 물자를 수확하거나 성장 정책을 선택합니다.',
    machine: '✦', chamber: '황금빛 온실', badge: '생장 설비 가동',
  },
  barracks: {
    name: '왕립 병영', subtitle: 'TACTICAL ACADEMY · ARMORY',
    blurb: '훈련소에서 보병을 모집하고, 병영을 확장해 새 병종과 강철 무기 연구를 해금하세요.',
    machine: '⚔', chamber: '정예 훈련관', badge: '훈련소 운영 중',
  },
  fort: {
    name: '성채 방어탑', subtitle: 'FORTIFICATION · DEFENSE COMMAND',
    blurb: '성채 내부 지휘실에서 방벽을 증축하고, 본부를 수리하거나 수비대를 소집하세요.',
    machine: '♜', chamber: '성벽 통제실', badge: '방어 체계 가동',
  },
};

const ACTIONS: InteriorAction[] = ['upgrade', 'workshop', 'service', 'special'];

/** A persistent, keyboard-accessible interior scene mounted inside the base manager. */
export function createBuildingInterior(
  parent: HTMLElement,
  war: War,
  onChange: (message: string) => void,
  onBack: () => void,
): BuildingInterior {
  let currentSlot: number | null = null;
  const root = document.createElement('section');
  root.className = 'base-interior';
  root.hidden = true;
  root.setAttribute('aria-label', '시설 내부와 현장 작업');
  root.innerHTML =
    '<div class="interior-nav">' +
      '<button type="button" class="interior-back" data-interior-back>← 기지 설계도로 돌아가기</button>' +
      '<span class="interior-sector">WALDO · INTERIOR OPERATIONS</span>' +
    '</div>' +
    '<div class="interior-layout">' +
      '<div class="interior-view">' +
        '<div class="interior-scene" data-interior-kind="mine" role="group" aria-label="건물 내부 설비와 작업 버튼">' +
          '<div class="interior-light"></div><div class="interior-wall"></div>' +
          '<div class="interior-window"><span></span><span></span><span></span></div>' +
          '<div class="interior-beam left"></div><div class="interior-beam right"></div>' +
          '<div class="interior-floor"></div>' +
          '<div class="interior-machinery">' +
            '<div class="interior-prop prop-left"><span></span><i></i></div>' +
            '<div class="interior-prop prop-right"><span></span><i></i></div>' +
            '<div class="interior-hologram"><span id="interior-symbol"></span></div>' +
            '<div class="interior-platform"></div>' +
          '</div>' +
          '<div class="interior-view-top"><span id="interior-chamber"></span><b id="interior-badge"></b></div>' +
          '<button type="button" class="interior-hotspot hotspot-upgrade" data-interior-command="upgrade"><span>✦</span>설비 확장</button>' +
          '<button type="button" class="interior-hotspot hotspot-service" data-interior-command="service"><span>⚙</span>현장 작업</button>' +
          '<button type="button" class="interior-hotspot hotspot-workshop" data-interior-command="workshop"><span>◈</span>특수 설비</button>' +
        '</div>' +
        '<p class="interior-view-caption">직접 들어온 시설의 내부입니다. 설비를 누르거나 오른쪽 작업 메뉴에서 업그레이드를 진행하세요.</p>' +
      '</div>' +
      '<aside class="interior-console">' +
        '<span id="interior-subtitle" class="interior-eyebrow"></span>' +
        '<h3 id="interior-title"></h3><p id="interior-blurb"></p>' +
        '<div class="interior-status">' +
          '<div><small>시설 단계</small><strong id="interior-level"></strong></div>' +
          '<div><small>왕국 금</small><strong id="interior-gold"></strong></div>' +
          '<div><small>왕국 식량</small><strong id="interior-food"></strong></div>' +
          '<div><small>전용 설비</small><strong id="interior-workshop-level"></strong></div>' +
        '</div>' +
        '<div class="interior-console-heading">현장 작업 지시 <span>자원 비용과 현재 상태 적용</span></div>' +
        '<div class="interior-actions">' +
          ACTIONS.map(action =>
            '<button type="button" class="interior-action" data-interior-command="' + action + '">' +
              '<span class="interior-action-name" data-interior-name="' + action + '"></span>' +
              '<span class="interior-action-description" data-interior-description="' + action + '"></span>' +
              '<span class="interior-action-price" data-interior-price="' + action + '"></span>' +
            '</button>'
          ).join('') +
        '</div>' +
        '<p class="interior-message" id="interior-message" role="status" aria-live="polite">건설 효과는 전장과 자원 생산에 즉시 적용됩니다.</p>' +
      '</aside>' +
    '</div>';
  parent.insertBefore(root, parent.querySelector('.base-footer'));
  const one = <T extends HTMLElement = HTMLElement>(selector: string): T => root.querySelector<T>(selector)!;
  const refresh = () => {
    if (currentSlot === null || root.hidden) return;
    const structure = getBaseState(war).structures.find(item => item.slot === currentSlot);
    if (!structure) { onBack(); return; }
    const kind = structure.kind, room = ROOMS[kind], faction = war.factions[0];
    one('.interior-scene').dataset.interiorKind = kind;
    one('#interior-title').textContent = room.name;
    one('#interior-subtitle').textContent = room.subtitle;
    one('#interior-blurb').textContent = room.blurb;
    one('#interior-symbol').textContent = room.machine;
    one('#interior-chamber').textContent = room.chamber + ' · 구획 ' + (currentSlot + 1);
    one('#interior-badge').textContent = room.badge;
    one('#interior-level').textContent = 'Lv.' + faction[kind] + ' / 4';
    one('#interior-gold').textContent = Math.floor(faction.gold).toLocaleString('ko-KR');
    one('#interior-food').textContent = Math.floor(faction.food).toLocaleString('ko-KR');
    one('#interior-workshop-level').textContent = 'Lv.' + workshopLevel(war,kind) + ' / 3';
    one('.interior-scene').dataset.workshopLevel = String(workshopLevel(war,kind));
    for (const action of ACTIONS) {
      const option = interiorOption(war, kind, action);
      for (const button of root.querySelectorAll<HTMLButtonElement>('[data-interior-command="' + action + '"]')) {
        button.disabled = !option?.enabled;
        button.hidden = !option;
        button.title = option?.description ?? '';
      }
      one('[data-interior-name="' + action + '"]').textContent = option?.title ?? '';
      one('[data-interior-description="' + action + '"]').textContent = option?.description ?? '';
      one('[data-interior-price="' + action + '"]').textContent = option?.price ?? '';
    }
  };
  const leave = () => { currentSlot = null; root.hidden = true; };
  const enter = (slot: number): boolean => {
    const structure = getBaseState(war).structures.find(item => item.slot === slot);
    if (!structure || war.over || !war.factions[0].alive) return false;
    currentSlot = slot; root.hidden = false;
    one('#interior-message').textContent = '시설을 선택해 작업을 시작하세요. 변경 사항은 자동 저장됩니다.';
    refresh();
    one<HTMLButtonElement>('[data-interior-back]').focus({ preventScroll: true });
    return true;
  };
  root.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button) return;
    if (button.hasAttribute('data-interior-back')) { onBack(); return; }
    const action = button.dataset.interiorCommand as InteriorAction | undefined;
    if (!action || currentSlot === null) return;
    const kind = getBaseState(war).structures.find(item => item.slot === currentSlot)?.kind;
    if (!kind) { onBack(); return; }
    if (performInteriorAction(war, kind, action)) {
      const title = interiorOption(war, kind, action)?.title ?? ROOMS[kind].name;
      one('#interior-message').textContent = ROOMS[kind].name + ' 작업 완료 · 전장에 반영되었습니다.';
      onChange(title + ' 완료');
      refresh();
    } else {
      one('#interior-message').textContent = '작업할 수 없습니다. 자원·시설 단계·병력 수를 확인하세요.';
      refresh();
    }
  });
  return { enter, leave, refresh, isInside: () => currentSlot !== null };
}

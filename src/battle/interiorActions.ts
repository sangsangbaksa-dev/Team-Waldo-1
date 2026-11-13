import { WORKSHOP_UPGRADES, workshopCost, workshopLevel, upgradeWorkshop } from './base';
import {
  cost, getIncome, maxUnitsFor, repair, research, researchCost, setPolicy,
  setReserve, trainSquad, upgrade, UNIT_STATS, type Upgrade, type War,
} from './war';
import { storageCap } from './economy';
import { queuedUnits, TRAINING_SLOTS } from './recruitment';

/** Building interiors operate on the existing economy and save format. */
export type InteriorAction = 'upgrade' | 'service' | 'special' | 'workshop';
export interface InteriorOption {
  title: string;
  description: string;
  price: string;
  enabled: boolean;
}

const KINDS: Upgrade[] = ['mine', 'farm', 'barracks', 'fort'];
const recruitAmount = (war: War) => war.grandBattle ? 25 : 3;

export function interiorOption(war: War, kind: Upgrade, action: InteriorAction): InteriorOption | null {
  if (!KINDS.includes(kind)) return null;
  const faction = war.factions[0];
  const available = faction.alive && !war.over;
  if (action === 'upgrade') {
    const payment = cost(faction, kind);
    const next = faction[kind] + 1;
    const building = kind === 'mine' ? '채굴 설비' : kind === 'farm' ? '재배 시설' :
      kind === 'barracks' ? '훈련 시설' : '성벽 및 포탑';
    return {
      title: building + ' 확장',
      description: '같은 종류의 시설을 1동 증설합니다. 기존 왕국 레벨과 효과가 즉시 증가합니다.',
      price: next > 4 ? '최대 Lv.4' : '금 ' + payment.gold + ' · 식량 ' + payment.food,
      enabled: available && next <= 4 && faction.gold >= payment.gold && faction.food >= payment.food,
    };
  }
  if (action === 'workshop') {
    const definition = WORKSHOP_UPGRADES[kind], level = workshopLevel(war,kind);
    const payment = workshopCost(war,kind);
    return {
      title: definition.name+' 개량',
      description: definition.effect+' · 해당 건물 단계만큼 최대 Lv.3까지 개량 가능합니다.',
      price: level >= definition.maxLevel ? '최대 Lv.3' :
        faction[kind] <= level ? '시설 Lv.'+(level+1)+' 필요' :
        'Lv.'+level+' → '+(level+1)+' · 금 '+payment.gold+' / 식량 '+payment.food,
      enabled: available && level<definition.maxLevel && faction[kind]>level &&
        faction.gold>=payment.gold && faction.food>=payment.food,
    };
  }
  if (action === 'service') {
    if (kind === 'mine') return {
      title: '긴급 광석 반출',
      description: '남는 식량을 광부에게 지급하고 금을 확보합니다.',
      price: faction.gold >= storageCap(war,0) ? '금 저장 한도 도달' : '식량 80 → 금 ' + Math.min(55,Math.max(0,storageCap(war,0)-faction.gold)).toFixed(0),
      enabled: available && faction.food >= 80 && faction.gold < storageCap(war,0),
    };
    if (kind === 'farm') return {
      title: '긴급 수확',
      description: '상인에게 금을 지급하고 식량을 확보합니다.',
      price: faction.food >= storageCap(war,0) ? '식량 저장 한도 도달' : '금 80 → 식량 ' + Math.min(55,Math.max(0,storageCap(war,0)-faction.food)).toFixed(0),
      enabled: available && faction.gold >= 80 && faction.food < storageCap(war,0),
    };
    if (kind === 'barracks') {
      const amount = recruitAmount(war), unit = UNIT_STATS.infantry;
      return {
        title: '보병 ' + amount + (war.economyCampaign ? '명 훈련 예약' : '명 훈련'),
        description: war.economyCampaign ? '병력 자리를 예약하고 차례로 훈련합니다. 기지 관리창을 닫으면 훈련 시간이 진행됩니다.' : '훈련소에서 병력을 즉시 동원합니다. 인구 제한을 초과하지 않습니다.',
        price: '금 ' + (unit.gold * amount) + ' · 식량 ' + (unit.food * amount),
        enabled: available && faction.barracks >= unit.unlock &&
          war.units.filter(u => u.owner === 0).length + queuedUnits(war.recruitment[0]) + amount <= maxUnitsFor(war) &&
          (!war.economyCampaign || war.recruitment[0].queue.length < TRAINING_SLOTS) &&
          faction.gold >= unit.gold * amount && faction.food >= unit.food * amount,
      };
    }
    return {
      title: '본부 긴급 수리',
      description: '현재 체력을 최대 100 회복합니다. 이미 완전하다면 자원을 쓰지 않습니다.',
      price: '금 45 · 식량 25',
      enabled: available && faction.hp < faction.maxHp - 1 && faction.gold >= 45 && faction.food >= 25,
    };
  }
  if (action === 'special') {
    if (kind === 'barracks') {
      const def = researchCost(faction, 'weapons');
      return {
        title: '강철 무기 연구',
        description: '아군 전체 공격력을 단계마다 12% 강화합니다. 병영 Lv.2 필요.',
        price: faction.research.weapons >= 3 ? '최대 Lv.3' : '금 ' + def.gold + ' · 식량 ' + def.food,
        enabled: available && faction.barracks >= 2 && faction.research.weapons < 3 &&
          faction.gold >= def.gold && faction.food >= def.food,
      };
    }
    if (kind === 'fort') {
      const amount = war.grandBattle ? 25 : 2;
      return {
        title: '본부 수비대 ' + amount + '명 지정',
        description: '선발 병력을 본부 방어에 우선 배치합니다. 언제든 작전 탭에서 변경할 수 있습니다.',
        price: '자원 소모 없음',
        enabled: available && faction.reserve !== amount,
      };
    }
    if (kind === 'farm') {
      return {
        title: '성장 정책 시행',
        description: '왕국 전체 금·식량 생산이 25% 증가합니다. 전시 공격력 보너스는 사라집니다.',
        price: '자원 소모 없음',
        enabled: available && faction.policy !== 'growth',
      };
    }
    const income = getIncome(war, 0);
    return {
      title: '현장 채굴 보고서',
      description: '현재 왕국의 금 생산은 초당 ' + income.gold.toFixed(1) + '입니다. 확장으로 생산량을 높이세요.',
      price: '읽기 전용',
      enabled: false,
    };
  }
  return null;
}

/** Every action validates again at the moment of use; failed actions are side-effect free. */
export function performInteriorAction(war: War, kind: Upgrade, action: InteriorAction): boolean {
  const option = interiorOption(war, kind, action);
  if (!option?.enabled) return false;
  const faction = war.factions[0];
  if (action === 'upgrade') return upgrade(war, 0, kind);
  if (action === 'workshop') return upgradeWorkshop(war,kind);
  if (action === 'service') {
    if (kind === 'mine') { const received=Math.min(55,Math.max(0,storageCap(war,0)-faction.gold));faction.food -= 80; faction.gold += received;war.stats[0].goldEarned+=received; }
    else if (kind === 'farm') { const received=Math.min(55,Math.max(0,storageCap(war,0)-faction.food));faction.gold -= 80; faction.food += received;war.stats[0].foodEarned+=received; }
    else if (kind === 'barracks') return trainSquad(war, 0, 'infantry', recruitAmount(war));
    else return repair(war, 0);
    war.events.unshift({ time: Math.floor(war.time), text: kind === 'mine' ? '금광 광석 반출 완료' : '농장 긴급 수확 완료' });
    war.events.length = Math.min(war.events.length, 8);
    return true;
  }
  if (kind === 'barracks') return research(war, 0, 'weapons');
  if (kind === 'fort') return setReserve(war, 0, war.grandBattle ? 25 : 2);
  if (kind === 'farm') return setPolicy(war, 0, 'growth');
  return false;
}

// LAST CITY — 작전 지령의 표시 모델 (게임 규칙 및 보상은 World가 관리)
import type { World } from './world';
import { SIDE_MILESTONES } from './events';

export interface MissionItem {
  chapter: string;
  title: string;
  objective: string;
  hint: string;
  current: number;
  target: number;
  reward: number;
  done: boolean;
}

const BRIEFS = [
  { chapter: '01 · 개척', title: '첫 수익원 확보', hint: '흰 점선 표식이 있는 사업체의 출입문으로 걸어 들어가, 안쪽 카운터 앞에서 E를 눌러 매입하세요.' },
  { chapter: '02 · 기반', title: '병영 가동', hint: 'Tab → 건설 → 병영을 고르고 본부 근처 빈 땅에 배치하세요. 완공까지 기다려야 합니다.' },
  { chapter: '03 · 전력', title: '소총병 소대 편성', hint: 'Tab → 생산에서 소총병을 훈련하세요. 완공된 병영과 보급 인구가 필요합니다.' },
  { chapter: '04 · 장비', title: '보스 무장 강화', hint: '도시에 떨어진 무기를 E로 줍거나 무기상에서 새 무기를 구매하세요.' },
  { chapter: '05 · 경제', title: '사업권 확장', hint: '사업체 세 곳을 확보하세요. 적 소유 사업체도 점령할 수 있습니다.' },
  { chapter: '06 · 공세', title: '적대적 인수', hint: '적 사업체의 경비를 정리한 뒤 패드 위에서 6초 동안 버티세요.' },
  { chapter: '07 · 격파', title: '라이벌 왕국 무력화', hint: '병력을 편성하고 적 본부를 공격하세요. 본부가 무너지면 해당 왕국이 탈락합니다.' },
] as const;

export function missionLog(world: World): MissionItem[] {
  const f = world.factions[0];
  const owned = world.businesses.filter(b => b.owner === 0).length;
  const barracks = world.structures.some(s => s.alive && s.f === 0 && s.kind === 'barracks' && s.built >= 1);
  const rifle = world.actors.filter(a => a.alive && a.f === 0 && a.kind === 'rifle').length;
  const armed = f.slots.some(x => x.id !== 'pistol' && !(x.id === 'smg' && world.opts.klass === 'warlord'));
  const captured = f.ai.biz === -7 || !!world.quests[5]?.done;
  const defeated = world.factions.some(x => x.id !== 0 && !x.alive);
  const observed: number[] = [owned, Number(barracks), rifle, Number(armed), owned, Number(captured), Number(defeated)];
  const targets = [1, 1, 4, 1, 3, 1, 1];
  const items: MissionItem[] = world.quests.map((q, i) => {
    const brief = BRIEFS[i];
    const target = targets[i] ?? 1;
    return {
      chapter: brief?.chapter ?? String(i + 1).padStart(2, '0') + ' · 추가 작전',
      title: brief?.title ?? '추가 임무 ' + (i + 1),
      objective: q.text,
      hint: brief?.hint ?? q.text,
      current: q.done ? target : Math.min(target, observed[i] ?? 0),
      target,
      reward: q.reward,
      done: q.done,
    };
  });
  const rivalsLeft = Math.max(0, world.aliveCount() - 1);
  items.push({
    chapter: '08 · 결전',
    title: '최후의 왕국',
    objective: '나머지 일곱 왕국을 모두 무너뜨리고 최후까지 살아남으세요.',
    hint: '지도(M)에서 적 본부를 확인하고 지휘 패널(Tab)과 병력 돌격으로 공격하세요. 오래 끌면 라이벌이 총력전에 들어가니 서두르세요.',
    current: world.winner === 0 ? 7 : Math.max(0, 7 - rivalsLeft),
    target: 7,
    reward: 0,
    done: world.winner === 0,
  });
  return items;
}

export function missionSummary(items: readonly MissionItem[]): { completed: number; total: number; active: MissionItem | null } {
  return { completed: items.filter(x => x.done).length, total: items.length, active: items.find(x => !x.done) ?? null };
}

export interface SideJobItem { title: string; objective: string; current: number; target: number; reward: number; done: boolean }
/** 부업 이정표(도시 사건을 몇 건 끝냈는지)와 연속 성공 상태 */
export function sideJobs(world: World): { items: SideJobItem[]; streak: number; done: number } {
  const items = SIDE_MILESTONES.map((m, i) => ({ title: m.title, objective: `도시 사건(수송차·구조·배달·현상금·통신 거점) ${m.n}건 완료`, current: Math.min(m.n, world.eventsDone), target: m.n, reward: m.reward, done: world.sideClaimed > i }));
  return { items, streak: world.eventStreak, done: world.eventsDone };
}

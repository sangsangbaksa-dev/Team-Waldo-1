// OUTLAW CITY — 갱 구역 점령. 도시는 여덟 개 갱 구역으로 나뉘고, 점령하면 분당 수입이 생기며 그 구역의 보초는 사라집니다.
// 점령 전쟁은 휴대폰 일거리 'turfwar' 로 시작하며(jobs.ts 가 불러 씀), 이 파일은 전투 흐름과 구역 정보만 맡습니다.
import type { Sim } from './sim';
import { PLAYER_ID, type JobState, type Marker, type Ped } from './types';

export interface Zone { id: string; name: string; gang: string; /** 지도 반쪽 크기에 대한 비율 좌표 */ fx: number; fz: number; r: number }
export const ZONES: Zone[] = [
  { id: 'z_dock', name: '녹슨 부두', gang: '러스트 도그스', fx: -0.66, fz: -0.36, r: 120 },
  { id: 'z_steel', name: '철강 단지', gang: '블랙 앤빌', fx: -0.2, fz: -0.74, r: 115 },
  { id: 'z_north', name: '북쪽 창고촌', gang: '나이트 코브라', fx: 0.4, fz: -0.68, r: 115 },
  { id: 'z_slum', name: '동부 빈민가', gang: '레드 하운드', fx: 0.72, fz: -0.06, r: 120 },
  { id: 'z_east', name: '이스트 힐', gang: '실버 팽', fx: 0.62, fz: 0.5, r: 115 },
  { id: 'z_neon', name: '네온 골목', gang: '블루 스콜피온', fx: 0.08, fz: 0.68, r: 110 },
  { id: 'z_west', name: '서쪽 주택가', gang: '그린 헤이즈', fx: -0.46, fz: 0.58, r: 115 },
  { id: 'z_market', name: '웨스트 시장', gang: '골드 윈드', fx: -0.72, fz: 0.1, r: 115 },
];
export interface ZoneAt extends Zone { x: number; z: number; owned: boolean; index: number }
export function zoneInfo(sim: Sim, index: number): ZoneAt { const z = ZONES[index]!; return { ...z, x: z.fx * sim.map.half, z: z.fz * sim.map.half, owned: sim.life.turf.includes(z.id), index }; }
export const allZones = (sim: Sim): ZoneAt[] => ZONES.map((_, i) => zoneInfo(sim, i));
/** 좌표가 속한 구역(없으면 null) */
export function zoneAt(sim: Sim, x: number, z: number): ZoneAt | null {
  let best: ZoneAt | null = null, bd = Infinity;
  for (const q of allZones(sim)) { const d = Math.hypot(q.x - x, q.z - z); if (d < q.r && d < bd) { bd = d; best = q; } }
  return best;
}
export const ownedCount = (sim: Sim): number => sim.life.turf.length;
export const allOwned = (sim: Sim): boolean => ZONES.every(z => sim.life.turf.includes(z.id));
const WAVES = [4, 5, 5];
const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);

/** 구역 점령전을 시작합니다: 가장 가까운 미점령 구역이 목표입니다. */
export function startTurf(sim: Sim, j: JobState): void {
  const open = allZones(sim).filter(z => !z.owned).sort((a, b) => dist(a, sim.player) - dist(b, sim.player)), z = open[0]!;
  j.data.zone = z.index; j.data.civ0 = sim.civKills; j.data.out = 0; j.timer = 540; j.stage = 0;
}

function spawnWave(sim: Sim, z: ZoneAt, wave: number): void {
  const p = sim.player, n = WAVES[wave]!, boss = wave === 2;
  const spots = sim.map.walkPoints.filter(q => dist(q, z) < z.r * 0.9 && dist(q, p) > 26 && dist(q, p) < 80);
  const pool = spots.length >= n ? spots : sim.map.walkPoints.filter(q => dist(q, p) > 24 && dist(q, p) < 90);
  for (let i = 0; i < n + (boss ? 1 : 0); i++) {
    const q = pool[Math.floor(sim.rng() * pool.length)] ?? { x: p.x + 30, z: p.z };
    const g = sim.spawnPed(boss && i === 0 ? 'boss' : 'gang', q.x, q.z, { keep: true, tag: 'job', mode: 'attack', target: PLAYER_ID });
    g.name = boss && i === 0 ? `${z.gang} 두목` : g.name;
  }
}
const mark = (x: number, z: number, r: number, label: string, kind: Marker['kind']): Marker => ({ x, z, r, label, kind, blip: true, color: kind === 'target' ? 0xff4545 : 0xffd23f });
const clock = (t: number): string => { const n = Math.ceil(Math.max(0, t)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };

export interface TurfResult { result: 'pass' | 'fail'; text: string; cash: number }
/** 매 틱 진행. 끝나면 결과를 돌려줍니다(jobs.ts 가 마무리). */
export function stepTurf(sim: Sim, dt: number): TurfResult | null {
  const j = sim.job, p = sim.player, z = zoneInfo(sim, j.data.zone!);
  if (sim.civKills > j.data.civ0!) return { result: 'fail', text: '시민을 해쳤습니다 · 점령 실패', cash: 0 };
  const inside = dist(p, z) < z.r, foes = sim.peds.filter((q): q is Ped => q.alive && q.tag === 'job' && q.team === 'gang');
  if (!j.stage) {
    j.markers = [mark(z.x, z.z, 14, `${z.name} (${z.gang})`, 'goal')]; j.text = `${z.gang} 의 땅 ${z.name} 으로 가세요 · ${clock(j.timer)}`;
    if (inside) { j.stage = 1; spawnWave(sim, z, 0); sim.say(`${z.gang} 이 몰려온다! 1/3 파`, 3); }
    return null;
  }
  // 구역을 오래 벗어나면 점령전이 끝납니다.
  j.data.out = dist(p, z) > z.r + 50 ? j.data.out! + dt : 0;
  if (j.data.out! > 20) return { result: 'fail', text: '구역을 벗어나 점령전 실패', cash: 0 };
  j.markers = foes.map(q => mark(q.x, q.z, 3, q.kind === 'boss' ? '두목' : '갱', 'target'));
  j.text = j.data.out! > 0 ? `구역으로 돌아가세요! ${Math.ceil(20 - j.data.out!)}초` : `${z.name} ${j.stage}/3 파 · 갱 ${foes.length}명 남음 · ${clock(j.timer)}`;
  if (foes.length) return null;
  if (j.stage >= 3) {
    sim.life.turf.push(z.id); const n = sim.life.turf.length;
    return { result: 'pass', text: `${z.name} 점령 · 구역 ${n}/${ZONES.length} · 분당 수입 증가`, cash: 1800 + 450 * n };
  }
  j.stage++; spawnWave(sim, z, j.stage - 1); sim.say(j.stage === 3 ? `두목이 직접 나왔다! 3/3 파` : `증원이 도착했다! ${j.stage}/3 파`, 3);
  return null;
}

// ---------- 보초 ----------
/** 미점령 구역에 들어가면 갱 보초가 서 있습니다. 점령한 구역과 먼 곳에서는 치웁니다. */
export function stepTurfSentries(sim: Sim): void {
  if (sim.frame % 72 !== 0) return;
  const p = sim.player, here = p.alive ? zoneAt(sim, p.x, p.z) : null;
  const sentries = sim.peds.filter(q => q.tag === 'turf');
  for (const q of sentries) if (q.alive && (dist(q, p) > 230 || (zoneAt(sim, q.x, q.z)?.owned ?? true))) sim.removePed(q);
  if (!here || here.owned || sim.job.active === 'turfwar' || sim.mission.active) return;
  const alive = sentries.filter(q => q.alive && sim.ped(q.id));
  if (alive.length >= 5) return;
  const pool = sim.map.walkPoints.filter(q => dist(q, here) < here.r * 0.85 && dist(q, p) > 50 && dist(q, p) < 110);
  const q = pool[Math.floor(sim.rng() * pool.length)]; if (!q) return;
  sim.spawnPed('gang', q.x, q.z, { tag: 'turf', mode: 'guard', tx: q.x, tz: q.z, aux: 10, loot: 40 + Math.floor(sim.rng() * 60) });
}

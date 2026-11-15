// 총게임(ZERO ZONE) 봇 대 봇 시뮬레이션: 화면 없이 경기를 끝까지 돌려 길이·킬 수·난이도 차이를 봅니다.
//   node --import tsx tools/shooter-sim.ts [경기수]
import { Match } from '../src/shooter/sim';
import { BOTS, DIFFICULTIES, type Difficulty } from '../src/shooter/config';

const games = Number(process.argv[2] ?? 5);
function royale(seed: number, difficulty: Difficulty): { t: number; kills: number; zone: number } {
  const m = new Match({ seed, mode: 'br', difficulty, humans: [], fill: 20 });
  let kills = 0, zone = 0;
  while (!m.over && m.t < 900) { m.step(1 / 30); for (const e of m.drain()) if (e.t === 'kill') { if (e.weapon === 'zone') zone++; else kills++; } }
  return { t: m.t, kills, zone };
}
for (const d of DIFFICULTIES) {
  const rows = Array.from({ length: games }, (_, i) => royale(100 + i, d)), avg = (f: (r: typeof rows[0]) => number): string => (rows.reduce((s, r) => s + f(r), 0) / rows.length).toFixed(1);
  console.log(d.padEnd(7), '경기 시간', avg(r => r.t) + 's', '| 총격 킬', avg(r => r.kills), '| 자기장 사망', avg(r => r.zone));
}
/** 1대1: 선수 0 은 난이도 a, 선수 1 은 난이도 b 의 봇. 승률을 돌려줍니다. */
function duel(a: Difficulty, b: Difficulty, n: number): number {
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const m = new Match({ seed: 500 + i, mode: 'duel', difficulty: a, humans: [], fill: 2 });
    m.players[0].brain!.t = BOTS[a]; m.players[1].brain!.t = BOTS[b];
    while (!m.over && m.t < 400) { m.step(1 / 30); m.drain(); }
    if (m.winner === 0) wins++;
  }
  return wins / n;
}
const n = Number(process.argv[3] ?? 30);
for (const [a, b] of [['expert', 'easy'], ['hard', 'easy'], ['expert', 'hard'], ['normal', 'easy'], ['hard', 'normal']] as Array<[Difficulty, Difficulty]>) console.log(`${a} vs ${b}: ${(duel(a, b, n) * 100).toFixed(0)}% (${n}판)`);

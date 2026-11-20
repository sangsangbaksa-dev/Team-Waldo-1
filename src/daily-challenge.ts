import type { GameId } from './game-launchers';

export interface DailyChallenge { game: GameId; goal: string }
const challenges: readonly DailyChallenge[] = [
  { game: 'city', goal: '사업체를 세 곳 확보하고 최후의 왕국에 도전하세요.' },
  { game: 'race', goal: '타임어택에서 깨끗한 한 바퀴를 달리고 자신의 최고 랩을 넘어서세요.' },
  { game: 'rts', goal: '보병과 지원 병력을 조합해 AI 상대에게 승리하세요.' },
  { game: 'shooter', goal: '낙하 지점을 신중하게 선택하고 최후의 10인에 진입하세요.' },
  { game: 'outlaw', goal: '의뢰 하나를 성공시키고 경찰의 추격에서 벗어나세요.' },
  { game: 'tycoon', goal: '일거리로 자본을 모으고 첫 사업장을 열어 보세요.' },
  { game: 'room-tone', goal: '발소리와 주변 신호에 주의하며 다음 구역으로 이동하세요.' },
];
/** Rotate with the player's local calendar, unaffected by 23/25-hour DST days. */
export function dailyChallenge(date: Date): DailyChallenge {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  return challenges[((day % challenges.length) + challenges.length) % challenges.length] ?? challenges[0]!;
}

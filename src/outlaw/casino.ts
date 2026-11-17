// OUTLAW CITY — 카지노 게임(슬롯·블랙잭·룰렛·동전 던지기) 순수 로직. 난수는 호출자가 넘겨 재현 가능하게 합니다.
export type Rng = () => number;

// ---------- 슬롯 ----------
export const SLOT_SYMBOLS = ['🍒', '🍋', '🔔', '⭐', '💎', '7'] as const;
const SLOT_WEIGHTS = [30, 26, 18, 12, 8, 6];
const SLOT_PAY: Record<string, number> = { '🍒': 3, '🍋': 4, '🔔': 8, '⭐': 15, '💎': 30, '7': 100 };
export interface SlotResult { reels: string[]; payout: number; jackpot: boolean; note: string }
export function slotSpin(rng: Rng, bet: number): SlotResult {
  const total = SLOT_WEIGHTS.reduce((a, b) => a + b, 0), pick = (): string => { let r = rng() * total; for (let i = 0; i < SLOT_WEIGHTS.length; i++) { r -= SLOT_WEIGHTS[i]!; if (r < 0) return SLOT_SYMBOLS[i]!; } return SLOT_SYMBOLS[0]!; };
  const reels = [pick(), pick(), pick()];
  if (reels[0] === reels[1] && reels[1] === reels[2]) { const m = SLOT_PAY[reels[0]!]!; return { reels, payout: bet * m, jackpot: reels[0] === '7', note: reels[0] === '7' ? '잭팟!!' : `트리플 ×${m}` }; }
  if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) return { reels, payout: Math.floor(bet * 1.3), jackpot: false, note: '두 개 일치' };
  return { reels, payout: 0, jackpot: false, note: '꽝' };
}

// ---------- 룰렛 ----------
export type RouletteBet = { type: 'red' | 'black' | 'odd' | 'even' | 'low' | 'high' } | { type: 'number'; n: number };
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const rouletteColor = (n: number): 'red' | 'black' | 'green' => (n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black');
export function rouletteSpin(rng: Rng, bet: number, on: RouletteBet): { n: number; color: string; payout: number } {
  const n = Math.floor(rng() * 37), color = rouletteColor(n); let mult = 0;
  if (on.type === 'number') mult = n === on.n ? 36 : 0;
  else if (n > 0) {
    if (on.type === 'red' || on.type === 'black') mult = color === on.type ? 2 : 0;
    else if (on.type === 'odd') mult = n % 2 === 1 ? 2 : 0; else if (on.type === 'even') mult = n % 2 === 0 ? 2 : 0;
    else if (on.type === 'low') mult = n <= 18 ? 2 : 0; else mult = n >= 19 ? 2 : 0;
  }
  return { n, color, payout: bet * mult };
}

// ---------- 동전 던지기 ----------
export function coinFlip(rng: Rng, bet: number, call: 'heads' | 'tails'): { side: 'heads' | 'tails'; payout: number } {
  const side = rng() < 0.5 ? 'heads' : 'tails'; return { side, payout: side === call ? Math.floor(bet * 1.9) : 0 };
}

// ---------- 블랙잭 ----------
export interface Card { rank: number; suit: number }
export const cardLabel = (c: Card): string => ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][c.rank]! + ['♠', '♥', '♦', '♣'][c.suit]!;
export function handValue(cards: Card[]): number {
  let sum = 0, aces = 0; for (const c of cards) { if (c.rank === 0) { aces++; sum += 11; } else sum += Math.min(10, c.rank + 1); }
  while (sum > 21 && aces > 0) { sum -= 10; aces--; } return sum;
}
export type BjState = 'play' | 'win' | 'lose' | 'push' | 'blackjack';
export class Blackjack {
  deck: Card[] = []; player: Card[] = []; dealer: Card[] = []; state: BjState = 'play'; bet: number; doubled = false;
  constructor(rng: Rng, bet: number) {
    this.bet = bet; for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) this.deck.push({ rank: r, suit: s });
    for (let i = this.deck.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [this.deck[i], this.deck[j]] = [this.deck[j]!, this.deck[i]!]; }
    this.player = [this.draw(), this.draw()]; this.dealer = [this.draw(), this.draw()];
    if (handValue(this.player) === 21) this.finish();
  }
  private draw(): Card { return this.deck.pop()!; }
  hit(): void { if (this.state !== 'play') return; this.player.push(this.draw()); const v = handValue(this.player); if (v > 21) this.state = 'lose'; else if (v === 21) this.stand(); }
  /** 두 배로 올리고 한 장만 더 받습니다. 호출 전에 추가 판돈을 확인하세요. */
  double(): void { if (this.state !== 'play' || this.player.length !== 2) return; this.bet *= 2; this.doubled = true; this.player.push(this.draw()); if (handValue(this.player) > 21) this.state = 'lose'; else this.stand(); }
  stand(): void { if (this.state !== 'play') return; this.finish(); }
  private finish(): void {
    const pv = handValue(this.player);
    if (pv === 21 && this.player.length === 2 && handValue(this.dealer) !== 21) { this.state = 'blackjack'; return; }
    while (handValue(this.dealer) < 17) this.dealer.push(this.draw());
    const dv = handValue(this.dealer); this.state = dv > 21 || pv > dv ? 'win' : pv === dv ? 'push' : 'lose';
  }
  /** 정산: 돌려받는 총액(판돈 포함). 0 이면 판돈을 잃은 것. */
  get payout(): number { return this.state === 'blackjack' ? Math.floor(this.bet * 2.5) : this.state === 'win' ? this.bet * 2 : this.state === 'push' ? this.bet : 0; }
  get over(): boolean { return this.state !== 'play'; }
}

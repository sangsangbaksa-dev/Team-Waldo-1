// 1대1 PvP 공통 타입. 백엔드(Supabase)와 개발용 로컬 백엔드가 같은 인터페이스를 구현합니다.
import type { ChatKey, ChatMessage } from './chat';
export type GameKind = 'city' | 'race' | 'rts' | 'shooter' | 'outlaw' | 'squad';
export const GAME_NAMES: Record<GameKind, string> = { city: 'LAST CITY', race: 'SPEED RUSH', rts: 'FRONTLINE', shooter: 'ZERO ZONE', outlaw: 'OUTLAW CITY', squad: 'SQUAD CLASH' };

export interface Account { id: string; email: string; nickname: string }
export interface MatchRow {
  id: string; game: GameKind; code: string | null; host_id: string; guest_id: string | null;
  status: 'waiting' | 'playing' | 'finished' | 'cancelled' | 'void'; config: Record<string, unknown>;
  winner_id: string | null; host_delta: number | null; guest_delta: number | null;
}
/** 멀티플레이 방. 2인 방은 시작할 때 1대1 매치(match_id)가 함께 만들어지고, 3인 이상(SPEED RUSH)은 match_id 가 없습니다. */
export interface RoomRow {
  id: string; code: string; game: GameKind; host_id: string; max_players: number; is_public: boolean;
  status: 'waiting' | 'playing' | 'closed'; config: Record<string, unknown>; match_id: string | null;
}
export interface RoomMember { user_id: string; nickname: string; ready: boolean }
/** 입장 순서대로 정렬된 참가자 */
export interface RoomInfo { room: RoomRow; members: RoomMember[] }
export interface RoomListItem { room: RoomRow; host: string; count: number }
export interface RankRow { rank: number; user_id: string; nickname: string; rating: number; wins: number; losses: number }
export interface Rating { rating: number; wins: number; losses: number }

/** 게임 중 주고받는 메시지. 게임마다 `t` 로 종류를 나눕니다. */
export type NetMsg = { t: string; [key: string]: unknown };
export interface Channel { send(msg: NetMsg): void; close(): void; ready: Promise<void> }

export interface Backend {
  readonly kind: 'supabase' | 'local';
  account(): Promise<Account | null>;
  /** 이메일 확인이 필요한 프로젝트 설정이면 'confirm' 을 돌려줍니다. */
  signUp(email: string, password: string, nickname: string): Promise<Account | 'confirm'>;
  signIn(email: string, password: string): Promise<Account>;
  /** 가입 확인 메일을 다시 보냅니다(링크가 만료되었거나 이미 한 번 눌렀을 때). */
  resendConfirmation(email: string): Promise<void>;
  signOut(): Promise<void>;
  setNickname(nickname: string): Promise<Account>;
  quickMatch(game: GameKind, config: Record<string, unknown>): Promise<MatchRow>;
  createRoom(game: GameKind, config: Record<string, unknown>): Promise<MatchRow>;
  joinRoom(code: string): Promise<MatchRow>;
  cancelMatch(id: string): Promise<void>;
  getMatch(id: string): Promise<MatchRow>;
  report(id: string, winner: string): Promise<MatchRow>;
  settle(id: string): Promise<MatchRow>;
  leaderboard(game: GameKind, limit: number): Promise<RankRow[]>;
  rating(game: GameKind): Promise<Rating | null>;
  nickname(userId: string): Promise<string>;
  roomCreate(game: GameKind, max: number, isPublic: boolean, config: Record<string, unknown>): Promise<RoomRow>;
  roomJoin(code: string): Promise<RoomRow>;
  roomLeave(id: string): Promise<void>;
  roomReady(id: string, ready: boolean): Promise<void>;
  /** 대기방에 아직 있다는 신호(5초마다). 오래 끊긴 사람은 서버가 방에서 뺍니다. */
  roomPing(id: string): Promise<void>;
  roomStart(id: string): Promise<RoomRow>;
  roomState(id: string): Promise<RoomInfo>;
  roomList(game: GameKind): Promise<RoomListItem[]>;
  open(matchId: string, onMessage: (msg: NetMsg) => void): Channel;
  // ---- 채팅(src/net/chat.ts) ----
  /** 대화방의 최근 글(오래된 것부터). 전체·게임 로비는 로그인 없이도 읽을 수 있습니다. */
  chatHistory(channel: ChatKey, limit: number): Promise<ChatMessage[]>;
  /** 서버가 정리·욕설 가리기·도배 제한을 거친 뒤 저장한 글을 돌려줍니다. 막히면 chat_* 오류를 던집니다. */
  chatSend(channel: ChatKey, body: string): Promise<ChatMessage>;
  chatReport(messageId: number): Promise<void>;
  /** 새 글을 실시간으로 받습니다(내가 보낸 글도 옵니다). */
  chatWatch(channel: ChatKey, onMessage: (m: ChatMessage) => void): { close(): void; ready: Promise<void> };
}

/** 서버가 던지는 오류 코드를 사람이 읽을 문장으로 바꿉니다. */
const ERRORS: Array<[RegExp, string]> = [
  [/chat_slow/, '조금 천천히 보내 주세요.'], [/chat_repeat/, '같은 말을 연달아 보낼 수 없습니다.'], [/chat_muted/, '도배나 신고로 잠시 채팅이 막혔습니다. 조금 뒤에 다시 보내 주세요.'],
  [/chat_empty/, '보낼 내용을 입력해 주세요.'], [/chat_denied/, '이 대화방에는 보낼 수 없습니다.'], [/chat_own/, '내 글은 신고할 수 없습니다.'],
  [/room_full/, '방이 가득 찼습니다.'], [/not_ready/, '아직 준비하지 않은 사람이 있습니다.'], [/need_players/, '두 명 이상 모여야 시작할 수 있습니다.'], [/not_host/, '방장만 시작할 수 있습니다.'],
  [/login_required/, '로그인이 필요합니다.'], [/room_not_found/, '대기 중인 방을 찾지 못했습니다. 코드를 다시 확인해 주세요.'], [/own_room/, '내가 만든 방에는 들어갈 수 없습니다.'],
  [/nickname_taken|duplicate key/i, '이미 사용 중인 닉네임입니다.'], [/bad_nickname/, '닉네임은 2~16자로 입력해 주세요.'],
  [/Invalid login credentials/i, '이메일 또는 비밀번호가 맞지 않습니다.'], [/already registered|already been registered/i, '이미 가입된 이메일입니다.'],
  [/Password should be|weak_password/i, '비밀번호는 6자 이상으로 입력해 주세요.'], [/valid email|invalid format|email_address_invalid/i, '이메일 형식을 확인해 주세요.'],
  [/rate limit|over_email_send_rate_limit|too many/i, '요청이 너무 잦습니다. 잠시 뒤에 다시 시도해 주세요.'], [/Email not confirmed/i, '이메일 확인이 아직 끝나지 않았습니다. 받은 메일의 링크를 누르거나, 아래에서 인증 메일을 다시 받아 주세요.'], [/otp_expired|link is invalid|has expired|access_denied/i, '인증 링크가 만료되었거나 이미 사용됐습니다. 이메일을 입력하고 "인증 메일 다시 받기"를 눌러 새 링크를 받아 주세요.'],
  [/Failed to fetch|NetworkError|network/i, '서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.'],
];
export function errText(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e !== null && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  return ERRORS.find(([re]) => re.test(msg))?.[1] ?? '요청을 처리하지 못했습니다. 잠시 뒤에 다시 시도해 주세요.';
}

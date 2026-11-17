// Supabase 연결 정보. 정적 사이트에서 쓰도록 만들어진 공개(publishable) 키이고, 접근 제어는 DB 의 RLS 와 함수 권한이 맡습니다.
// 비밀 키(service_role, secret)는 이 저장소에 절대 넣지 않습니다.
export const SUPABASE_URL = 'https://qgeblwepfowfswfxtemd.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_5J9A5uOS09eJ7gi5QJVhQg_42BOYw95';

/** 1대1 온라인 대전(PvP)과 로그인·랭킹 화면의 임시 스위치. false 이면 모든 게임에서 관련 버튼이 사라지고 로비도 열리지 않습니다. */
export const PVP_ENABLED = false;

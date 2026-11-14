# 1대1 PvP와 계정 (Supabase)

## 구성
- **계정**: Supabase Auth 이메일·비밀번호. 가입 폼의 닉네임이 `pvp_profiles` 에 저장됩니다(트리거).
- **매칭**: `pvp_quick_match`(무작위 매칭), `pvp_create_room`/`pvp_join_room`(방 코드). 모두 `security definer` 함수이고 로그인한 사용자만 부를 수 있습니다.
- **실시간**: 매치마다 Realtime Broadcast 채널 `pvp:<match id>` 로 상태를 주고받습니다(DB 쓰기 없음).
- **전적·랭킹**: 게임별 Elo(K=32) 레이팅, 승패 기록. `pvp_leaderboard`.
- 스키마는 `supabase/migrations/` 에 있고, 프로젝트 `team-waldo-pvp` 에 적용되어 있습니다. 같은 프로젝트의 `waldo_*` 테이블은 건드리지 않습니다.

## 가입 확인 메일 설정 (Supabase 대시보드)
확인 메일의 링크는 Supabase Auth 의 **Site URL** 로 돌아옵니다. 기본값이 `http://localhost:3000` 이면 링크를 눌러도 연결 거부 화면이 뜹니다.
- **Authentication → URL Configuration**: Site URL 을 `https://team-waldo.vercel.app` 으로, Redirect URLs 에 `https://team-waldo.vercel.app/**` 와 `https://sangsangbaksa-dev.github.io/Team-Waldo-1/**` 를 추가합니다. 코드는 가입·재전송 때 `emailRedirectTo` 로 지금 접속한 주소를 넘기므로, 허용 목록에 있는 배포 주소에서는 그 주소로 돌아옵니다.
- 링크가 만료됐거나 한 번 눌렀다면(메일 보안 검사기가 링크를 먼저 열어 버리는 경우도 있습니다) 로그인 화면의 "인증 메일 다시 받기"로 새 링크를 받습니다.
- 이메일 확인 자체를 끄려면 **Authentication → Providers → Email → Confirm email** 을 끕니다. 가입 즉시 쓸 수 있지만 이메일 소유 확인이 없어 가짜 주소로도 가입됩니다(친구끼리 하는 게임이면 보통 충분). 켜 둘 경우 Supabase 기본 메일 발송은 시간당 개수 제한이 작으므로 사용자가 늘면 자체 SMTP 를 연결하세요.

## 보안 모델
- 클라이언트는 공개(publishable) 키만 씁니다(`src/net/config.ts`). 비밀 키는 저장소에 없습니다.
- 모든 테이블에 RLS. 프로필·레이팅은 공개 읽기(랭킹용), 매치는 참가자만 읽기, 직접 쓰기 정책은 없고 함수로만 바뀝니다.
- 시뮬레이션은 각자의 브라우저에서 돌기 때문에 부정행위를 완전히 막지는 못합니다. 결과 보고는 이렇게 다룹니다: 스스로 패배를 보고하면 즉시 확정, 승리를 보고하면 상대의 일치하는 보고가 있거나 15초 안에 이의가 없을 때 확정, 두 보고가 다르면 무효(레이팅 변화 없음).
- Realtime 채널은 매치 id(추측 불가능한 UUID)를 아는 사람만 들어갑니다. 위치 같은 일시 정보만 흐릅니다.

## SPEED RUSH 대전 규칙
같은 코스에서 나란히 출발해 먼저 결승선을 통과하면 승리합니다. 코스와 랩 수는 방을 만든 쪽(무작위 매칭이면 먼저 기다린 쪽)을 따르고 차량은 각자 고릅니다. 상대 차량은 15Hz 스냅샷을 따라가는 유령처럼 보이며 차량끼리 부딪치지 않습니다. 먼저 나가면 기권 패배입니다.

## LAST CITY 결투 규칙
- 같은 시드의 도시에서 조직 0(나)과 1(상대)만 남습니다. 두 사람은 서로 다른 본부에서 출발하고, 병력·건설·연구·용병·차량·시민은 없습니다. 무기 줍기/구매와 사업체 매입은 그대로입니다.
- **먼저 5킬**을 채우면 승리. 5분이 지나면 킬이 많은 쪽이 이기고, 같으면 다음 킬이 승부를 가릅니다. 쓰러지면 3초 뒤 본부에서 부활합니다.
- 동기화: 내 위치·체력·무기를 15Hz 로 보내고, 쏜 탄은 발사 이벤트로 보냅니다. **맞았는지는 맞는 사람의 쪽에서 판정**합니다(상대가 쏜 탄을 내 세계에서 날려 내 보스에게 닿으면 내 체력이 깎임). 상대 보스는 내 세계에서 체력이 깎이지 않고 받은 체력만 보여 줍니다. 전리품은 각자 따로 줍습니다.

## 로컬에서 두 탭으로 확인
`npm run dev` 후 `http://localhost:5173/?pvp=local` 을 탭 두 개로 열면 네트워크 없이(localStorage·BroadcastChannel) 같은 흐름을 볼 수 있습니다. 이 백엔드는 개발 모드에만 포함됩니다. `node tools/pvp-browser-smoke.mjs`(SPEED RUSH)와 `node tools/duel-browser-smoke.mjs`(LAST CITY)가 이 방식으로 가입→매칭→대전→결과를 자동 확인합니다. 헤드리스 SwiftShader 는 화면이 느려 시뮬레이션이 슬로모션이 되므로 스크립트가 개발용 훅(`__race.skip`, `__city.world`)을 씁니다.

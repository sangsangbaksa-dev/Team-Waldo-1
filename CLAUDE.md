# team-waldo

Vite + TypeScript + Three.js 아케이드 허브. 게임 6개가 있습니다.

| 폴더 | 게임 |
|---|---|
| `src/city` | LAST CITY |
| `src/race` | SPEED RUSH |
| `src/rts` | FRONTLINE |
| `src/shooter` | ZERO ZONE |
| `src/outlaw` | OUTLAW CITY |
| `src/tycoon` | HUSTLE (직접 발로 뛰는 타이쿤: `core/` 규칙·`scene/` 3D 월드·`ui/` 화면·`game.ts`) |

공용: `src/main.ts`(허브), `src/net`(로그인·1대1), `src/shared`, `src/prefs.ts`, `src/records.ts`, `src/loading.ts`, `src/audio-core.ts`.

## 규칙
- 작업 중인 게임 폴더만 읽습니다. 다른 게임 폴더·`public/`(바이너리 에셋)은 열지 않습니다.
- 검증: `npm run typecheck && npm run build` (Vercel 빌드와 동일).
- 배포: Vercel 프로젝트 `team-waldo`(팀 `waldo5`), 도메인 team-waldo.vercel.app. 푸시 브랜치는 `claude/pages-merge`(GitHub Pages 계보 `claude/funny-noether-4uesaj` 기반 + OUTLAW CITY).
- `tests/`·`tools/`·`docs/`는 필요할 때만 엽니다.

## 게임 설계 제한
- 일일 도전, 출석 보상, 반복 접속 유도용 메타 미션을 추가하지 않습니다.
- 영구 능력치 강화, 다음 판에 이월되는 전투 보너스나 강화 재화를 추가하지 않습니다. 판 내부의 성장과 전투 밸런스는 유지하고, 재미 개선은 조작감·AI·맵·연출·판 내부 콘텐츠에 집중합니다.

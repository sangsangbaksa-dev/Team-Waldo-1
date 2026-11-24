# team-waldo

Vite + TypeScript + Three.js 게임 허브. 게임 9개가 있습니다.

| 폴더 | 게임 |
|---|---|
| `src/city` | LAST CITY |
| `src/race` | SPEED RUSH |
| `src/shooter` | ZERO ZONE |
| `src/tycoon` | HUSTLE (직접 발로 뛰는 타이쿤: `core/` 규칙·`scene/` 3D 월드·`ui/` 화면·`game.ts`) |
| `src/sky` | SKY WAR |
| `src/slack` | SLACK OFF |
| `games/parry-gladiator` | PARRY GLADIATOR |
| `games/dead-ground` | DEAD GROUND |
| `room-tone/` + `src/room-tone` | ROOM TONE (별도 HTML, 허브에서 이동) |

공용: `src/main.ts`(허브), `src/net`(로그인·1대1), `src/shared`(`lod.ts` = 청크 분할·거리 LOD·박스 프록시·지형 타일: 3D 렉 줄일 때 먼저 쓰세요), `src/prefs.ts`, `src/records.ts`, `src/loading.ts`, `src/audio-core.ts`.

## 규칙
- 작업 중인 게임 폴더만 읽습니다. 다른 게임 폴더·`public/`(바이너리 에셋)은 열지 않습니다.
- 검증: `npm run typecheck && npm run build` (Vercel 빌드와 동일).
- 배포: Vercel 프로젝트 `team-waldo`(팀 `waldo5`), 도메인 team-waldo.vercel.app. 푸시 브랜치는 `claude/pages-merge`.
- `tests/`·`tools/`·`docs/`는 필요할 때만 엽니다.

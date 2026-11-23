# team-waldo

Vite + TypeScript + Three.js 게임 허브. 게임 10개가 있습니다. (운영 허브 `src/main.ts` 기준)

| 폴더 | 게임 |
|---|---|
| `src/city` | LAST CITY |
| `src/race` | SPEED RUSH |
| `src/rts` | FRONTLINE |
| `src/shooter` | ZERO ZONE |
| `src/outlaw` | OUTLAW CITY |
| `src/tycoon` | HUSTLE (직접 발로 뛰는 타이쿤: `core/` 규칙·`scene/` 3D 월드·`ui/` 화면·`game.ts`) |
| `src/sky` | SKY WAR |
| `src/squad` | SQUAD CLASH |
| `src/slack` | SLACK OFF |
| `room-tone/` + `src/room-tone` | ROOM TONE (별도 HTML, 허브에서 이동) |

공용: `src/main.ts`(허브), `src/net`(로그인·1대1), `src/shared`(`lod.ts` = 청크 분할·거리 LOD·박스 프록시·지형 타일: 3D 렉 줄일 때 먼저 쓰세요), `src/prefs.ts`, `src/records.ts`, `src/loading.ts`, `src/audio-core.ts`.

## 규칙
- 병렬 에이전트는 게임별 경로와 테스트만 수정하고 공용 파일 변경은 코디네이터에게 알립니다. 마지막 10분 내 수정된 파일은 덮어쓰지 않습니다.
- 영구 업그레이드, 다음 판에 영향을 주는 스탯 누적은 금지합니다. 15분 안팎의 플레이를 지향합니다.
- 작업 중인 게임 폴더만 읽습니다. 다른 게임 폴더·`public/`(바이너리 에셋)은 열지 않습니다.
- 검증: `npm run lint && npm run typecheck && npm test && npm run build` (Vercel 빌드와 동일).
- 배포: Vercel 프로젝트 `team-waldo`(팀 `waldo5`), 도메인 team-waldo.vercel.app. 2026-11-23 운영 배포 기준 브랜치는 `feat/shared-menu-rails`입니다. GitHub 기본 브랜치 `claude/project-thread-hhffi5`와 분기되어 있으므로 직접 병합하지 않습니다. 사용자의 명시적 지시 없이 병합·운영 배포를 하지 않습니다.
- `tests/`·`tools/`·`docs/`는 필요할 때만 엽니다.

병렬 작업 및 배포 검증 상세 절차: [`docs/TEAM_COORDINATION.md`](docs/TEAM_COORDINATION.md), [통합 관제 이슈 #210](https://github.com/sangsangbaksa-dev/Team-Waldo-1/issues/210).

# team-waldo

Vite + TypeScript + Three.js 아케이드 허브. 게임 5개만 있습니다.

| 폴더 | 게임 |
|---|---|
| `src/city` | LAST CITY |
| `src/race` | SPEED RUSH |
| `src/rts` | FRONTLINE |
| `src/shooter` | ZERO ZONE |
| `src/outlaw` | OUTLAW CITY |

공용: `src/main.ts`(허브), `src/net`(로그인·1대1), `src/shared`, `src/prefs.ts`, `src/records.ts`, `src/loading.ts`, `src/audio-core.ts`.

## 규칙
- 작업 중인 게임 폴더만 읽습니다. 다른 게임 폴더·`public/`(바이너리 에셋)은 열지 않습니다.
- 검증: `npm run typecheck && npm run build` (Vercel 빌드와 동일).
- 배포: Vercel 프로젝트 `team-waldo`(팀 `waldo5`), 도메인 team-waldo.vercel.app. 푸시 브랜치는 `claude/pages-merge`(GitHub Pages 계보 `claude/funny-noether-4uesaj` 기반 + OUTLAW CITY).
- `tests/`·`tools/`·`docs/`는 필요할 때만 엽니다.

# Team Waldo 병렬 개발·병합 운영 규칙

> 이 문서는 에이전트와 코디네이터의 **작업 절차**를 정의합니다. 현재 열려 있는 PR과 CI 결과의 실시간 목록은 [통합 관제 #210](https://github.com/sangsangbaksa-dev/Team-Waldo-1/issues/210)에서 관리합니다. 여기 적힌 브랜치 정보는 2026-11-23 확인 기록이며, 실제 배포 전에 반드시 재확인해야 합니다.

## 1. 단일 기준점 선택

- 실제 서비스 주소: [team-waldo.vercel.app](https://team-waldo.vercel.app/)
- 2026-11-23 Vercel 프로덕션에서 확인된 배포 브랜치: `feat/shared-menu-rails`
- GitHub 기본 브랜치: `claude/project-thread-hhffi5` (프로덕션 브랜치와 **분기된 이력**)
- **배포된 버전**과 **브랜치 최신 버전**은 다를 수 있습니다. 게임 오류를 재현할 때 운영 배포 SHA와 개발 브랜치 SHA를 각각 기록합니다.
- 기본 브랜치를 통째로 프로덕션 브랜치에 병합하지 않습니다. 추가할 기능의 실제 변경분만 포팅하거나, 적합한 대상으로 PR을 재기준화합니다.

## 2. 작업 영역 소유권

| 게임 | 주 코드 | 주요 검증 범위 |
| --- | --- | --- |
| LAST CITY | `src/city/**` | `tests/city/**`, `tools/city-browser-smoke.mjs` |
| SPEED RUSH | `src/race/**` | `tests/race/**`, `tools/race-browser-smoke.mjs` |
| FRONTLINE | `src/rts/**` | `src/rts/*.test.ts`, RTS 시뮬레이션 |
| ZERO ZONE | `src/shooter/**` | `tests/shooter/**`, `tools/shooter-terrain-shots.mjs` |
| OUTLAW CITY | `src/outlaw/**` | 게임별 테스트 |
| HUSTLE | `src/tycoon/**` | `tests/tycoon/**`, 차량/경제 규칙 |
| SKY WAR | `src/sky/**` | `tests/sky/**`, `tools/sky-browser-smoke.mjs` |
| SQUAD CLASH | `src/squad/**` | `tests/squad/**` |
| SLACK OFF | `src/slack/**` | `tests/slack/**`, `tools/slack-browser-smoke.mjs` |
| ROOM TONE | `room-tone/**`, `src/room-tone/**` | `tests/room-tone/**`, `tools/room-tone-browser-smoke.mjs` |

공유 영역은 `src/shared/**`, `src/net/**`, `src/main.ts`, `src/style.css`, `src/prefs.ts`, `src/loading.ts`, `vite.config.ts`, `public/**`, `.github/workflows/**`입니다. 게임 담당자는 공유 영역 변경이 필요한 경우 별도 PR로 분리하거나 코디네이터에게 먼저 충돌 범위를 알립니다.

## 3. 시작·커밋·병합 프로토콜

1. **출발점 기록** — 어떤 운영 SHA·브랜치를 기준으로 코딩하는지 PR 설명에 기록합니다. 10분 이내 변경한 파일이 있으면 다른 작업자의 진행 중 파일로 보고 덮어쓰지 않습니다.
2. **범위 격리** — 한 PR은 가급적 한 게임과 그 테스트만 변경합니다. 여러 게임이 얽힌 PR은 각 게임별 변경·공통 코드·테스트를 구분합니다.
3. **중복 검토** — 열린 PR들의 `head/base`와 변경 파일 이름을 비교하고, 같은 모듈의 수정이 있다면 기능별 채택 여부를 결정합니다. 특히 서로 분기된 브랜치끼리 `mergeable=true`라는 이유만으로 통합하지 않습니다.
4. **한 번에 하나씩** — 부모 PR 위에 쌓인 자식 PR은 부모의 통합 후 새 운영 브랜치 기반으로 재기준화합니다. 같은 파일을 동시에 바꾸는 PR은 재기준화한 최종 후보 하나로 정리합니다.
5. **출시 기준** — `npm ci && npm run lint && npm run typecheck && npm test && npm run build`가 통과해야 합니다. CI의 실패는 실제 오류 파일·행·메시지를 확인하고, **자기 코드 실패**와 **다른 게임 브랜치의 기존 오류**를 구분하여 적습니다.
6. **플레이 테스트** — 시작/나가기/재시작, 키보드/터치패드/터치, 일시정지, 브라우저 포커스 이탈, 저장 호환성, 연속 플레이 후 리소스 정리, 낮은 FPS와 모바일 폭을 확인합니다.
7. **배포 금지 기본값** — 코디네이터 및 게임 담당자는 **사용자 명시적 배포 지시 전 프로덕션을 바꾸지 않습니다**. GitHub PR 생성과 배포는 다른 작업입니다.

## 4. 중점 회귀 검사

- 사용자 요구: 영구 업그레이드 금지, 다음 판에 능력치가 누적되는 보상 금지. 세션 내 진행·기록은 별도 규칙에 따릅니다.
- LAST CITY: UI/지도/AI/전투/3D 객체 해제, 터치패드 회전·줌, 사업체 가격·보급·지도 안내 정합성.
- SPEED RUSH: 프레임 저하와 주행 물리 동등성, 고스트 리플레이 저장, 랩 경계, 완주 처리, 터치 HUD.
- ZERO ZONE: 시드 결정성, 지형 높이와 물리/사격/시야의 일치, 고층 도시와 도로 이동성, 자기장과 99명 AI 성능.
- ROOM TONE: 추격 경로 탐색, 시야·소리, 숨기기, 브라우저 복귀·재시작, WebGL 컨텍스트/오디오 복구.
- SKY WAR: 자동 조준/플레어, 저 FPS 미사일 충돌, 정지 중 입력, 터치패드 조종과 기체 수명주기.
- SLACK OFF: 키보드 모달 누출, 감독 AI, 모바일 터치, 중복 타이머, 게임 종료 이후 이벤트/오디오 정리.
- HUSTLE: 차량 승하차·시점 전환·충돌·맵·활동 취소, 세션 전용 차량과 경제 시스템 분리.

## 5. CI 비용과 안정성

- 전체 검사 워크플로는 `.github/workflows/ci.yml`이며, 단순 소규모 lint 오류여도 전체 결과를 실패로 만들 수 있습니다.
- 비용이 큰 브라우저 smoke는 **그 게임·공유 런타임 파일의 변경에만** 실행하고, 같은 PR/브랜치의 이전 실행을 취소하도록 구성합니다. 중요한 공통 경로를 지나치게 좁게 필터링하면 리그레션을 놓칠 수 있습니다.
- 테스트가 실패한 파일이 다른 게임에 속하면 무관한 파일을 자기 PR에 조용히 섞어 수정하지 않습니다. 코디네이터 이슈에 기존 원인과 해결 대상 PR을 링크합니다.
- PR/브랜치의 CI 상태를 최신 `head SHA`와 대조합니다. 이전 SHA의 성공 결과는 현재 코드의 증거가 아닙니다.

## 6. 출시 요청이 들어온 경우

1. 배포 대상(Vercel 우선)과 사용자가 승인한 정확한 코드 범위를 기록합니다.
2. 최신 운영 브랜치, PR 통합 브랜치, 실제 서비스 SHA의 차이를 비교합니다.
3. 전체 검증과 게임별 browser smoke를 통과시키고, 변경 사항·롤백 커밋을 정리합니다.
4. 명시적 지시가 있으면 승인된 코드만 배포하고 Vercel의 **READY/ERROR 상태, SHA, 실제 사이트**를 확인합니다.
5. Vercel 실패 시에만 사용자가 지시한 GitHub Pages 대체 경로를 검토합니다. `.github/workflows/pages.yml`의 자동 push 트리거를 확인하여 뜻하지 않은 배포를 피합니다.
6. 결과를 통합 관제 이슈와 해당 PR에 기록합니다. 별도 승인 없이 자동 병합·연속 배포하지 않습니다.

## 7. 작업 완료 보고 형식

- 대상 PR/커밋/브랜치
- 수정한 실제 파일과 문제의 재현·해결 내용
- 테스트 명령 및 CI run 링크, 미확인 범위
- 충돌·선행 PR 의존성
- 병합 여부와 실제 배포 여부 (둘 다 기본값 '아니요')

## 8. PR 파일 충돌 자동 보고 도구

저장소 루트에서 다음 명령을 실행하면 현재 열린 PR의 **부모/자식 관계, 같은 파일을 바꾼 PR 쌍, 운영 기준과 다른 base, 두 게임 이상을 건드린 PR**을 읽기 전용으로 보고합니다.

```bash
node tools/coordination-report.mjs --repo=sangsangbaksa-dev/Team-Waldo-1 --target=feat/shared-menu-rails
node tools/coordination-report.mjs --json
```

- GitHub 공개 API를 사용합니다. 요청량 제한을 늘리고 싶으면 인증된 환경에서 `GITHUB_TOKEN`을 미리 설정할 수 있으며, 스크립트는 토큰을 출력하지 않습니다.
- 인증 없이 실행할 때에는 최신 열린 PR 최대 40개만 확인합니다. `--limit=80`처럼 범위를 늘리면 API 요청 제한에 걸릴 수 있습니다.
- 네트워크 없이 확인하려면 `--input=path/to/fixture.json`을 사용합니다. 입력은 PR 객체 배열 또는 `{ "prs": [...] }`이며 각 PR에는 `number`, `base`, `head`, `files` 필드를 넣습니다.
- 파일 이름이 겹친다는 것만으로 병합 충돌이 확정되지는 않습니다. 보고서는 부모 PR을 상속해 발생한 **스택 내부의 기대되는 중복**과, 별도 PR 사이의 **독립 변경 중복**을 구분합니다. 실제 diff 검토를 대신하거나 코드를 수정·병합·배포하지 않습니다.

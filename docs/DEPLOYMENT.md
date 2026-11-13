# 빌드·브라우저 검증·Vercel 배포

WALDO는 Vite가 생성한 정적 파일을 배포합니다. 게임 서버·데이터베이스·API 키 없이 실행하며, 원정과 설정은 각 브라우저에 보관합니다. **소스 업로드, Preview 배포, 공개 운영 배포는 각각 해당 커밋과 결과를 확인합니다.**

## 1. 빌드 설정

저장소 루트의 [`vercel.json`](../vercel.json)을 사용합니다.

| 항목 | 값 |
| --- | --- |
| Framework Preset | Vite |
| Root Directory | 저장소 루트 |
| Install Command | `npm ci` |
| Build Command | `npm run typecheck && npm run build` |
| Output Directory | `dist` |
| Node.js | 22.13 이상인 22 LTS 또는 24 LTS |
| 게임 런타임 환경 변수 | 필요 없음 |

`package-lock.json`을 함께 관리해 같은 의존성으로 빌드합니다. 맵 정의, 바이옴, 계약·지원 규칙, SVG fallback은 모두 소스와 정적 자산에 포함됩니다. 새 Frontiers 기능을 위해 외부 서비스 키를 추가할 필요가 없습니다.

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run validate-data
npm run build
npm run preview
```

`npm run preview`는 생성된 `dist`를 로컬에서 확인하는 명령입니다. 이것만으로 원격 사이트가 배포되지는 않습니다.

## 2. 실제 브라우저 검증

### 설치와 실행

```bash
npx playwright install --with-deps chromium --only-shell
npm run test:browser
node tools/frontiers-smoke.mjs
```

브라우저 스크립트가 직접 개발 서버를 시작하고 검사 종료 후 정리합니다. 기본 검사는 4179, Frontiers 검사는 4180 포트를 사용합니다. 해당 포트를 다른 프로세스가 점유하지 않게 합니다.

| 검사 | 실행 내용 | 결과 위치 |
| --- | --- | --- |
| `tools/browser-smoke.mjs` | 메뉴·품질 변경·WebGL·훈련·거점 명령·저장·이어하기·일시정지·결과·기지와 기존 기능 | `browser-artifacts/` |
| `tools/frontiers-smoke.mjs` | 세 맵 × 일반/대규모전, 지도 크기·거점·바이옴, 계약·지원, 전체 지도 명령, 저장·복원 | `browser-artifacts/frontiers/` |
| `tools/production-smoke.mjs` | 공개 운영 주소의 빌드 자산 일치와 실제 조작·저장 | `browser-artifacts/production/` |

기본 화면 검사는 1440×900, 390×844, 320×780, 844×390을 사용합니다. Frontiers 검사는 세 맵의 데스크톱 일반·대규모전과 확대 맵의 세로·가로 모바일 사례를 추가합니다. 운영 검사는 별도의 공개 사이트 대상으로 동작합니다.

### 보고서 해석

`report.json`의 커밋, 검사 단계, 오류, GPU/렌더 정보와 테스트 조건을 먼저 확인한 뒤 PNG 스크린샷을 봅니다. 파일이 존재하는 것만으로 성공으로 판단하지 않습니다. 실패 사례의 스크린샷과 서버 로그도 보관됩니다.

개발 브라우저 검사에는 반복 가능한 UI·저장 검증을 위한 **명시적인 자원·부상·승리 상태 지정**과 시간 정지가 포함됩니다. 해당 조건은 보고서에 기록합니다. 이 결과는 실제 DOM과 WebGL 경로를 확인하는 자료이며, 무개입 전투 완주나 실제 휴대폰 GPU 성능 측정으로 표현하지 않습니다.

로컬 실행 환경에서 Chromium·WebGL·프로세스 실행이 제한되면 구체적인 실패를 기록하고 GitHub Actions의 브라우저 실행 결과를 확인합니다. 타입 검사나 빌드 성공은 브라우저 화면 검증을 대신하지 않습니다.

## 3. GitHub Actions와 스크린샷

| Workflow | 소스 | 확인할 내용 |
| --- | --- | --- |
| **CI** | `.github/workflows/ci.yml` | lint·타입·테스트·서바이벌 데이터·빌드 |
| **Browser smoke** | `.github/workflows/browser-smoke.yml` | 기존 플레이 경로와 반응형 회귀 |
| **Frontiers browser smoke** | `.github/workflows/frontiers-smoke.yml` | 확대 맵·지원·전체 지도 회귀 |
| **Production smoke** | `.github/workflows/production-smoke.yml` | 실제 공개 운영 빌드와 조작 |

CI·Browser smoke·Frontiers browser smoke는 push와 pull request를 검사합니다. 수동 실행 설정도 있습니다. Production smoke는 workflow 파일에 지정된 브랜치 push 또는 수동 실행으로 시작합니다. 그 트리거 목록은 Vercel의 현재 Production Branch를 증명하지 않습니다.

증거 확인 순서:

1. GitHub 저장소의 **Actions**에서 해당 커밋 SHA가 표시된 실행을 엽니다.
2. 필요한 job이 완료되었는지와 실패한 step을 확인합니다.
3. 실행 아래 **Artifacts**에서 다음 묶음을 내려받습니다.
   - `browser-evidence-<SHA>`
   - `frontiers-evidence-<SHA>`
   - 운영 검사를 실행했다면 `production-evidence-<SHA>`
4. `report.json`, 서버 로그, 스크린샷을 함께 확인합니다. 최신 커밋과 이전 실행의 결과를 혼동하지 않습니다.

스크린샷 검토에는 최소한 메뉴의 세 맵 카드, 5개 관리 탭, 기지 창, 계약·지원 패널, 전체 작전 지도, 큰 맵의 미니맵과 부대 명령을 포함합니다. 모바일에서는 버튼과 패널이 화면 밖으로 나가거나 서로 가리지 않는지 확인합니다. 현재 workflow의 아티팩트 보관 기간은 7일입니다.

## 4. 연결된 Vercel 프로젝트

이 저장소의 기존 배포 문서에는 다음 프로젝트와 공개 주소가 기록되어 있습니다.

- 저장소: [sangsangbaksa-dev/Team-Waldo-1](https://github.com/sangsangbaksa-dev/Team-Waldo-1)
- Vercel 프로젝트: [team-waldo-3d-war](https://vercel.com/waldo5/team-waldo-3d-war)
- 기존 공개 주소: [team-waldo-3d-war.vercel.app](https://team-waldo-3d-war.vercel.app)

이 주소의 존재나 문서 수정만으로 Frontiers가 운영에 게시되었다고 판단하지 않습니다. 현재 공개 버전은 해당 배포의 source commit과 실제 자산을 대조해 확인해야 합니다.

### 작업 브랜치에서 확인하기

1. 검증한 변경을 작업 브랜치에 커밋하고 GitHub에 푸시합니다.
2. 정확한 SHA의 CI·브라우저 검사 결과를 확인합니다.
3. 연결된 Vercel 검사가 생성되면 상세 링크에서 배포 URL과 source commit을 확인합니다.
4. Preview 주소에서 메뉴, 세 맵, 일반·대규모전, 계약·지원, 전체 지도, 기지 관리와 저장·이어하기를 확인합니다.
5. 운영 반영이 필요한 경우 Vercel에 설정된 Production Branch 또는 검증된 배포의 운영 승격 절차를 사용합니다.

저장소 기본 브랜치와 Vercel Production Branch는 다를 수 있습니다. 이름을 추정하거나, 기본 브랜치 통합만으로 공개 주소가 갱신되었다고 보고하지 않습니다. CI와 Vercel은 별도의 검사이므로 둘 다 결과를 확인합니다.

### 새 프로젝트로 가져오기

Vercel에서 **Add New → Project**로 이 GitHub 저장소를 가져오고, 빌드 설정 표를 확인합니다. 의도한 운영 브랜치를 지정하고 `dist`를 배포합니다. 기존 프로젝트를 바꿀 때는 대상 프로젝트와 배포 커밋을 먼저 확인합니다.

## 5. 공개 운영 주소의 소스 일치 검사

운영 배포를 확인할 때는 해당 배포로 게시하려는 **정확한 소스 커밋**을 체크아웃하고 잠금 파일로 빌드합니다.

```bash
npm ci
npm run build
npx playwright install --with-deps chromium --only-shell
node tools/production-smoke.mjs
```

스크립트의 현재 대상은 `https://team-waldo-3d-war.vercel.app/`입니다. 새 운영 주소를 사용한다면 대상 URL을 의도적으로 수정한 뒤 검사합니다.

Production smoke는 공개 HTML이 참조하는 Vite entry 파일 이름과 SHA-256을 로컬 `dist`의 entry와 비교한 뒤 실제 공개 페이지를 조작합니다. 개발용 상태 핸들 노출도 확인합니다. 운영 검사는 개발 상태 주입이나 가짜 네트워크 응답으로 성공시키지 않습니다.

자산이 다르면 현재 공개 사이트에 다른 소스가 게시된 것인지, 아직 배포 중인지, 빌드 입력이 다른 것인지 조사합니다. 단지 기존 사이트가 열렸다는 이유로 최신 변경의 배포 성공으로 처리하지 않습니다.

## 6. 저장 호환성과 운영 확인

Frontiers의 전투 payload는 **v4**이며 기존 `localStorage` 키를 유지합니다. 유효한 v1·v2·v3 전투는 기본 맵으로 이전합니다. 확대 전장·계약·지원은 v4에 기록합니다. 브라우저 저장은 주소별로 분리되므로 Preview에서 만든 기록이 운영 주소로 자동 이동하지 않습니다.

확인할 주요 경로:

- 기존 기본 맵 저장 이어하기와 새 확대 맵 저장 이어하기.
- 메뉴에서 다른 전장을 고른 상태로 저장된 원정 이어하기.
- 수령한 계약 보상이 재지급되지 않는지.
- 재사용 대기 중인 지원과 진행 중인 효과가 복원되는지.
- 같은 맵·난이도·전투 규모로 결과 화면에서 재도전하는지.

새 형식으로 저장한 기록을 이전 코드가 읽을 수 있다고 가정하지 않습니다. 운영 롤백 시에는 해당 구버전의 저장 형식 지원 범위도 함께 확인합니다.

## 7. 오류 진단과 복구

- **빈 화면 / 파일 404:** Console·Network·Vercel Build Logs를 확인합니다. 배포 출력 경로는 `dist`입니다.
- **WebGL 안내 화면:** 브라우저의 WebGL과 하드웨어 가속을 확인합니다. 이 안내 화면만 보인 검사는 3D 렌더링 성공으로 세지 않습니다.
- **전투 저장 실패:** 브라우저 저장소 제한·손상된 데이터와 표시된 저장 상태를 확인합니다. 기존 정상 저장을 지우는 조치부터 하지 않습니다.
- **CI 실패:** 실패한 정확한 커밋·step·보고서를 확인하고 수정 커밋으로 다시 검증합니다.
- **운영 문제:** 검증된 이전 Vercel 배포로 복구할 수 있습니다. 코드와 저장 호환성을 함께 확인하고 후속 변경을 커밋합니다.

설정 참고: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [vercel.json](https://vercel.com/docs/project-configuration/vercel-json).

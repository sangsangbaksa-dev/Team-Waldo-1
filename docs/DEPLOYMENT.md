# Vercel 배포

이 프로젝트는 Vite가 생성한 정적 파일을 배포합니다. 서버, 데이터베이스, API 키 없이 실행되며 전투 저장 기록은 각 브라우저에 보관됩니다.

## 빌드 설정

저장소 루트의 `vercel.json`을 사용합니다.

| 항목 | 값 |
| --- | --- |
| Framework Preset | Vite |
| Root Directory | 저장소 루트 |
| Install Command | `npm ci` |
| Build Command | `npm run typecheck && npm run build` |
| Output Directory | `dist` |
| Node.js | 22.13 이상인 22 LTS 또는 24 LTS |
| 환경 변수 | 필요 없음 |

`package-lock.json`을 함께 커밋해야 같은 의존성으로 빌드됩니다. 파일 기반 설정은 Vercel 대시보드의 빌드 설정보다 우선하므로 별도 사용자 지정 명령을 추가할 필요가 없습니다.

## 연결된 프로젝트에 배포

기존 프로젝트는 [team-waldo-3d-war](https://vercel.com/waldo5/team-waldo-3d-war)입니다. 저장소는 `sangsangbaksa-dev/Team-Waldo-1`에 연결되어 있습니다.

1. 변경을 작업 브랜치에 커밋하고 GitHub에 푸시합니다.
2. 해당 커밋의 GitHub **Vercel** 검사가 완료되는지 확인합니다. 검사의 상세 링크와 PR의 Vercel 댓글에서 배포 URL을 확인할 수 있습니다.
3. 배포된 페이지에서 제목 화면, 새 게임, 병력 훈련, 거점 명령, 저장 및 이어하기를 확인합니다. 모바일에서는 패널과 전장 입력도 확인합니다.
4. 운영 배포에는 Vercel에 설정된 Production Branch를 사용하거나 검증한 배포를 Vercel에서 운영으로 승격합니다. 저장소 기본 브랜치와 Vercel Production Branch는 서로 다를 수 있으므로 이름을 추정하지 않습니다.

기존 공개 주소는 [team-waldo-3d-war.vercel.app](https://team-waldo-3d-war.vercel.app)입니다. 이번 작업에서는 공개 자산을 별도 빌드와 바이트 단위로 대조해 `codex/3d-management-war-v2` 소스가 운영 주소에 게시되어 있음을 확인했습니다. 기본 브랜치 통합만으로 운영 주소가 바뀐다고 가정하지 않습니다. 특정 변경이 반영되었는지는 URL의 존재만으로 판단하지 않고 해당 배포의 소스 커밋을 확인해야 합니다.

## 새 Vercel 프로젝트로 가져오기

Vercel에서 **Add New → Project**를 선택하고 이 GitHub 저장소를 가져옵니다. 위의 빌드 설정을 확인한 뒤 의도한 브랜치를 Production Branch로 지정합니다. 별도의 비밀 키는 필요하지 않습니다.

## 배포 전 검증

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run validate-data
npm run build
npm run preview
```

GitHub Actions는 모든 브랜치의 push와 pull request에서 같은 코드·데이터·빌드 검사를 실행합니다. Actions의 **Run workflow**로 수동 실행할 수도 있습니다. Vercel 배포와 CI는 별도 검사이므로 둘 다 성공했는지 확인합니다.

추가 **Browser smoke** workflow는 실제 Chromium·WebGL에서 네 화면 크기의 메뉴·전장 조작과 저장·결과 화면을 검사합니다. 연구/승리 상태를 지정하는 시나리오는 결과 JSON에 표시됩니다. 실행의 Artifacts에서 스크린샷, `report.json`, 개발 서버 로그를 확인할 수 있습니다. 이 검사는 물리적인 휴대폰 GPU 성능 측정을 대신하지 않습니다.

추가 **Production smoke** workflow는 기본 브랜치와 `codex/3d-management-war-v2` 반영 후 공개 운영 주소를 검사합니다. 배포 자산 이름과 SHA-256이 해당 소스의 프로덕션 빌드와 같아야 진행하며, 실제 공개 사이트에서 데스크톱·모바일의 훈련·명령·저장·이어하기·일시정지를 확인합니다. 개발용 상태 핸들이 운영 번들에 노출되지 않는지도 검사합니다.

## 운영 확인과 복구

- 빈 화면이면 개발자 도구의 Console과 Network에서 JavaScript 오류 또는 파일 404를 확인합니다. 출력 디렉터리는 `dist`여야 합니다.
- 3D 전장은 WebGL을 지원하는 브라우저가 필요합니다. 브라우저의 하드웨어 가속이 비활성화되었거나 WebGL이 제공되지 않으면 안내 화면이 표시됩니다.
- 로컬 저장은 브라우저와 주소별로 구분됩니다. Preview 주소의 기록이 운영 주소에 자동으로 옮겨지지 않습니다.
- 배포 오류는 Vercel의 Build Logs에서 확인합니다. 빌드가 실패했다면 오류를 수정하고 새 커밋을 푸시합니다.
- 운영 중 문제가 생기면 Vercel의 이전 정상 배포를 복원합니다. 코드 수정은 별도 커밋으로 남기고 검증 후 다시 배포합니다.

설정 참고: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [vercel.json](https://vercel.com/docs/project-configuration/vercel-json).

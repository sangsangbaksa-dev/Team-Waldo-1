# 배포 운영

Team Waldo는 Vite 정적 빌드(`dist/`)를 제공하는 브라우저 게임 허브입니다. **사용자가 명시적으로 배포를 지시하지 않으면 프로덕션 배포를 실행하지 않습니다.** 게임 담당자의 작업은 별도 브랜치 및 Draft PR로 격리합니다.

## 현재 확인된 환경 (2026-11-23 기준)

| 구분 | 확인 정보 |
| --- | --- |
| 주 서비스 | [team-waldo.vercel.app](https://team-waldo.vercel.app/) |
| Vercel 프로젝트 | `team-waldo`, 팀 `waldo5` |
| 프로덕션 배포 출처 | `feat/shared-menu-rails` |
| GitHub 기본 브랜치 | `claude/project-thread-hhffi5` |
| 대체 경로 | [GitHub Pages](https://sangsangbaksa-dev.github.io/Team-Waldo-1/) |

**주의:** GitHub 기본 브랜치와 실제 서비스 브랜치는 분기되어 있습니다. 최신 프로덕션이 어느 커밋을 서비스하는지는 Vercel 배포 기록에서 그때마다 확인해야 합니다. 프로덕션 HEAD와 서비스 SHA가 다를 수 있습니다.

## GitHub Pages 자동 트리거 주의

현재 `.github/workflows/pages.yml`에는 `push` 트리거가 남아 있으며, 대상 브랜치는 `claude/funny-noether-4uesaj`, `claude/project-thread-hhffi5`입니다. 따라서 이 브랜치에 직접 푸시하면 **의도하지 않은 Pages 자동 배포**가 일어날 수 있습니다. 사용자의 수동 배포 원칙과 맞게 운영하려면 해당 워크플로를 별도 검토·변경해야 하며, 반영 전에는 푸시를 피합니다. `workflow_dispatch`로 수동 실행하는 경로도 있습니다.

Vercel은 Git 연동 설정에 따라 푸시가 새 배포를 만들 수 있으므로, 프로덕션에 직접 푸시하기보다 PR에서 검증하고 명시적 배포 승인 후 반영합니다.

## 검증 순서

1. 변경 대상 브랜치 및 SHA, 게임별 PR 변경 파일과 부모 PR 의존성을 확인합니다.
2. Node.js 22에서 `npm ci`를 실행합니다.
3. `npm run lint && npm run typecheck && npm test && npm run build`를 통과시킵니다.
4. `npm run preview`로 허브와 변경 게임을 열어보고 데스크톱·모바일 폭, 게임 시작/홈 복귀/재시작을 확인합니다. 관련 Playwright browser smoke가 있으면 그 결과도 기록합니다.
5. 사용자 명시적 지시가 있을 때만 Vercel 배포·프로모션을 수행하고 실제 공개 URL의 상태 및 SHA를 검사합니다.
6. Vercel 실패 시에만 사용자의 지시에 따른 GitHub Pages 대안을 검토합니다.

병렬 개발 시 충돌 검사·코디네이션 체크리스트는 [TEAM_COORDINATION.md](TEAM_COORDINATION.md), 실시간 통합 관제는 [GitHub 이슈 #210](https://github.com/sangsangbaksa-dev/Team-Waldo-1/issues/210)을 따릅니다.

# 배포

정적 파일(Vite 빌드 결과 `dist/`)만 배포합니다. 서버, 데이터베이스, API 키가 필요 없고 기록은 각 브라우저의 localStorage에 저장됩니다.

## GitHub Pages

`.github/workflows/pages.yml`이 `claude/funny-noether-4uesaj` 브랜치에 푸시될 때마다 타입 체크, 테스트, 빌드를 거쳐 배포합니다. 병합되면 메인 페이지가 곧바로 공개됩니다. 공개 주소는 `https://sangsangbaksa-dev.github.io/Team-Waldo-1/`입니다.

## 확인 순서

1. `npm run lint && npm run typecheck && npm test && npm run build`
2. `npm run preview`로 메인 페이지를 열고 LAST CITY와 SPEED RUSH가 각각 시작되는지 확인합니다.
3. 모바일 폭에서 두 게임의 조작 화면도 확인합니다.

# 배포

정적 파일(Vite 빌드 결과 `dist/`)만 배포합니다. 아홉 게임의 솔로 플레이는 정적 파일만으로 작동합니다. 온라인 기능에는 연결된 서비스가 필요합니다.

## GitHub Pages

`.github/workflows/pages.yml`은 `claude/funny-noether-4uesaj`와 `claude/project-thread-hhffi5`에 푸시되거나 수동 실행될 때 타입 검사, 테스트, 빌드를 거쳐 배포합니다. 공개 주소는 `https://sangsangbaksa-dev.github.io/Team-Waldo-1/`입니다.

## 확인 순서

1. `npm run lint && npm run typecheck && npm test && npm run build`
2. `npm run preview`로 허브를 열고 아홉 게임에 들어갈 수 있는지 확인합니다. ROOM TONE, PARRY GLADIATOR, DEAD GROUND는 각자 별도 페이지에서 열립니다.
3. 모바일 폭에서 허브와 터치를 지원하는 게임의 조작 화면도 확인합니다.

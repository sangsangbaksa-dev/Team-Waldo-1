# 구조

- **메인 페이지** (`src/main.ts`, `src/style.css`): 두 게임의 선택 화면. 진입 번들은 작게 유지하고 게임은 선택 시 `import()`로 불러옵니다. 저장 기록 표시에는 `src/records.ts`만 씁니다.
- **LAST CITY** (`src/city`): 시뮬레이션(`world.ts`, `actors.ts`, `ai.ts`)은 DOM 없이 돌아가며 `tools/city-sim.ts`와 `tests/city`가 검증합니다. 화면은 `render3d.ts`(Three.js), `render.ts`(전술 탑뷰), HUD는 `game.ts`입니다.
- **SPEED RUSH** (`src/race`): `track.ts`·`physics.ts`·`race.ts`는 Three.js 비의존 순수 로직이고, `view.ts`·`audio.ts`·`game.ts`가 화면과 입력을 맡습니다.
- **공유**: `src/prefs.ts`(소리·품질 설정), `src/records.ts`(저장 기록), `public/assets/models/vehicles.glb`(두 게임이 같은 스포츠카 모델 사용).

## 규칙

- 새 게임은 `src/<이름>/game.ts`에서 `open<이름>(onExit)`을 내보내고, `src/main.ts`의 `ENTRIES`에 항목을 더합니다.
- 게임 로직은 렌더링과 분리해 `tests/`에서 단위 테스트합니다.

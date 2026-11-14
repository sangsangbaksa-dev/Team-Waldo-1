# WALDO

브라우저에서 바로 즐기는 두 편의 3D 게임입니다. 메인 페이지에서 고릅니다. 둘 다 싱글플레이이며 서버와 가입이 필요 없습니다.

| 게임 | 소개 | 코드 |
| --- | --- | --- |
| **LAST CITY** | 도시 점령 서바이벌 | `src/city` |
| **SPEED RUSH** | 스포츠카 3랩 레이싱 | `src/race` |

## LAST CITY

메인 페이지의 **LAST CITY**로 들어가는 3D 1인칭/3인칭 오픈월드 생존전입니다. 장군 선택, 연구, 본부 건설, 자기장 규칙으로 한 도시에 여덟 왕국을 떨어뜨립니다.

| 축 | 플레이 |
| --- | --- |
| 실시간 전략 | 일꾼이 크리스탈을 채굴하고, 병영·군수공장·연구소·포탑을 짓고, 소총병부터 전차까지 생산해 집결·사수·돌격을 지시합니다. |
| 생존전 | 자기장이 7단계로 줄어듭니다. 바닥 전리품과 보급 수송기의 전설 무기를 줍고, 본부가 무너지면 부활할 수 없습니다. 마지막 왕국이 승리합니다. |
| 오픈월드 | 보스를 직접 조작해 걷고 쏘고, 주차된 차·경찰차·전차를 타고, 시민을 건드리면 수배 등급이 올라 경찰이 추격합니다. |
| 경제·타이쿤 | 사업체(편의점·나이트클럽·정제 공장·카지노·중앙은행·무기상)의 패드에서 E 로 **건물 안에 들어가** 카운터에서 매입·업그레이드하고 업종별 물건(키트·용병·크리스탈·베팅·무기)을 삽니다. 업종마다 내부를 다르게 꾸몄습니다. 업그레이드한 사업체의 경비병은 본부에서 걸어서 출동합니다. 적 사업체는 패드 위에서 6초 버티면 인수합니다. |

조작: `WASD` 이동 · 마우스 시점/사격 · `V` 1인칭 → 3인칭 → 전술 탑뷰 · `E` 매입/줍기 · `F` 차량 · `Tab` 지휘 패널 · 우클릭 돌격 · `Z`/`X` 집결/사수 · `Q` 장군 스킬 · `Space` 대시 · `M` 지도. 터치 기기는 왼쪽 드래그 이동, 오른쪽 드래그 시점, 화면 버튼을 사용합니다.

- 시뮬레이션은 `src/city/world.ts`·`actors.ts`·`ai.ts`에 있고 DOM을 쓰지 않습니다. `npm run city-sim -- <seed> <easy|normal|hard>`로 AI끼리의 한 판을 헤드리스로 돌려 밸런스를 볼 수 있고, `tests/city`가 규칙과 완주 여부를 검사합니다.
- 화면은 `src/city/render3d.ts`(Three.js)와 `src/city/render.ts`(전술 탑뷰·미니맵)가 그립니다. 탄환은 지면 평면에서 계산하므로 상하 조준은 시점 연출이며 명중 판정에 쓰이지 않습니다.
- 3D 모델은 Blender 스크립트(`tools/blender`)로 만듭니다. `pip install bpy` 후 `python tools/blender/build_all.py public/assets/models`로 다시 내보냅니다. 사업체 패드 위의 표식 7종(`business.glb`, `biz.py`), 버스 정류장·자판기·광고판 같은 거리 소품(`street.py`), 본부·병영 등 건물(`world.py`)이 여기서 나옵니다. 미리보기 이미지는 `docs/images/last-city`에 있습니다.
- 한 판은 저장되지 않습니다(약 10~14분). 전적만 브라우저에 남습니다.

## SPEED RUSH

LAST CITY의 스포츠카 모델(`vehicles.glb`)로 달리는 3랩 아케이드 레이싱입니다. 드리프트 뒤 미니 터보, 니트로(`Shift`), 부스트 패드, 출발 타이밍 보너스가 있고 라이벌 AI가 3대 달립니다. 조작은 `WASD`/방향키, `Space` 드리프트, `Shift` 니트로, 터치 버튼입니다. 트랙·물리·레이스 규칙(`track.ts`, `physics.ts`, `race.ts`)은 Three.js에 의존하지 않아 `tests/race`에서 검증합니다. 최고 랩 기록은 브라우저에 저장됩니다.

## 구조

- `src/main.ts`, `src/style.css`: 메인 페이지. 게임 코드는 선택할 때 동적으로 불러옵니다.
- `src/city`, `src/race`: 각 게임. `src/prefs.ts`(소리·품질 설정)와 `src/records.ts`(저장 기록)를 함께 씁니다.
- `public/assets/models`: Blender로 만든 `.glb` 모델. `public/assets/home`: 메인 페이지 대표 이미지(게임 화면 캡처).
- `tools/blender`: 모델 생성 스크립트. `tools/city-sim.ts`는 AI끼리 한 판을 돌리는 헤드리스 시뮬레이션, `tools/city-browser-smoke.mjs`는 실제 브라우저 점검입니다.

## 시작하기

Node.js 22 이상을 사용합니다.

```bash
npm ci
npm run dev          # 개발 서버
npm run lint && npm run typecheck && npm test
npm run build        # dist/ 생성
```

`main` 계열 브랜치에 푸시하면 GitHub Pages로 배포됩니다(`.github/workflows/pages.yml`). 자세한 내용은 `docs/DEPLOYMENT.md`를 봅니다.

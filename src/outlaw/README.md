# OUTLAW CITY — 설계 문서

브라우저에서 돌아가는 3D 3인칭 오픈월드 범죄 액션(GTA 스타일). three.js + TypeScript, 외부 음원 없음(Web Audio 합성), 서버 없음(저장은 localStorage).
같은 저장소의 다른 게임(LAST CITY / SPEED RUSH / FRONTLINE / ZERO ZONE)의 코드와 자산을 인용·재사용합니다.

## 한눈에 보는 구조

시뮬레이션(화면 없음, 헤드리스로 테스트 가능)과 화면을 분리합니다. 시뮬레이션은 `Sim`(sim.ts) 하나가 모든 상태를 쥐고, 각 모듈은 `stepX(sim, dt)` 함수로 자기 몫의 AI/물리를 돌립니다.

| 파일 | 역할 |
|---|---|
| `types.ts` | **공용 계약**: 상수·무기/차량 표·Ped/Vehicle/Pickup/SimEvent/CityMap 등 모든 타입. 바꾸지 말고 필요하면 *필드를 추가*만 합니다. |
| `sim.ts` | 코어와 공용 서비스: 틱 순서, 보행 물리, 사격/근접, 피해·사망, 폭발, 탑승/하차, 줍기, 로켓, 화재, 상점/안전가옥/도색, 리스폰, 저장. |
| `world.ts` | 절차적 도시 생성(도로망·차선 그래프·건물·소품·POI·경사로) + 정적 충돌/레이캐스트/길찾기/신호등. |
| `vehicle.ts` | 차량 아케이드 물리(+충돌·피해·치기) 와 `autoDrive` 자동 운전 도우미. |
| `peds.ts` | 시민 AI(배회·도망·웅크림·구경)와 스트리밍. |
| `combat.ts` | 적대 보병 AI(경찰·특공대·군인·갱·보스): 접근/사격/이동/엄폐. |
| `traffic.ts` | 교통 AI(차선·신호·회피·패닉)와 차량 스트리밍(주차 차량 포함). |
| `police.ts` | 범죄 목격 → 수배 점수 → 별(0~5), 경찰 스폰/추적/체포, 별 단계별 증원(순찰차→특공대 밴→바리케이드→전차). |
| `missions.ts` | 미션 정의와 진행(상태 기계). |
| `assets.ts` | GLB 모델 로딩(city/models.ts 의 `loadModels` 재사용). |
| `textures.ts` | 절차적 캔버스 질감(아스팔트·인도·건물 외벽 6종·풀·콘크리트 등). |
| `cityview.ts` | 정적 도시 렌더링(도로·건물·소품·하늘/해/달/조명/안개, 낮밤). |
| `actorview.ts` | 동적 렌더링(보행자 리그·차량·줍기·마커·로켓·이펙트: 총구섬광/탄도/폭발/연기/불/스키드). |
| `camera.ts` | 3인칭 카메라(도보 어깨너머·조준·차량 추적·충돌 회피). |
| `audio.ts` | 효과음 + 엔진/사이렌 + 라디오(절차적 음악 3개 방송). |
| `minimap.ts` | 미니맵과 전체 지도(캔버스). |
| `game.ts`, `outlaw.css` | `openOutlaw(onExit, opts)`: 메뉴·입력(키보드·마우스·터치)·HUD·일시정지·상점 UI·루프. |

## 규칙(모든 작업자)

0. **디자인 & 게임 설계 지침은 DESIGN.md 를 따릅니다(아트 디렉션·HUD·손맛).**

1. **자기 파일만 수정합니다.** 다른 모듈의 파일을 고치지 마세요. 다른 모듈에서 필요한 게 있으면 최종 보고에 "요청 사항"으로 적습니다. `types.ts` 는 필드 *추가*만 허용(기존 필드 변경/삭제 금지).
2. 공개 함수 시그니처(스텁에 있는 것)는 유지합니다. 필요한 보조 export 는 자유롭게 추가해도 됩니다.
3. 좌표계: x,z 수평, y 위. 방향각은 앞 = (cos h, sin h). 렌더링에서 three.js 로 옮길 때 shooter(ZERO ZONE) 와 같은 규칙: `object.rotation.y = -yaw` (모델이 +x 를 정면으로 만들어져 있음), 카메라는 `rotation.order='YXZ'; rotation.set(pitch, -yaw - Math.PI/2, 0)`.
4. 시뮬레이션 모듈은 THREE 를 import 하지 않습니다(렌더링 모듈만 import). `Math.random` 대신 `sim.rng` 를 쓰면 재현 가능합니다(렌더링 이펙트는 Math.random 허용).
5. 매 틱 비용을 의식하세요: 보행자 ≤ 70, 교통·경찰 차량 ≤ 40, 플레이어 주변 `STREAM_RADIUS`(190m) 안에서만 AI 를 돌립니다. O(N²) 를 피하고 필요하면 간단한 공간 해시를 씁니다.
6. 파일 맨 위 한 줄 주석은 한국어로 모듈의 역할을 적습니다(기존 게임들과 같은 스타일). 코드 주석은 "왜"를 한국어로 짧게.
7. 검증: `npx tsc --noEmit` 에서 **자기 파일에 대한 오류가 없어야** 합니다(다른 사람 파일의 오류는 무시). 가능하면 헤드리스 테스트 스크립트를 *저장소 밖*(예: `C:/Users/danse/AppData/Local/Temp/outlaw-test/<모듈>/`)에 만들어 `npx tsx <스크립트>` 로 돌려 동작을 확인하고, 결과를 최종 보고에 적습니다. 저장소 안에 임시 파일을 남기지 마세요. 새 npm 패키지를 설치하지 마세요.
8. 최종 보고는 짧게: 구현한 것, 검증 결과, 알려진 한계, 다른 모듈에 대한 요청 사항.

## 재사용 가능한 기존 코드(인용 환영)

- `src/city/models.ts`: `loadModels(base, onProgress)` → `{ chars, vehicles, props, groundGuns, viewGuns, biz, ... }`, `instantiate(template, {team, paint})`, `bake(root)`. 차량 노드: sedan sports suv taxi truck van hatch police buggy tank. 캐릭터: civ civ2~civ8, cop, swat, boss, worker, rifle, merc, guard, heavy, sniper, medic. 소품: lamp bench bin hydrant mailbox bus_stop kiosk vending phone_booth street_sign bollards billboard cone barrier dumpster planter parasol tree_round tree_pine tl_green tl_red. 사업체 표식: biz_bank biz_casino biz_club biz_gas biz_gunshop biz_plant biz_store.
- `src/shooter/view.ts`: 병사 리그(`makeRig`/`poseRig`: 몸통·다리·정강이·팔 관절 애니메이션), 지형/건물 병합 지오메트리 기법(`worldBox`, `mergeGeometries`), 하늘(`textures.ts` 의 `makeSky`), 불꽃 입자, 탄도(tracer), 1인칭 무기.
- `src/shooter/textures.ts`: 절차적 캔버스 질감 작성 패턴. `src/shooter/audio.ts` + `src/audio-core.ts`: `AudioEngine`, `tone`, `burst` 로 합성 효과음 작성 패턴.
- `src/race/physics.ts`: 아케이드 차량 물리(조향·그립·드리프트) 참고. `src/race/view.ts`: 차량 모델 도색/바퀴 처리 참고.
- `src/shooter/game.ts`: 입력(포인터 락·키보드·터치 스틱)·HUD·모달·일시정지 구조 참고. `src/loading.ts`: `showLoading`.
- `src/prefs.ts`: `readPreferences()`(sound, quality).

## 테스트 도구

`npx tsx` 는 사용할 수 있습니다(이미 npx 캐시에 있음). 시뮬레이션은 `new Sim(seed)` 후 `sim.step(1/60, blankPedInput(), blankCarInput())` 를 반복하면 헤드리스로 돌아갑니다.

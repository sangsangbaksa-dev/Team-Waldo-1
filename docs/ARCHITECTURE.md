# 서바이벌 픽셀 아키텍처

> 상태: v0.2 (2026-11-11, 스캐폴딩 반영) · 대상: 7인 팀, 3주 · 스택: Phaser 3 + TypeScript + Vite + Vitest

## 1. 원칙

1. **sim은 게임의 진실이다.** 게임 규칙(이동, 충돌, 데미지, 스폰, 경험치, 레벨업)은 전부 `src/sim/`에 있고, Phaser를 import하지 않는다. Node에서 그대로 돌아가야 한다.
2. **render는 읽기만 한다.** `src/render/`와 `src/scenes/`는 sim 상태를 읽어서 그리고, 입력을 sim에 "명령"으로 넘길 뿐 상태를 직접 바꾸지 않는다.
3. **결정성.** 같은 시드 + 같은 입력 = 같은 결과. 고정 틱, 시드 RNG, `Math.random()`/`Date.now()` 금지(sim 안에서).
4. **콘텐츠는 데이터다.** 적, 무기, 패시브, 구간은 `data/*.json`에만 정의한다. 새 적을 추가할 때 코드 수정이 필요하면 설계가 잘못된 것이다.
5. **폴더 = 담당자.** 한 폴더는 한 사람이 주로 소유한다. 공용 파일(`sim/types.ts`, `data/schema.ts`)은 리드 리뷰 필수.

## 2. 폴더 구조

```
Team-Waldo-1/
├─ index.html
├─ package.json / tsconfig.json / vite.config.ts / vitest.config.ts
├─ .github/workflows/ci.yml        # lint + typecheck + test + data 검증 + build (Pages 배포는 추후 추가)
├─ data/                            # 기획 소유. 코드 없이 수정
│  ├─ enemies.json
│  ├─ weapons.json
│  ├─ passives.json
│  ├─ stages.json                   # 구간, 스폰 테이블, 보스
│  └─ balance.json                  # 경험치 곡선, 플레이어 기본 스탯, 전역 상수
├─ public/assets/                   # 아트 소유
│  ├─ sprites/  (atlas.png + atlas.json, TexturePacker/Aseprite 내보내기)
│  ├─ tiles/
│  ├─ ui/
│  └─ audio/sfx, audio/bgm
├─ src/
│  ├─ main.ts                       # Phaser.Game 생성, 씬 등록
│  ├─ sim/                          # 순수 TS. Phaser import 금지 (ESLint로 강제)
│  │  ├─ types.ts                   # 공용 타입: Vec2, EntityId, SimEvent, Command
│  │  ├─ world.ts                   # World 생성, step(), 시스템 실행 순서
│  │  ├─ rng.ts                     # 시드 RNG (mulberry32)
│  │  ├─ pool.ts                    # SoA 엔티티 풀
│  │  ├─ spatialHash.ts             # 충돌 질의
│  │  ├─ systems/
│  │  │  ├─ input.ts                # Command → 플레이어 속도
│  │  │  ├─ movement.ts
│  │  │  ├─ enemyAI.ts              # 추적, 돌진, 원거리 등 behavior 별
│  │  │  ├─ weapons.ts              # 쿨다운, 타깃팅, 투사체 생성
│  │  │  ├─ projectiles.ts
│  │  │  ├─ collision.ts            # 피격, 데미지, 넉백
│  │  │  ├─ pickups.ts              # 경험치 젬 흡수
│  │  │  ├─ progression.ts          # 경험치, 레벨업, 3지선다 생성
│  │  │  ├─ spawner.ts              # stages.json 기반 스폰
│  │  │  ├─ stage.ts                # 구간 전환, 미니보스, 보스
│  │  │  └─ cleanup.ts              # 죽은 엔티티 반납
│  │  ├─ weapons/                   # 무기 "패턴" 구현 (data의 pattern 값과 1:1)
│  │  │  ├─ index.ts                # pattern 이름 → 구현 레지스트리
│  │  │  ├─ projectile.ts / orbit.ts / aura.ts / beam.ts / ...
│  │  └─ bosses/                    # 보스 패턴 상태 기계
│  ├─ data/
│  │  ├─ schema.ts                  # zod 스키마 = JSON의 유일한 정의
│  │  ├─ load.ts                    # 검증 + id 참조 확인 → GameData
│  │  └─ index.ts                   # data/*.json을 import해서 loadGameData() 제공
│  ├─ render/                       # sim → 화면. 로직 금지
│  │  ├─ EntityRenderer.ts          # 엔티티 id ↔ 스프라이트 풀 동기화
│  │  ├─ EffectRenderer.ts          # SimEvent → 파티클, 데미지 숫자, 화면 흔들림
│  │  ├─ AudioBridge.ts             # SimEvent → 효과음
│  │  └─ Camera.ts
│  ├─ scenes/
│  │  ├─ BootScene.ts               # 에셋, data 로드
│  │  ├─ TitleScene.ts
│  │  ├─ GameScene.ts               # 틱 루프, 입력 → Command
│  │  ├─ HudScene.ts                # GameScene 위에 겹치는 UI (HP, 경험치, 타이머)
│  │  ├─ LevelUpScene.ts            # 3지선다 오버레이
│  │  └─ ResultScene.ts
│  └─ ui/                           # 버튼, 바, 패널 등 재사용 위젯
├─ tools/
│  ├─ validate-data.ts              # CI용: data/*.json 스키마 검증
│  ├─ bot.ts                        # 헤드리스 실행용 봇 (테스트와 시뮬레이션 공용)
│  └─ balance-sim.ts                # 헤드리스 N판 시뮬레이션 → CSV
└─ tests/
   ├─ sim/*.test.ts
   └─ data/*.test.ts
```

## 3. 틱 모델

- sim은 **고정 30Hz**(`DT = 1/30`)로 진행한다. 30Hz면 수백 마리 적도 여유 있고, render는 60fps로 두 틱 사이를 보간한다.
- `GameScene.update(time, delta)`에서 누적기 방식으로 돌린다.

```ts
acc += delta / 1000;
let steps = 0;
while (acc >= DT && steps < 5) {   // 5틱 상한: 탭 전환 후 폭주 방지
  world.step(commandsForThisTick);
  acc -= DT; steps++;
}
renderer.draw(world, acc / DT);     // alpha로 이전 위치~현재 위치 보간
```

- 일시정지(레벨업 선택, 메뉴)는 `world.paused = true`로 sim 틱만 멈춘다. render와 UI는 계속 돈다.
- `world.step()` 안의 시스템 순서는 고정한다:
  `input → stage → spawner → enemyAI → weapons → movement → projectiles → collision(해시 재구축 포함) → separation → pickups → progression → cleanup`

## 4. sim 상태 모델

엔티티가 수백~천 단위라서 객체 배열 대신 **타입별 SoA 풀**(Float32Array)을 쓴다. GC가 없고, 풀링이 기본으로 해결된다.

```ts
// sim/pool.ts
interface Pool {
  capacity: number;
  count: number;              // 살아 있는 수 (0..count-1이 활성, swap-remove)
  id: Uint32Array;            // 안정적 EntityId (render 매핑용, 재사용 시 증가)
  x: Float32Array; y: Float32Array;
  px: Float32Array; py: Float32Array;   // 이전 틱 위치 (보간용)
  vx: Float32Array; vy: Float32Array;
  hp: Float32Array;
  kind: Uint16Array;          // data 인덱스 (enemies[kind], weapons[kind] ...)
  flags: Uint8Array;          // 넉백, 무적 등
}

interface World {
  tick: number;
  time: number;               // 초
  rng: Rng;
  data: GameData;             // 검증된 JSON (읽기 전용)
  player: PlayerState;        // 단일 객체로 충분
  enemies: Pool;              // 용량 1500
  projectiles: Pool;          // 용량 2000
  pickups: Pool;              // 경험치 젬, 용량 1000 (초과 시 합치기)
  stage: StageState;          // 현재 구간, 경과 시간, 보스 상태
  events: SimEvent[];         // 이번 틱에 생긴 이벤트, 매 틱 비움
  paused: boolean;
  pendingChoices: UpgradeChoice[] | null;
  stats: RunStats;            // 처치 수, 점수, 받은 피해 등 결과 화면용
}
```

- 플레이어 무기와 패시브는 `player.weapons: {id, level, cooldown}[]`, `player.passives: {id, level}[]`.
- 최종 스탯은 매 틱 계산하지 않고, 레벨업 시 `recomputeStats(player, data)`로 한 번 계산해 캐시한다.

## 5. sim ↔ render 인터페이스

**경계는 세 가지뿐이다.** 이 파일들이 바뀌면 리드 리뷰.

### 5.1 입력: Command

```ts
type Command =
  | { t: 'move'; x: number; y: number }      // 정규화된 방향, WASD → GameScene이 변환
  | { t: 'choose'; index: 0 | 1 | 2 }        // 레벨업 선택
  | { t: 'pause' } | { t: 'resume' };
```

- 리플레이 = 시드 + 틱별 Command 목록. 버그 재현과 테스트에 그대로 쓴다.

### 5.2 상태 읽기

render는 `world`를 **읽기 전용**으로 받는다(`Readonly<World>` 타입 + 리뷰 규칙). `EntityRenderer`는 `pool.id`로 스프라이트를 매핑하고, 사라진 id의 스프라이트는 Phaser 쪽 풀에 반납한다.

### 5.3 이벤트: SimEvent

연출(이펙트, 사운드, 화면 흔들림, 데미지 숫자)은 상태 폴링이 아니라 이벤트로 받는다.

```ts
type SimEvent =
  | { t: 'hit'; target: EntityId; x: number; y: number; dmg: number; crit: boolean }
  | { t: 'kill'; target: EntityId; kind: number; x: number; y: number }
  | { t: 'playerHurt'; dmg: number; hp: number }
  | { t: 'fire'; weapon: string; x: number; y: number }
  | { t: 'pickup'; value: number }
  | { t: 'levelUp'; level: number; choices: UpgradeChoice[] }
  | { t: 'stageStart'; index: number }
  | { t: 'bossSpawn'; id: string }
  | { t: 'runEnd'; victory: boolean; stats: RunStats };
```

- `fire`처럼 잦은 이벤트는 render 쪽에서 틱당 재생 수를 제한한다(사운드 겹침 방지).

## 6. 데이터 스키마

`src/data/schema.ts`의 zod 스키마가 유일한 정의이고, TS 타입은 `z.infer`로 만든다. 로드 시 검증 실패하면 BootScene에서 어느 파일 어느 필드인지 화면에 띄운다. CI에서도 `tools/validate-data.ts`로 검사한다.

모든 항목은 사람이 읽는 `id`(문자열)를 키로 쓰고, 다른 파일에서도 id로 참조한다. 로더가 id → 숫자 인덱스로 바꿔 sim에 넘긴다.

### enemies.json

```json
[
  {
    "id": "slime_green",
    "base": "slime",
    "sprite": "slime",
    "palette": "green",
    "hp": 10, "speed": 40, "damage": 5, "radius": 6,
    "xp": 1,
    "behavior": "chase",
    "knockbackResist": 0
  },
  { "id": "slime_red", "base": "slime", "sprite": "slime", "palette": "red",
    "hp": 25, "speed": 45, "damage": 8, "radius": 6, "xp": 3, "behavior": "chase" }
]
```

- `behavior`: `chase` | `dash` | `ranged` | `swarm` | `tank` (enemyAI.ts에 구현, 베이스 5종에 대응)
- 팔레트 변형은 같은 `sprite` + 다른 `palette`. render가 팔레트 텍스처 또는 tint로 처리한다.
- `placeholderColor`: 스프라이트가 준비되기 전까지 원으로 그릴 때 쓰는 임시 색(적, 무기 공통).

### weapons.json

```json
[
  {
    "id": "magic_bolt",
    "name": "마법탄",
    "icon": "icon_magic_bolt",
    "pattern": "projectile",
    "targeting": "nearest",
    "levels": [
      { "damage": 10, "cooldown": 1.0, "count": 1, "speed": 200, "pierce": 0, "area": 1, "life": 1.5 },
      { "damage": 12, "cooldown": 0.9, "count": 1, "speed": 200, "pierce": 0, "area": 1 },
      { "damage": 12, "cooldown": 0.9, "count": 2, "speed": 220, "pierce": 1, "area": 1 }
    ]
  }
]
```

- `pattern`: `projectile` | `orbit` | `aura` | `beam` | `area_drop` | `boomerang` … (sim/weapons/에 1:1 구현). 무기 8종은 패턴 5~6개 + 수치 조합으로 만든다.
- `targeting`: `nearest` | `random` | `facing`
- 레벨 표의 `life`는 투사체 수명(초). 최대 레벨은 `levels` 배열 길이로 정한다.
- 구현된 패턴은 `projectile`, `orbit`(speed = 각속도, range = 거리), `aura`(range = 반경) 세 가지다. 나머지는 `sim/weapons/`에 파일을 추가하고 `index.ts`와 `schema.ts`에 등록한다.

### passives.json

```json
[
  { "id": "swift_boots", "name": "신속의 장화", "icon": "icon_boots", "maxLevel": 5,
    "stat": "moveSpeed", "op": "mul", "perLevel": 0.1 }
]
```

- `stat`: `moveSpeed` | `maxHp` | `damage` | `cooldown` | `area` | `pickupRange` | `xpGain` | `armor`

### stages.json

```json
{
  "map": "meadow",
  "stages": [
    {
      "id": "stage1",
      "duration": 420,
      "waves": [
        { "from": 0,   "to": 120, "enemy": "slime_green", "rate": 1.5, "pattern": "ring" },
        { "from": 60,  "to": 420, "enemy": "bat_purple",  "rate": 0.8, "pattern": "random_edge" },
        { "at": 300, "enemy": "slime_red", "count": 30, "pattern": "swarm" }
      ],
      "maxAlive": 300,
      "miniboss": { "enemy": "slime_king", "at": 400 }
    }
  ],
  "boss": { "enemy": "lich", "hpScale": 1.0 }
}
```

- `rate`는 초당 스폰 수, `at`은 일회성 웨이브. `duration`을 줄이면 개발 중 빠른 테스트가 된다.
- 개발용 `?speed=N` URL 파라미터 → 프레임당 틱을 N배 돌린다. DT는 그대로라서 결정성이 유지된다.

### balance.json

```json
{
  "player": { "hp": 100, "moveSpeed": 90, "pickupRange": 32, "radius": 6, "invulnTime": 0.5 },
  "xpCurve": { "base": 5, "growth": 1.25 },
  "choicesPerLevel": 3,
  "startingWeapon": "magic_bolt",
  "score": { "perKillXp": 10, "perSecond": 1, "bossBonus": 5000 }
}
```

## 7. 충돌

- 공간 해시 셀 크기 32px. 매 틱 적 위치로 재구축(배열 기반, 할당 없음).
- 질의: `queryCircle(x, y, r, out: Int32Array): number` → 결과 수 반환.
- 충돌 쌍: 투사체↔적, 적↔플레이어, 젬↔플레이어(흡수 반경), 적↔적 분리(약한 밀어내기, 매 틱 일부만).
- 원형 충돌만 사용. 맵 경계는 무한 맵 + 카메라 추적이므로 지형 충돌은 없음(맵 2개째에 벽이 필요하면 그때 추가).

## 8. 레벨업 3지선다

1. 경험치가 임계값을 넘으면 `progression`이 후보를 만든다: 보유 무기 강화, 보유 패시브 강화, 새 무기(슬롯 6개 미만일 때), 새 패시브(슬롯 6개 미만일 때).
2. 최대 레벨인 항목은 제외하고, `world.rng`로 가중치 추첨해 3개를 뽑는다(후보가 없으면 회복/골드).
3. `world.paused = true`, `levelUp` 이벤트 발행 → LevelUpScene 표시 → `choose` Command → 적용 후 재개.
4. 한 번에 여러 레벨이 오르면 큐에 쌓아 연속으로 보여준다.

## 9. 테스트와 밸런스 시뮬레이션

- **유닛 테스트(Vitest)**: spatialHash, rng, xp 곡선, 무기 쿨다운, 레벨업 후보 생성, 스폰 테이블 해석.
- **결정성 테스트**: 같은 시드 + 같은 Command 리플레이를 두 번 돌려 `world` 해시가 같은지 확인.
- **데이터 테스트**: 모든 JSON이 스키마 통과, id 참조가 전부 존재.
- **밸런스 시뮬레이션** (`npm run balance -- --runs 200`): 간단한 봇(가장 가까운 젬 쪽으로, 적 밀집 반대로 이동, 레벨업은 정책별 선택)으로 헤드리스 실행 → 생존 시간, 레벨 곡선, 무기별 처치 비율을 CSV로. 기획이 시트에 붙여 넣어 조정한다.

## 10. 성능 예산

- 목표: 적 500 + 투사체 1000에서 60fps (중급 노트북 크롬 기준).
- sim 틱당 4ms 이하. 3주차에 `?perf=1`로 틱 시간 오버레이 표시.
- render: 스프라이트는 아틀라스 1~2장, 데미지 숫자는 BitmapText 풀, 파티클은 이미터 재사용.

## 11. 코드 규칙과 협업

- **ESLint 규칙**: `src/sim/**`에서 `phaser`, `Math.random`, `Date`, `performance` import/사용 금지. `src/render/**`, `src/scenes/**`에서 world 필드 대입 금지(리뷰로 확인).
- **브랜치**: `main` 보호, 기능별 `feat/<담당>-<내용>`, PR 1명 리뷰 + CI 통과 후 머지.
- **CI**: `npm run lint && npm run typecheck && npm test && npm run validate-data`, main 머지 시 GitHub Pages 배포.
- **공용 파일**: `sim/types.ts`, `sim/world.ts`, `data/schema.ts`는 리드가 소유, 변경은 PR 설명에 이유를 적는다.

## 12. 폴더별 담당 (팀 구성 확정 전 가정: 개발 4, 아트 2, 기획 1)

| 영역 | 담당 |
|---|---|
| 스캐폴딩, `sim/world.ts`, `pool.ts`, `rng.ts`, `types.ts`, CI/배포, `data/schema.ts` | 개발1 (리드) |
| `spatialHash.ts`, `systems/weapons·projectiles·collision·pickups`, `sim/weapons/` | 개발2 |
| `systems/enemyAI·spawner·stage·progression`, `sim/bosses/` | 개발3 |
| `scenes/`, `render/`, `ui/` | 개발4 |
| `public/assets/sprites` (캐릭터, 적, 보스) | 아트1 |
| `public/assets/sprites` (무기, 이펙트), `tiles/`, `ui/` | 아트2 |
| `data/*.json`, `tools/balance-sim.ts` 결과 분석, `public/assets/audio` | 기획 |

## 13. 1주차 첫 3일 순서 (병목 제거용)

1. **1일차**: 개발1이 스캐폴딩 + `types.ts`/`world.ts` 뼈대 + `schema.ts` 초안 + CI를 올린다. 나머지 개발은 이 인터페이스를 리뷰한다. 아트는 팔레트와 32×32/16×16 크기 규격 확정, 기획은 balance.json/enemies.json 초안.
2. **2일차**: 개발2 충돌+자동공격, 개발3 스폰+적 추적, 개발4 GameScene 루프+EntityRenderer(사각형 플레이스홀더). 서로 `types.ts`만 공유하므로 병렬 진행 가능.
3. **3일차**: 합쳐서 "움직이고, 적이 오고, 쏘고, 죽고, 젬 먹는" 루프 확인 → Pages에 첫 배포.

## 14. 열린 질문

- 픽셀 해상도: 내부 해상도 480×270 + 정수배 확대를 제안 (아트 규격과 함께 1일차 확정).
- 팔레트 변형 방식: tint(간단, 색 표현 제한) vs 팔레트 스왑 셰이더/미리 만든 시트(정확). 제안은 **아트가 변형 시트를 미리 내보내기** — 구현 비용 0.
- 저장: 영구 성장이 없으므로 localStorage에 최고 점수만 저장.

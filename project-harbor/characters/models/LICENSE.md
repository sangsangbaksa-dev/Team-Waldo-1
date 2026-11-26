# Project Harbor 인물 모델

이 폴더의 `cast.glb`는 상업적으로 쓸 수 있는 CC0 소스만으로 만든 리깅된 성인 10명이다.
카툰 베이스, Mixamo, Ready Player Me, SMPL, three.js 예제 Soldier는 쓰지 않았다.
생성 도구 MPFB 2.0.18은 GPL-3.0이며 저장소에 포함하지 않는다. 배포되는 것은 생성된 메시뿐이다.

## 베이스 메시 · 리그 · 짧은 머리

- MakeHuman 베이스 메시, `game_engine` 리그, 시스템 헤어 `short04`
- 라이선스: CC0 1.0 (2020년 9월)
- 저작권자: Data Collection AB (https://www.datacollection.se), Joel Palmius, Jonas Hauquier

## 피부

- Margaret Toigo, `young_lightskinned_female_diffuse_Bronze.png`, `young_lightskinned_male_diffuse_Bronze.png`
- 라이선스: CC0 1.0. hm08 UV 아틀라스. 공식 팩 `skins01` / `skins02`
- 피부색 차이는 메시의 MakeHuman 인종 타깃과 머티리얼 `baseColorFactor`를 함께 쓴 결과다
- `skin_mh_old_lightskinned_male`처럼 대머리가 덧그려진 파생 PNG는 쓰지 않았다

## 옷

모두 CC0 1.0.

- Margaret Toigo: 피셔맨 스웨터, 울 팬츠, 남성 수트 3, 여성 수트, 남성 더블브레스티드 수트, 앵클 부츠(남/여), 플랫
- namuhekam: 남성 폴로 (`shirts01`)
- Elvaerwyn: `elvs_crude_t-shirt_male`
- Joel Palmius: `joepal_crude_t-shirt_female`
- Cortu: 카고 팬츠, 청반바지 (`pants01`)

긴 청바지는 이 팩에 없다. `pants01`의 데님은 반바지라, 울 팬츠와 카고 팬츠를 청바지 색으로 다시 칠해 긴 바지로 썼다.

`pants02`와 `shirts02`는 CC-BY라 포함하지 않았다.

## 머리

- 짧은 머리 `short04`: 위 MakeHuman 시스템 헤어, CC0
- 번 헤어: Rehman Polanski, `rehmanpolanski_hair_bun_brown` (`hair01`)
  - 팩 메타데이터는 CC0 (MakeHuman Ponytail01을 다듬은 것)
  - `.mhclo` 첫머리의 `license AGPL3` 한 줄은 MakeClothes 익스포터 템플릿이다. 팩 기록은 CC0이다

## 구성

`m-player`, `f-knit`, `m-polo`, `f-shirt`, `m-asian`, `f-cream`, `m-heavy`, `m-blazer`, `f-blazer`, `m-officer`.
클립 이름은 `<id>--idle|walk|run|talk|phone|sit`이다. 리그는 +Z를 바라본다.

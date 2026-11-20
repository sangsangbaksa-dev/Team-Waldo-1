import { readCityCareer, readRaceRecords, readRtsRecords, fmtTime } from './records';
import { readShooterCareer } from './shooter/records';
import { readOutlawSummary } from './outlaw/records';
import { readTycoonSummary } from './tycoon/core/save';
import { STAGE_NAMES } from './tycoon/core/data';
import type { GameId } from './game-launchers';

export interface Entry {
  id: GameId;
  name: string;
  genre: string;
  summary: string;
  facts: string[];
  image: string;
  imageAlt: string;
  status: () => string;
}

const base = import.meta.env.BASE_URL;

export const ENTRIES: Entry[] = [
  {
    id: 'city',
    name: 'LAST CITY',
    genre: '도시 점령 서바이벌',
    summary: '여덟 세력이 한 도시에 떨어졌습니다. 직접 총을 들고 사업체를 사들이고, 군대를 키워 마지막까지 남으세요.',
    facts: ['1인 플레이', '1인칭 · 3인칭 · 전술 시점', '키보드 · 마우스 · 터치'],
    image: `${base}assets/home/last-city.jpg`,
    imageAlt: '해 질 녘 LAST CITY의 거리 풍경',
    status: () => {
      const { matches, wins } = readCityCareer();
      return matches > 0 ? `${matches}판 · ${wins}승` : '';
    },
  },
  {
    id: 'race',
    name: 'SPEED RUSH',
    genre: '스포츠카 레이싱',
    summary: '라이벌과 순위를 겨루거나 타임어택에서 자신의 최고 기록에 도전하세요. 드리프트로 부스트를 모아 코너를 빠르게 탈출할 수 있습니다.',
    facts: ['코스 7곳 · 차량 8종', 'AI 레이스 · 타임어택', '키보드 · 터치'],
    image: `${base}assets/home/speed-rush.jpg`,
    imageAlt: '도심 서킷을 달리는 붉은 스포츠카',
    status: () => {
      const { bestLap, last } = readRaceRecords(), best = last ? bestLap[last.map] : undefined;
      return last && best !== undefined ? `${last.label} 최고 랩 ${fmtTime(best)}` : '';
    },
  },
  {
    id: 'rts',
    name: 'FRONTLINE',
    genre: '실시간 전략',
    summary: '광물을 캐고 기지를 세워 병력을 키우고, 상대의 모든 건물을 무너뜨리세요. AI는 쉬움부터 매우 어려움까지.',
    facts: ['AI 4단계 · 라인전', '일꾼 · 보병 · 전차 · 의무병', '키보드 · 마우스 · 터치'],
    image: `${base}assets/home/frontline.jpg`,
    imageAlt: '두 기지가 마주 선 FRONTLINE의 전장',
    status: () => {
      const { matches, wins } = readRtsRecords();
      return matches > 0 ? `${matches}판 · ${wins}승` : '';
    },
  },
  {
    id: 'shooter',
    name: 'ZERO ZONE',
    genre: '배틀로열 슈터',
    summary: '줄어드는 자기장 안에서 총을 줍고 싸웁니다. 비행기에서 낙하산으로 뛰어내려 AI 99명과 겨룹니다.',
    facts: ['AI 99명 · 비행기 낙하산 강하 · 난이도 4단계', '키보드 · 마우스 · 터치'],
    image: `${base}assets/home/zero-zone.jpg`,
    imageAlt: '자기장이 다가오는 들판에서 총을 든 병사',
    status: () => {
      const { matches, wins } = readShooterCareer();
      return matches > 0 ? `${matches}판 · ${wins}승` : '';
    },
  },
  {
    id: 'outlaw',
    name: 'OUTLAW CITY',
    genre: '오픈월드 범죄 액션',
    summary: '시민 8명 중 한 명으로 시작해 의뢰를 받고, 차를 몰고, 경찰을 따돌리세요. 배달·응급 이송·지하 격투·카지노·부동산·차고 수집까지 — 도시는 네 놀이터입니다.',
    facts: ['3인칭 오픈월드 · 차량 14종 · 무기 11종', '의뢰 7개 · 일거리 6종 · 카지노', '키보드 · 마우스 · 터치'],
    image: `${base}assets/home/outlaw-city.jpg`,
    imageAlt: '네온이 켜지는 황혼의 도시 거리와 추격전',
    status: () => {
      const r = readOutlawSummary();
      return r.has ? `의뢰 ${r.missions}/7 · 스턴트 ${r.stunts}/12` : '';
    },
  },
  {
    id: 'tycoon',
    name: 'HUSTLE',
    genre: '발로 뛰는 도시 타이쿤',
    summary: '벤치에서 눈을 뜬 빈털터리가 빈 병을 줍고, 알바를 뛰고, 작은 가게를 열어 사업·대기업을 거쳐 세계를 정복합니다. 도시는 당신의 걸음과 함께 자랍니다.',
    facts: ['3D 도시 · 낮밤 · 비', '빈털터리 → 세계 정복 7단계', '키보드 · 마우스 · 터치'],
    image: `${base}assets/home/hustle.jpg`,
    imageAlt: '해 질 녘 번화한 도시 거리와 간판 불빛',
    status: () => {
      const r = readTycoonSummary();
      return r.has ? (r.won ? `세계 정복 · ${r.day}일` : `${STAGE_NAMES[r.stage]} · ${r.day}일차`) : '';
    },
  },
  {
    id: 'room-tone',
    name: 'ROOM TONE',
    genre: '1인칭 심리 공포',
    summary: '폐쇄된 녹음 시설의 신호를 복원하세요. 발소리를 쫓아오는 잔향을 피해 네 구역을 빠져나가야 합니다.',
    facts: ['1인 플레이 · 약 30분', '탐색 · 퍼즐 · 추적', '자동 저장 · 터치 지원'],
    image: `${base}room-tone/keyart.jpg`,
    imageAlt: '녹음실 문 뒤에서 복도를 응시하는 잔향',
    status: () => '',
  },
];


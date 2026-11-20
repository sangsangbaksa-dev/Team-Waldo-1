import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// 실제 레이아웃은 브라우저에서만 계산되므로, 모바일 플레이 테스트에서 잡은 겹침·잘림 수정이
// 스타일시트에서 사라지지 않도록 규칙 자체를 지킵니다.
const css = (path: string): string => readFileSync(path, 'utf8');

describe('OUTLAW CITY 긴 카드의 하단 버튼', () => {
  const outlaw = css('src/outlaw/outlaw.css');
  it('주인공 선택·휴대폰·상점 카드는 스크롤되고 버튼 줄은 하단에 고정된다', () => {
    expect(outlaw).toMatch(/\.ol-card\.shop\{[^}]*max-height:92vh;overflow:auto/);
    expect(outlaw).toMatch(/\.ol-card\.hero \.ol-btns[^{]*\{[^}]*position:sticky;bottom:/);
  });
});

describe('Last City 모바일 HUD', () => {
  const city = css('src/city/city.css');
  it('세로 화면에서는 사격 버튼을 하단 HUD 위로 올린다', () => {
    expect(city).toMatch(/@media \(max-width:560px\) and \(orientation:portrait\)\{\.touch \.c-fire\{[^}]*bottom:1\d\dpx/);
  });
  it('태블릿 폭에서는 시계가 자금·병력 줄과 겹치지 않게 옆으로 비킨다', () => {
    expect(city).toMatch(/@media \(min-width:761px\) and \(max-width:870px\)\{\.c-tc\{left:298px;transform:none\}\}/);
  });
});

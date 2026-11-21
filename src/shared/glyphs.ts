// HUD 문자 기호(★ ◆)를 면 음영이 있는 작은 그림으로 대신합니다. 글자 크기(1em)에 맞춰 줄 안에서 같이 커집니다.
const svg = (body: string): string => `<svg class="wd-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
const STAR = '12,2 14.9,8.3 21.8,9 16.6,13.6 18.2,20.5 12,17 5.8,20.5 7.4,13.6 2.2,9 9.1,8.3';
const CORE = '12,7.2 13.5,10.5 17,10.9 14.4,13.3 15.1,16.8 12,15 8.9,16.8 9.6,13.3 7,10.9 10.5,10.5';

/** 별: on 이면 금빛 면 음영, 아니면 흐린 윤곽 */
export function starIcon(on = true): string {
  return svg(on
    ? `<polygon points="${STAR}" fill="#f4b73a" stroke="#6b4300" stroke-width="1.3" stroke-linejoin="round"/><polygon points="${CORE}" fill="#ffe27f"/><path d="M12 2L9.1 8.3 12 7.2z" fill="#fff3b8"/>`
    : `<polygon points="${STAR}" fill="#2f353d" stroke="#59616b" stroke-width="1.3" stroke-linejoin="round"/>`);
}

/** 크리스탈 보석 */
export function gemIcon(): string {
  return svg(`<polygon points="6,3 18,3 22,9 12,22 2,9" fill="#4ec3f2" stroke="#0b3a56" stroke-width="1.3" stroke-linejoin="round"/><polygon points="6,3 12,9 2,9" fill="#9be6ff"/><polygon points="18,3 22,9 12,9" fill="#7fd6f8"/><polygon points="2,9 12,9 12,22" fill="#2a90c4"/><polygon points="22,9 12,9 12,22" fill="#1f6fa0"/><polygon points="6,3 18,3 12,9" fill="#d4f4ff"/>`);
}

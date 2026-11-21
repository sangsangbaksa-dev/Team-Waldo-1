// 상점·특성·날씨 이모지를 면 음영이 있는 작은 SVG 그림으로 바꿉니다. 데이터(icon 필드)는 그대로 두고 화면에 그릴 때만 바꿉니다.
const svg = (body: string): string => `<svg class="wd-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
const O = 'stroke="#1b1f26" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"';

const DRAW: Record<string, string> = {
  // 조준경
  '🎯': `<circle cx="12" cy="12" r="9" fill="#d8433b" ${O}/><circle cx="12" cy="12" r="6" fill="#f4efe6"/><circle cx="12" cy="12" r="3.2" fill="#d8433b"/><path d="M12 1v5M12 18v5M1 12h5M18 12h5" ${O}/>`,
  // 번개
  '⚡': `<polygon points="14,1 4,14 11,14 9,23 20,9 13,9" fill="#ffc83a" ${O}/><polygon points="14,1 8,9 11,9" fill="#fff1a8"/>`,
  // 심장
  '❤️': `<path d="M12 21C4 15 2 11 2 8a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 3-2 7-10 13z" fill="#e23b4e" ${O}/><ellipse cx="7.5" cy="8" rx="2" ry="1.4" fill="#ff9aa6"/>`,
  // 반창고
  '🩹': `<rect x="2" y="8" width="20" height="8" rx="4" transform="rotate(-35 12 12)" fill="#e9b98a" ${O}/><rect x="8.5" y="9" width="7" height="6" transform="rotate(-35 12 12)" fill="#f6dcc0"/><path d="M11 12h2M12 11v2" stroke="#d8433b" stroke-width="1.4"/>`,
  // 운동화
  '👟': `<path d="M2 17v-5l5-1 4 3 8 1c2 0 3 1 3 3v1H2z" fill="#3f8fd8" ${O}/><path d="M2 18h20v2H2z" fill="#f4efe6" ${O}/><path d="M8 13l1 1M10 12.5l1 1" stroke="#f4efe6" stroke-width="1.2"/>`,
  // 돈 자루
  '💰': `<path d="M9 5h6l-2 3c5 2 8 6 8 9 0 3-3 5-9 5s-9-2-9-5c0-3 3-7 8-9z" fill="#c99a3c" ${O}/><path d="M9 5l1-3h4l1 3" fill="#a87a28" ${O}/><text x="12" y="19" font-size="8" font-weight="900" text-anchor="middle" fill="#3d2a06" font-family="sans-serif">$</text>`,
  // 철모
  '🪖': `<path d="M3 16a9 8 0 0 1 18 0z" fill="#5e7a3e" ${O}/><path d="M1 16h22v2.5H1z" fill="#45602a" ${O}/><path d="M7 10a6 5 0 0 1 4-3" stroke="#93b06a" stroke-width="1.4" fill="none"/>`,
  // 방패
  '🛡️': `<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="#4a78c4" ${O}/><path d="M12 2v20c-4.5-2-8-6-8-11V5z" fill="#6f9ae0"/><path d="M12 7v9M8 11h8" stroke="#f4efe6" stroke-width="1.6"/>`,
  // 가격표
  '🏷️': `<path d="M3 3h8l10 10-8 8L3 11z" fill="#f2a33a" ${O}/><circle cx="7.5" cy="7.5" r="1.6" fill="#1b1f26"/>`,
  // 핏방울
  '🩸': `<path d="M12 2c4 6 7 9 7 13a7 7 0 0 1-14 0c0-4 3-7 7-13z" fill="#b8202f" ${O}/><ellipse cx="9.5" cy="14" rx="1.4" ry="2.4" fill="#ff7a86"/>`,
  // 바람
  '💨': `<path d="M2 8h12a3 3 0 1 0-3-3M2 13h17a3 3 0 1 1-3 3M2 18h8" fill="none" stroke="#9fd3ff" stroke-width="2.4" stroke-linecap="round"/><path d="M2 8h12a3 3 0 1 0-3-3M2 13h17a3 3 0 1 1-3 3M2 18h8" fill="none" stroke="#1b1f26" stroke-width="0.6" stroke-linecap="round"/>`,
  // 코트
  '🧥': `<path d="M8 2l4 3 4-3 5 3-1 7h-2v10H6V12H4L3 5z" fill="#7a5638" ${O}/><path d="M12 5v17" stroke="#1b1f26" stroke-width="1.2"/><path d="M8 2l4 7 4-7" fill="#5a3d26" ${O}/>`,
  // 재장전 화살표
  '🔄': `<path d="M19 8a8 8 0 0 0-14 2M5 16a8 8 0 0 0 14-2" fill="none" stroke="#3fb6a8" stroke-width="2.6" stroke-linecap="round"/><polygon points="20,3 21,10 14,9" fill="#3fb6a8" ${O}/><polygon points="4,21 3,14 10,15" fill="#3fb6a8" ${O}/>`,
  // 상자
  '📦': `<polygon points="12,2 22,7 12,12 2,7" fill="#e0b071" ${O}/><polygon points="2,7 12,12 12,22 2,17" fill="#c48d4c" ${O}/><polygon points="22,7 12,12 12,22 22,17" fill="#a5733a" ${O}/><path d="M7 4.5l10 5v3" stroke="#f4dcb2" stroke-width="1.4" fill="none"/>`,
  // 컵
  '🥤': `<path d="M5 7h14l-2 15H7z" fill="#e24a4a" ${O}/><path d="M4 5h16v2H4z" fill="#f4efe6" ${O}/><path d="M13 5l3-4" stroke="#1b1f26" stroke-width="1.6"/><path d="M6.5 11h11" stroke="#ff9c9c" stroke-width="1.3"/>`,
  // 선글라스
  '🕶️': `<path d="M1 8h22v2h-1l-1 5a3 3 0 0 1-3 2h-1a3 3 0 0 1-3-2l-1-3h-2l-1 3a3 3 0 0 1-3 2H6a3 3 0 0 1-3-2l-1-5H1z" fill="#1d232b" ${O}/><path d="M5 11l2 3M15 11l2 3" stroke="#6f7b8a" stroke-width="1.2"/>`,
  // 샴페인
  '🍾': `<path d="M10 2h4v5l3 4v11H7V11l3-4z" fill="#2f6b3a" ${O}/><path d="M10 2h4v3h-4z" fill="#e8c35a" ${O}/><rect x="8.5" y="13" width="7" height="5" fill="#f2e2b0"/>`,
  // 크리스탈
  '◆': `<polygon points="6,3 18,3 22,9 12,22 2,9" fill="#4ec3f2" ${O}/><polygon points="6,3 12,9 2,9" fill="#9be6ff"/><polygon points="22,9 12,9 12,22" fill="#1f6fa0"/>`,
  // 슬롯머신
  '🎰': `<rect x="2" y="5" width="17" height="16" rx="2" fill="#c8323a" ${O}/><rect x="4.5" y="9" width="12" height="6" fill="#f4efe6" ${O}/><path d="M8.5 9v6M12.5 9v6" stroke="#1b1f26" stroke-width="1"/><path d="M21 6v8h-2" fill="none" stroke="#1b1f26" stroke-width="1.4"/><circle cx="21" cy="5" r="1.8" fill="#ffc83a" ${O}/>`,
  // 환전
  '💱': `<circle cx="8" cy="9" r="6" fill="#f2c040" ${O}/><circle cx="16" cy="15" r="6" fill="#56b46a" ${O}/><text x="16" y="18" font-size="8" font-weight="900" text-anchor="middle" fill="#123d1c" font-family="sans-serif">$</text>`,
  // 권총
  '🔫': `<path d="M2 7h19v5H10l-1 2h-2l-1 7H2l2-9H2z" fill="#3b424c" ${O}/><path d="M3 8h17v1.5H3z" fill="#7a8592"/><path d="M8 12a2 2 0 0 0 2 2" fill="none" stroke="#1b1f26" stroke-width="1.2"/>`,
  // 방탄 조끼
  '🦺': `<path d="M7 2l5 3 5-3 4 4-2 4v12H5V10L3 6z" fill="#4f5a3a" ${O}/><rect x="7" y="11" width="10" height="6" rx="1" fill="#3a4329" ${O}/><path d="M12 5v6" stroke="#1b1f26" stroke-width="1.2"/>`,
  // 별
  '⭐': `<polygon points="12,2 14.9,8.3 21.8,9 16.6,13.6 18.2,20.5 12,17 5.8,20.5 7.4,13.6 2.2,9 9.1,8.3" fill="#f4b73a" ${O}/><polygon points="12,7.2 13.5,10.5 17,10.9 14.4,13.3 15.1,16.8 12,15 8.9,16.8 9.6,13.3 7,10.9 10.5,10.5" fill="#ffe27f"/>`,
  // 날씨: 구름 낀 맑음
  '🌥️': `<circle cx="15" cy="8" r="5" fill="#ffc83a" ${O}/><path d="M5 20a4 4 0 0 1 0-8 5 5 0 0 1 9-1 4 4 0 0 1 4 4 3 3 0 0 1 0 5z" fill="#e6ebf2" ${O}/>`,
  // 날씨: 비
  '🌧️': `<path d="M5 14a4 4 0 0 1 0-8 5 5 0 0 1 9-1 4 4 0 0 1 4 4 3 3 0 0 1 0 5z" fill="#a9b6c8" ${O}/><path d="M7 17l-1 4M12 17l-1 4M17 17l-1 4" stroke="#4ea6f2" stroke-width="1.8" stroke-linecap="round"/>`,
  // 날씨: 뇌우
  '⛈️': `<path d="M5 13a4 4 0 0 1 0-8 5 5 0 0 1 9-1 4 4 0 0 1 4 4 3 3 0 0 1 0 5z" fill="#6c7688" ${O}/><polygon points="12,13 8,19 11,19 10,23 15,16 12,16" fill="#ffc83a" ${O}/>`,
};

// HUD 전용 그림(이모지 없이 이름으로 부릅니다): 자금·병력·구급 키트·상단 버튼·무기 슬롯
const GUN = (body: string, hi: string): string => `<g ${O} fill="#3b424c">${body}</g><g stroke="#8d99a8" stroke-width="1" stroke-linecap="round" fill="none">${hi}</g>`;
const HUD: Record<string, string> = {
  cash: `<circle cx="12" cy="12" r="10" fill="#e9b73a" ${O}/><circle cx="12" cy="12" r="7" fill="#f7d466" stroke="#b6862a" stroke-width="1"/><text x="12" y="16" font-size="10" font-weight="900" text-anchor="middle" fill="#6a4a0c" font-family="sans-serif">$</text><path d="M6 8a8 8 0 0 1 4-3" stroke="#fff3b8" stroke-width="1.4" fill="none" stroke-linecap="round"/>`,
  troops: `<path d="M3 15a9 8 0 0 1 18 0z" fill="#5e7a3e" ${O}/><path d="M1 15h22v3H1z" fill="#45602a" ${O}/><path d="M7 9a6 5 0 0 1 4-3" stroke="#93b06a" stroke-width="1.4" fill="none"/><path d="M12 18v3" ${O}/>`,
  kit: `<rect x="2" y="6" width="20" height="15" rx="3" fill="#f4efe6" ${O}/><path d="M8 6V4h8v2" fill="none" ${O}/><path d="M12 10v7M8.5 13.5h7" stroke="#d8433b" stroke-width="3" stroke-linecap="round"/>`,
  eye: `<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" fill="#f4efe6" ${O}/><circle cx="12" cy="12" r="4.5" fill="#3f8fd8" ${O}/><circle cx="12" cy="12" r="2" fill="#1b1f26"/><circle cx="10.6" cy="10.6" r="1" fill="#fff"/>`,
  clip: `<rect x="4" y="4" width="16" height="19" rx="2" fill="#e8dcc0" ${O}/><rect x="8" y="2" width="8" height="4" rx="1.2" fill="#8a8f96" ${O}/><path d="M7.5 11h9M7.5 15h9M7.5 19h5" stroke="#6b5a3a" stroke-width="1.4" stroke-linecap="round"/>`,
  map: `<path d="M2 5l6-2 8 2 6-2v16l-6 2-8-2-6 2z" fill="#cfe3b8" ${O}/><path d="M8 3v16M16 5v16" stroke="#1b1f26" stroke-width="1"/><path d="M10 10l4 4M14 10l-4 4" stroke="#d8433b" stroke-width="1.8" stroke-linecap="round"/>`,
  chat: `<path d="M3 4h18v12h-8l-5 5v-5H3z" fill="#f4efe6" ${O}/><path d="M7 8h10M7 12h6" stroke="#4a78c4" stroke-width="1.6" stroke-linecap="round"/>`,
  pause: `<rect x="5" y="4" width="5" height="16" rx="1.5" fill="#f4efe6" ${O}/><rect x="14" y="4" width="5" height="16" rx="1.5" fill="#f4efe6" ${O}/>`,
  'w:pistol': GUN('<path d="M3 8h17v4h-8l-1 2H9l-1 6H4l1.5-8H3z"/>', '<path d="M4 9.2h15"/>'),
  'w:smg': GUN('<path d="M2 8h18v4H11v2H9l-.5 4H6l.5-6H2zM13 12v7h-2.5v-7z"/>', '<path d="M3 9.2h16"/>'),
  'w:shotgun': GUN('<path d="M1 9h22v3H12l-3 3H5l1-3H1z"/><path d="M12 12h5v1.6h-5z" fill="#9a6a3a"/>', '<path d="M2 10.2h20"/>'),
  'w:rifle': GUN('<path d="M1 9h6l2-2h9v3h5v3h-9l-1 2h-2l-1 5H8l1-5H7l-2 2H1z"/>', '<path d="M10 8.4h8"/>'),
  'w:sniper': GUN('<path d="M1 11h20v2H12l-1 2H9l-.5 5H6l.5-5H1z"/><rect x="8" y="7" width="8" height="3" rx="1" fill="#1d232b"/>', '<path d="M9 8h6"/>'),
  'w:rocket': GUN('<path d="M2 7h20v6H2z" fill="#5e7a3e"/><path d="M19 4l4 6-4 6z" fill="#d8433b"/><path d="M8 13v7H5.5v-7z"/>', '<path d="M3 8.3h14"/>'),
  'w:minigun': GUN('<path d="M4 9h11v6H4zM15 10h8M15 12h8M15 14h8"/><path d="M4 15l-2 5h4l1-5z"/>', '<path d="M5 10.2h9"/>'),
  'w:railgun': `<g ${O} fill="#2a3544"><path d="M2 10h20v4H2z"/><path d="M6 14l-1 6h3l1-6z"/></g><path d="M3 12h18" stroke="#4ec3f2" stroke-width="1.8" stroke-linecap="round"/><path d="M5 10.8h14" stroke="#9be6ff" stroke-width="1" stroke-linecap="round"/>`,
};

/** HUD 그림을 이름으로 부릅니다. 모르는 이름은 빈 문자열이라 글자만 남습니다. */
export function hudIcon(name: string): string {
  return HUD[name] ? svg(HUD[name]) : '';
}

/** 그린 그림이 있으면 SVG, 없으면 원래 문자를 그대로 돌려줍니다. */
export function cityIcon(ch: string): string {
  return DRAW[ch] ? svg(DRAW[ch]) : ch;
}

export const ICON_KEYS = Object.keys(DRAW);

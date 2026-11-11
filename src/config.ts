/** 내부 해상도. 화면에는 정수배로 확대해 보여준다. */
export const GAME_WIDTH = 640;
export const GAME_HEIGHT = 360;

export const FONT = {
  fontFamily: "monospace",
  fontSize: "10px",
  color: "#ffffff",
} as const;

export function hexToInt(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

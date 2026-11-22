// 지도 표시용 그림 아이콘: 글자·이모지 대신 캔버스 도형으로 직접 그립니다. 좌표는 -1..1 정규화.
import type { PoiKind } from './types';

const INK = '#0b1114';
type Draw = (g: CanvasRenderingContext2D, c: string) => void;
const poly = (g: CanvasRenderingContext2D, pts: number[], fill: string | null, stroke: string | null = null): void => {
  g.beginPath(); g.moveTo(pts[0]!, pts[1]!); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!); g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.stroke(); }
};
const circ = (g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void => { g.fillStyle = fill; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
const line = (g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, c: string, w: number): void => { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };

const ICONS: Record<PoiKind, Draw> = {
  safehouse: (g, c) => { poly(g, [-.8, -.05, 0, -.8, .8, -.05], c); g.fillStyle = c; g.fillRect(-.6, -.05, 1.2, .8); g.fillStyle = INK; g.fillRect(-.14, .2, .28, .55); },
  gunshop: (g, c) => { poly(g, [-.85, -.35, .85, -.35, .85, -.05, .1, -.05, .05, .2, .0, .75, -.4, .75, -.3, -.05, -.85, -.05], c); g.fillStyle = INK; g.fillRect(.25, -.25, .5, .1); },
  paynspray: (g, c) => { g.fillStyle = c; g.fillRect(-.35, -.2, .7, .95); g.fillRect(-.22, -.5, .44, .3); g.fillRect(-.1, -.78, .5, .2); circ(g, .62, -.4, .08, c); circ(g, .74, -.2, .08, c); circ(g, .74, -.58, .08, c); g.fillStyle = INK; g.fillRect(-.2, .05, .4, .35); },
  hospital: (g, c) => { g.fillStyle = c; g.fillRect(-.22, -.78, .44, 1.56); g.fillRect(-.78, -.22, 1.56, .44); },
  police: (g, c) => { poly(g, [0, -.85, .72, -.55, .65, .25, 0, .85, -.65, .25, -.72, -.55], c); poly(g, [0, -.4, .14, -.08, .46, -.08, .2, .12, .3, .45, 0, .26, -.3, .45, -.2, .12, -.46, -.08, -.14, -.08], INK); },
  bank: (g, c) => { poly(g, [-.85, -.4, 0, -.85, .85, -.4], c); g.fillStyle = c; for (const x of [-.6, -.2, .2, .6]) g.fillRect(x - .08, -.3, .16, .8); g.fillRect(-.85, .6, 1.7, .2); },
  casino: (g, c) => { poly(g, [0, -.9, .75, 0, 0, .9, -.75, 0], c); circ(g, 0, 0, .2, INK); },
  garage: (g, c) => { poly(g, [-.85, -.1, -.5, -.1, -.3, -.5, .3, -.5, .55, -.1, .85, -.1, .85, .35, -.85, .35], c); circ(g, -.5, .4, .24, INK); circ(g, .5, .4, .24, INK); circ(g, -.5, .4, .1, c); circ(g, .5, .4, .1, c); },
  chopshop: (g, c) => { line(g, -.7, .7, .45, -.45, c, .34); poly(g, [.2, -.8, .85, -.3, .55, -.05, .0, -.5], c); line(g, .7, .7, -.45, -.45, c, .26); },
  club: (g, c) => { line(g, .35, -.7, .35, .4, c, .2); poly(g, [.35, -.7, .8, -.5, .8, -.25, .35, -.45], c); circ(g, .08, .45, .3, c); },
  dock: (g, c) => { line(g, 0, -.65, 0, .7, c, .18); circ(g, 0, -.7, .15, c); line(g, -.35, -.3, .35, -.3, c, .16); g.strokeStyle = c; g.lineWidth = .18; g.beginPath(); g.arc(0, .1, .7, .15 * Math.PI, .85 * Math.PI); g.stroke(); },
  park: (g, c) => { circ(g, 0, -.35, .45, c); circ(g, -.4, .05, .38, c); circ(g, .4, .05, .38, c); g.fillStyle = c; g.fillRect(-.1, .1, .2, .7); },
  start: (g, c) => { poly(g, [-.3, -.8, .3, -.8, .15, .2, -.15, .2], c); circ(g, 0, .6, .2, c); },
  dealer: (g, c) => { poly(g, [-.85, .05, -.55, .05, -.35, -.4, .3, -.4, .55, .05, .85, .05, .85, .45, -.85, .45], c); g.fillStyle = INK; g.fillRect(-.28, -.3, .24, .28); g.fillRect(.0, -.3, .24, .28); circ(g, -.5, .5, .22, INK); circ(g, .5, .5, .22, INK); },
  arena: (g, c) => { line(g, -.7, -.7, .7, .7, c, .22); line(g, .7, -.7, -.7, .7, c, .22); circ(g, 0, 0, .22, INK); circ(g, 0, 0, .12, c); },
};

/** 원형 배경 위에 종류별 그림을 중심 (0,0) 반지름 r 로 그립니다. */
export function drawPoiIcon(g: CanvasRenderingContext2D, kind: PoiKind, r: number, color: string): void {
  g.save(); g.scale(r, r); g.lineJoin = 'round'; g.lineCap = 'round';
  ICONS[kind](g, color); g.restore();
}
export const POI_KINDS = Object.keys(ICONS) as PoiKind[];

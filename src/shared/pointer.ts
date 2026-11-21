// 미니맵 방향 표시: 단색 삼각형 대신 윤곽·면 음영·광택이 있는 내비게이션 화살표를 그립니다. 현재 변환의 원점에서 +x 방향을 가리킵니다.
export function drawPointer(g: CanvasRenderingContext2D, r: number, fill: string, edge = '#0b0f14'): void {
  const tip = r, back = -r * .72, wing = r * .78, notch = -r * .3;
  g.save(); g.lineJoin = 'round';
  g.shadowColor = fill; g.shadowBlur = r * .9;
  g.beginPath(); g.moveTo(tip, 0); g.lineTo(back, -wing); g.lineTo(notch, 0); g.lineTo(back, wing); g.closePath();
  g.fillStyle = fill; g.fill(); g.shadowBlur = 0;
  g.lineWidth = Math.max(1.5, r * .18); g.strokeStyle = edge; g.stroke();
  g.beginPath(); g.moveTo(tip, 0); g.lineTo(back, -wing); g.lineTo(notch, 0); g.closePath(); g.fillStyle = '#ffffff7a'; g.fill();
  g.beginPath(); g.moveTo(tip, 0); g.lineTo(back, wing); g.lineTo(notch, 0); g.closePath(); g.fillStyle = '#00000040'; g.fill();
  g.beginPath(); g.arc(notch + r * .3, 0, Math.max(1, r * .13), 0, Math.PI * 2); g.fillStyle = edge; g.fill();
  g.restore();
}

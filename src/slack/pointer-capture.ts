type CaptureTarget = Pick<Element, 'setPointerCapture' | 'hasPointerCapture' | 'releasePointerCapture'>;

export function capturePointer(target: CaptureTarget, id: number): void {
  try { target.setPointerCapture(id); } catch { /* Window-level release handles unsupported capture. */ }
}

export function releasePointer(target: CaptureTarget, id: number | null): void {
  if (id === null) return;
  try {
    if (target.hasPointerCapture(id)) target.releasePointerCapture(id);
  } catch { /* The pointer may have already been cancelled. */ }
}

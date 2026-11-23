export function createDrawBudget(maxFps: number) {
  const interval = 1 / maxFps;
  let elapsed = 0;
  let lastView: string | null = null;

  return (view: string, dt: number): boolean => {
    if (view !== lastView) {
      lastView = view;
      elapsed = 0;
      return true;
    }
    elapsed += Number.isFinite(dt) ? Math.max(0, dt) : 0;
    if (elapsed + 1e-9 < interval) return false;
    elapsed %= interval;
    return true;
  };
}

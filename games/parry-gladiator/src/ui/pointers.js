/** Map a finger on the movement pad into a unit stick. The pad box is a DOM rect. */
export function stickFromPoint(clientX, clientY, box, radiusScale = 0.39) {
  const radius = Math.max(1, box.width * radiusScale);
  const x = (clientX - box.left - box.width / 2) / radius;
  const y = (clientY - box.top - box.height / 2) / radius;
  const scale = Math.max(1, Math.hypot(x, y));
  const axis = (v) => v === 0 ? 0 : v;
  return { x: axis(x / scale), z: axis(-y / scale), px: axis(x / scale) * radius, py: axis(y / scale) * radius };
}

/** The first finger owns the control. A later finger cannot steal or release it. */
export function claimPointer(current, id) {
  return current === null ? id : current;
}

export function releasePointer(current, id) {
  return current === id ? null : current;
}

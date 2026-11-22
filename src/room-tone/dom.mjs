/** Fixed HTML controls are stable; reuse their nodes inside the render loop. */
export function createIdLookup(root) {
  const cache = new Map();
  return (id) => {
    if (cache.has(id)) return cache.get(id);
    const element = root.getElementById(id);
    if (element) cache.set(id, element);
    return element;
  };
}

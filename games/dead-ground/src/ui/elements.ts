export function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing UI element: ${id}`);
  return node as T;
}

export function setText(node: HTMLElement, value: string | number): void {
  const text = String(value);
  if (node.textContent !== text) node.textContent = text;
}

export function notice(node: HTMLElement, message = ''): void {
  setText(node, message);
  node.hidden = !message;
}

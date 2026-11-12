import { icon } from './icons';

interface DialogOptions { eyebrow?: string; title: string; body: string; confirm?: string; cancel?: string; onConfirm?: () => void; onClose?: () => void; }
/** Body is developer-owned markup. Never interpolate untrusted save content. */
export function showDialog(options: DialogOptions): () => void {
  const previous = document.activeElement as HTMLElement | null;
  const layer = document.createElement('div'); layer.className = 'dialog-backdrop';
  layer.innerHTML = `<section class="game-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1"><button class="icon-button dialog-x" aria-label="닫기">${icon('close')}</button><div class="kicker">${options.eyebrow ?? 'TEAM WALDO'}</div><h2 id="dialog-title"></h2><div class="dialog-body">${options.body}</div><div class="dialog-actions"><button class="button secondary dialog-cancel"></button>${options.confirm ? '<button class="button primary dialog-confirm"></button>' : ''}</div></section>`;
  layer.querySelector('#dialog-title')!.textContent = options.title;
  layer.querySelector('.dialog-cancel')!.textContent = options.cancel ?? '닫기';
  document.body.append(layer);
  let closed = false;
  const close = () => {
    if (closed) return; closed = true; layer.remove();
    previous?.focus(); options.onClose?.();
  };
  layer.querySelector<HTMLButtonElement>('.dialog-x')!.onclick = close;
  layer.querySelector<HTMLButtonElement>('.dialog-cancel')!.onclick = close;
  const confirm = layer.querySelector<HTMLButtonElement>('.dialog-confirm');
  if (confirm) { confirm.textContent = options.confirm!; confirm.onclick = () => { close(); options.onConfirm?.(); }; }
  layer.addEventListener('click', event => { if (event.target === layer) close(); });
  layer.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key !== 'Tab') return;
    const focusable = [...layer.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, [tabindex="0"]')];
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  layer.querySelector<HTMLButtonElement>('.dialog-cancel')!.focus();
  return close;
}

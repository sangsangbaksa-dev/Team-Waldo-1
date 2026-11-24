import { createLoadSession, type LoadSession } from '../application/session';

export interface LoadingScreen {
  /** 진행률(0~1). null 이면 지금까지의 퍼센트를 유지한 채 기다리는 표시만 합니다. */
  progress(fraction: number | null, label?: string): void;
  /** 진행 막대 아래 보조 안내. 빈 문자열이면 지웁니다. */
  note(text: string): void;
  /** 100%까지 채운 뒤 화면을 걷어 게임으로 넘깁니다. */
  close(): void;
}

function paint(session: LoadSession, el: HTMLElement): void {
  const snap = session.snapshot();
  const bar = el.querySelector<HTMLElement>('.ld-bar')!;
  const fill = el.querySelector<HTMLElement>('.ld-bar i')!;
  const label = el.querySelector<HTMLElement>('.ld-label')!;
  const pct = el.querySelector<HTMLElement>('.ld-pct')!;
  const note = el.querySelector<HTMLElement>('.ld-note')!;
  label.textContent = snap.label;
  note.textContent = snap.note;
  fill.style.width = `${(snap.fraction * 100).toFixed(1)}%`;
  pct.textContent = `${snap.percent}%`;
  bar.setAttribute('aria-valuenow', String(snap.percent));
  bar.classList.toggle('done', snap.phase === 'ready');
}

/** 게임을 불러오는 동안 고정해 두는 게이지. 실패 화면으로 갈아타지 않습니다. */
export function showLoading(title: string): LoadingScreen {
  document.querySelector('.ld-screen')?.remove();
  const session = createLoadSession('불러오는 중');
  const el = document.createElement('div');
  el.className = 'ld-screen';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = `<div class="ld-box"><div class="ld-kicker">WALDO</div><h2 class="ld-title"></h2><div class="ld-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="불러오는 중"><i></i></div><div class="ld-row"><span class="ld-label">불러오는 중</span><span class="ld-pct">0%</span></div><p class="ld-note"></p></div>`;
  el.querySelector('.ld-title')!.textContent = title;
  document.body.append(el);
  paint(session, el);
  const bar = el.querySelector<HTMLElement>('.ld-bar')!;
  const timer = window.setInterval(() => {
    if (!el.isConnected) { window.clearInterval(timer); return; }
    session.tick(Date.now());
    paint(session, el);
  }, 400);
  let closed = false;
  return {
    progress(fraction, text) {
      if (!el.isConnected || closed) return;
      if (fraction === null) { bar.classList.add('busy'); session.hold(text); }
      else { bar.classList.remove('busy'); session.report(fraction, text); }
      paint(session, el);
    },
    note(text) {
      if (!el.isConnected || closed) return;
      session.note(text);
      paint(session, el);
    },
    close() {
      if (closed) return;
      closed = true;
      window.clearInterval(timer);
      if (!el.isConnected) return;
      bar.classList.remove('busy');
      session.complete('준비되었습니다');
      paint(session, el);
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) { el.remove(); return; }
      window.setTimeout(() => el.remove(), 420);
    },
  };
}

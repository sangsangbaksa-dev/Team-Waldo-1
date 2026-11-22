// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import { rosterHtml, updateRoster } from '../../src/squad/rails';
import { Battle } from '../../src/squad/sim';

vi.mock('../../src/squad/sprites', () => ({ spriteUrl: () => 'data:image/png;base64,AA==' }));

it('updates roster HP and alive counts without recreating sprite DOM nodes', () => {
  const battle = new Battle(
    [{ type: 'guard', x: 3, y: 11 }, { type: 'medic', x: 4, y: 13 }],
    [{ type: 'striker', x: 2, y: 8 }],
  );
  const root = document.createElement('div');
  root.innerHTML = rosterHtml(battle);
  const guard = root.querySelector<HTMLElement>('[data-side="0"][data-unit="guard"]')!;
  const img = guard.querySelector('img');
  const bar = guard.querySelector<HTMLElement>('i')!;
  const beforeMarkup = root.querySelectorAll('img').length;
  battle.units[0]!.hp = 0;
  updateRoster(root, battle);
  expect(root.querySelector('[data-side="0"][data-unit="guard"]')).toBe(guard);
  expect(guard.querySelector('img')).toBe(img);
  expect(guard.classList.contains('out')).toBe(true);
  expect(guard.querySelector('b')?.textContent).toBe('0/1');
  expect(bar.style.getPropertyValue('--hp')).toBe('0%');
  expect(root.querySelectorAll('img')).toHaveLength(beforeMarkup);

  battle.units[1]!.hp = 80;
  updateRoster(root, battle);
  const medic = root.querySelector<HTMLElement>('[data-side="0"][data-unit="medic"]')!;
  expect(medic.querySelector('b')?.textContent).toBe('1/1');
  expect(medic.querySelector<HTMLElement>('i')?.style.getPropertyValue('--hp')).not.toBe('100%');
  // Repeated no-change updates must not tear down the roster.
  updateRoster(root, battle);
  expect(root.querySelector('[data-side="0"][data-unit="guard"]')).toBe(guard);
  expect(guard.querySelector('img')).toBe(img);
});

// 앱 전체가 공유하는 백엔드 한 개와 로그인 상태. 게임 코드는 이 파일만 불러오면 됩니다.
import type { Account, Backend } from './types';

let backend: Promise<Backend> | null = null;
export function getBackend(): Promise<Backend> {
  backend ??= (async () => {
    if (import.meta.env.DEV && new URLSearchParams(location.search).get('pvp') === 'local') return (await import('./local')).createLocalBackend();
    return (await import('./supabase')).createSupabaseBackend();
  })();
  return backend;
}

let current: Account | null | undefined;
const listeners = new Set<(a: Account | null) => void>();
export function onAccount(fn: (a: Account | null) => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }
export function setAccount(a: Account | null): void { current = a; listeners.forEach(fn => fn(a)); }
export async function currentAccount(): Promise<Account | null> {
  if (current === undefined) { try { current = await (await getBackend()).account(); } catch { current = null; } }
  return current;
}

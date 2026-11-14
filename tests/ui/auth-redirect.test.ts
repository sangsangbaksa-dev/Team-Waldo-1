// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errText } from '../../src/net/types';

const lobby = vi.hoisted(() => ({ openLobby: vi.fn<(o: { notice?: string }) => void>() }));
const account = vi.hoisted(() => ({ currentAccount: vi.fn(), setAccount: vi.fn(), onAccount: vi.fn(), getBackend: vi.fn() }));
vi.mock('../../src/net/lobby', () => ({ openLobby: lobby.openLobby }));
vi.mock('../../src/net/backend', () => account);
vi.mock('../../src/city/game', () => ({ openCity: vi.fn() }));
vi.mock('../../src/race/game', () => ({ openRace: vi.fn() }));

async function loadMenu(hash: string): Promise<void> {
  history.replaceState(null, '', '/Team-Waldo-1/' + hash);
  await import('../../src/main');
  await vi.dynamicImportSettled();
}
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); document.body.innerHTML = '<div id="game"></div>'; localStorage.clear(); });

describe('가입 확인 메일 링크로 돌아왔을 때', () => {
  it('링크가 만료됐으면 안내와 함께 로비를 열고 주소의 오류 해시를 지운다', async () => {
    await loadMenu('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    await vi.waitFor(() => expect(lobby.openLobby).toHaveBeenCalledTimes(1));
    expect(lobby.openLobby.mock.calls[0]![0].notice).toMatch(/만료|다시 받기/);
    expect(location.hash).toBe('');
    expect(location.pathname).toBe('/Team-Waldo-1/');
  });

  it('인증에 성공하면 로그인된 상태로 안내한다', async () => {
    account.currentAccount.mockResolvedValue({ id: 'u1', email: 'a@x.dev', nickname: 'Alpha' });
    await loadMenu('#access_token=abc&refresh_token=def&type=signup');
    await vi.waitFor(() => expect(lobby.openLobby).toHaveBeenCalledTimes(1));
    expect(account.setAccount).toHaveBeenCalledWith(expect.objectContaining({ nickname: 'Alpha' }));
    expect(lobby.openLobby.mock.calls[0]![0].notice).toMatch(/인증이 끝났/);
  });

  it('해시가 없으면 아무것도 열지 않는다', async () => {
    await loadMenu('');
    await new Promise(r => setTimeout(r, 20));
    expect(lobby.openLobby).not.toHaveBeenCalled();
  });

  it('오류 문구를 읽기 쉽게 바꾼다', () => {
    expect(errText(new Error('Email link is invalid or has expired'))).toMatch(/다시 받기/);
    expect(errText(new Error('Email not confirmed'))).toMatch(/인증 메일/);
  });
});

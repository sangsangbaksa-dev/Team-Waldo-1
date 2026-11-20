import type { LoadingScreen } from './loading';

export type GameId = 'city' | 'race' | 'rts' | 'shooter' | 'outlaw' | 'tycoon' | 'room-tone';
type EmbeddedGameId = Exclude<GameId, 'room-tone'>;
type StartGame = (onExit: () => void, loading: LoadingScreen) => void;

// Keep dynamic imports explicit so Vite creates lazy chunks for each game.
// Adapt the game-specific boot contracts at this boundary, not in the hub.
export const gameLoaders: Record<EmbeddedGameId, () => Promise<StartGame>> = {
  city: async () => { const { openCity } = await import('./city/game'); return (exit, loading) => openCity(exit, { loading }); },
  race: async () => { const { openRace } = await import('./race/game'); return (exit, loading) => { openRace(exit); loading.close(); }; },
  rts: async () => { const { openRts } = await import('./rts/game'); return (exit, loading) => openRts(exit, { loading }); },
  shooter: async () => { const { openShooter } = await import('./shooter/game'); return (exit, loading) => openShooter(exit, { loading }); },
  outlaw: async () => { const { openOutlaw } = await import('./outlaw/game'); return (exit, loading) => openOutlaw(exit, { loading }); },
  tycoon: async () => { const { openTycoon } = await import('./tycoon/game'); return (exit, loading) => openTycoon(exit, { loading }); },
};

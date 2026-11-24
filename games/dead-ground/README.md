# Dead Ground

Dead Ground is a 3D first-person sniper arena for desktop browsers. The Foundry is a 1,024 × 1,024 m industrial valley with sightlines across hilltops, blast craters, and trenches. Take cover among ruined buildings, rocks, sandbags, wrecks, and burnt trees.

## Run

Requires Node.js 22.12+ and a desktop browser with WebGL 2, a mouse, and a keyboard. From the repository root:

```sh
cd games/dead-ground
npm install
npm run build
npm test
npm start
```

Open [http://localhost:8080](http://localhost:8080). The Node server serves the built client and the WebSocket endpoint on the same port.

- **Deploy solo** starts a local round with five bots. It also works on a static host serving `dist/`.
- **Online rooms** lets a host create a private five-character code. Other players open the same server URL, choose **Join room**, and enter the code. The host can start when at least two players are present, up to six total. Players join before a round starts.
- **No server needed:** a build with `VITE_ROOM_TRANSPORT=relay` (the Vercel build sets it) lets the player who creates a room host it in their browser. Rivals connect through a Supabase Realtime Broadcast channel using the same five-character code. Keep the host tab open and visible; closing it ends the room. Use `?transport=relay` to try it on any build, or `?transport=local` for two tabs on one machine.
- For a LAN match, share the host computer’s LAN address and port. For internet play, place the Node server behind an HTTPS proxy that forwards WebSocket upgrades at `/ws`. Use `PORT` to change the server port. For a separately hosted client, set `VITE_WS_URL` to the full `wss://…/ws` endpoint before building.
- For development, run `npm run dev` for Vite and `npm run dev:server` in another terminal for online rooms. The Vite dev proxy expects the server on port 8080.

## Play

| Input | Action |
| --- | --- |
| W A S D / mouse | Move / look |
| Shift / C | Sprint forward / crouch |
| J / Left click | Fire one round |
| Hold K / right click | Scope in |
| Scroll while scoped / Z | Select 4×, 8×, or 16× zoom |
| Hold Space while scoped | Steady aim while the breath meter lasts |
| R | Reload |
| Tab / M | Hold for standings / toggle the field map |
| Esc | Field menu |

Every player carries the same DG-16 bolt-action rifle. The scope starts at 16× and scales mouse sensitivity with magnification. Bolt cycling animates the rifle while leaving the camera steady. Shots have travel time and drop. Lead moving targets and hold above distant ones. A headshot eliminates immediately and a body hit deals 65 damage. Players respawn after three seconds with a three-second shield, which drops when they fire.

A free-for-all round ends at 12 eliminations or after six minutes. Standings use kills, fewer deaths, and then headshots. The debrief offers a rematch. In online rooms, the host controls the rematch. Escape pauses solo simulation. Online matches keep running while the menu is open. Performance mode in the field menu reduces rendering resolution and disables dynamic shadows.

## Code

| Layer | Responsibility |
| --- | --- |
| `src/domain/` | Terrain and cover, movement, projectiles, damage, rounds, and bot decision logic |
| `src/application/` | Session contract, solo orchestration, room protocol, and the transport-free room rules (`rooms.ts`) |
| `src/infrastructure/` | Three.js rendering, Web Audio, and room links (WebSocket, or a player-hosted room over Realtime Broadcast) |
| `src/ui/` | Menu, input, scope, HUD, field map, and composition |
| `server/` | Authoritative room state, input validation, fixed-step simulation, and static hosting |

The domain is independent of Three.js, browser APIs, and Node. Solo and online modes run the same deterministic terrain and authoritative match rules. Online players send input while the server owns movement, projectiles, health, and scores. Bots use sightlines and cover to choose firing and hiding positions. The browser predicts local movement and interpolates remote players.

The title artwork was generated for this game. Barlow Condensed and IBM Plex Mono are bundled under their SIL Open Font Licenses in `public/fonts/`.

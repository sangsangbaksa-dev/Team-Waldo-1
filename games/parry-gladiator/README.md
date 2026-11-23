# Parry Gladiator

A WebGL 2 arena duel built with Three.js and Vite. Win two rounds against a friend or one of three AI difficulty levels. Combat Practice teaches guarding, parrying, ripostes, and dodging against a repeatable opponent.

```sh
npm ci
npm run dev
npm test
npm run build
```

Open the URL printed by Vite. Solo and practice modes run entirely in the browser. The production build lives in `dist/` and can be hosted as static files. For Vercel, select the Vite preset, use `npm run build`, and set the output directory to `dist`.

| Action | Keyboard and mouse |
| --- | --- |
| Move while locked onto your rival | WASD or arrow keys |
| Light strike or riposte | J or left mouse |
| Heavy strike | K |
| Feint a heavy strike during its windup | F |
| Guard or parry | Q or right mouse |
| Dodge | Space, with a direction or backward from neutral |
| Match menu | Escape |

Touch devices show a movement pad and combat buttons. The Heavy button becomes Feint during its windup. Raise guard in the last 170 ms before impact to parry. A successful parry staggers your rival and opens a riposte with Light. Blocking too many hits while low on stamina breaks your guard. If the round timer expires, higher health wins. Ties go to sudden death.

## Online rooms

### No server needed (default)

Leave the **Room server** field empty. The player who creates the room runs the duel in their browser and the rival connects through a Supabase Realtime Broadcast channel, so a static host such as Vercel is enough. Share the five-character code, keep the host tab open and visible, and the rival joins with the code. The host's browser is authoritative, so the host has no input delay. If the host closes the tab the room closes. For two tabs on one machine add `?relay=local` to the URL.

### Dedicated room server (optional)

Run the persistent Node process separately from the static frontend. Node.js 20 or later is recommended.

```sh
npm ci --omit=dev
PORT=8080 npm run server
```

Host the server on a service that supports long-lived WebSocket connections. Put it behind a TLS proxy for public use and forward the WebSocket Upgrade headers. The same port serves `GET /healthz`. Configure `ALLOWED_ORIGINS` as a comma-separated list of allowed frontend origins when exposing the server publicly. It defaults to accepting any origin.

| Setting | Example | Use |
| --- | --- | --- |
| `PORT` | `8080` | Room server listening port |
| `ALLOWED_ORIGINS` | `https://parry-gladiator.example` | Optional WebSocket origin allowlist |
| `VITE_ROOM_SERVER` | `wss://duels.example` | Optional frontend build-time default |

For a local duel, run the frontend and room server in separate terminals and open two browser tabs. Both players use `ws://localhost:8080`. The first creates a room and shares its five-character code. The second joins with that code. A deployed HTTPS frontend should use a `wss://` address. Use matching frontend and server versions.

The server owns movement, damage, stamina, round results, and rematches. Clients send directional input and actions, and the server streams state snapshots at 20 Hz. Rooms are ephemeral and close when a player leaves. The server does not require a database or accounts. Keep rooms on one process unless the hosting layer provides session affinity.

## Source layout

- `src/domain` contains fighter state, movement constraints, and combat rules.
- `src/application` runs the fixed-step simulation, opponents, practice, and the room protocol.
- `src/infrastructure` handles rendering, audio, and WebSocket transport.
- `src/ui` contains menus, HUD, settings, and control adapters. `src/main.js` connects the layers.
- `src/application/rooms.js` holds the authoritative room rules. `server` drives them from WebSockets and `src/infrastructure/relay-network.js` drives them from a player's browser.
- `server` hosts rooms and uses the same simulation as solo mode.
- `tests` covers combat timing, rounds, practice progression, and the two-client WebSocket flow.

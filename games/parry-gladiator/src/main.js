import './ui/style.css';
import { Game } from './application/game.js';
import { Practice } from './application/practice.js';
import { roomCode, validRoom, validSnapshot } from './application/room-protocol.js';
import { Scene } from './infrastructure/scene.js';
import { ArenaAudio } from './infrastructure/audio.js';
import { Network, parseServerUrl } from './infrastructure/network.js';
import { RelayNetwork } from './infrastructure/relay-network.js';
import { Controls } from './ui/input.js';
import { readSettings, saveSettings } from './ui/settings.js';
import { View, showGraphicsError } from './ui/view.js';

const settings = readSettings();
settings.server ||= import.meta.env.VITE_ROOM_SERVER || (['localhost', '127.0.0.1'].includes(location.hostname) ? 'ws://localhost:8080' : '');
const relayKind = new URLSearchParams(location.search).get('relay') === 'local' ? 'local' : 'supabase';
const audio = new ArenaAudio();
audio.configure(settings);

const view = new View(document.querySelector('#app'), { command, setting });
const world = view.find('#world');
view.root.dataset.motion = settings.motion;
let scene = null;
try { scene = new Scene(world); } catch { showGraphicsError(world); }
scene?.setQuality?.(settings.quality);

let game = new Game(feedback);
let state = game.snapshot();
let mode = null;
let screen = 'home';
let local = 0;
let network = null;
let relayRoom = false;
let code = '';
let lastInput = 0;
let rematchRequested = false;
let lastPing = 0;
let pingMs = null;
let paused = false;
let noticeTimer = 0;
let graphicsLost = false;
let resultScreen = false;

const controls = new Controls({ enabled: () => !!mode && !paused && !resultScreen && !graphicsLost, action, escape, lighting: world });
controls.bindTouch(view.find('.touch-pad'), view.find('.touch-pad i'), view.root.querySelectorAll('[data-action]'));

function playable() {
  return scene && !graphicsLost;
}

function command(name) {
  audio.unlock();
  audio.play('menu');
  if (!playable() && ['solo', 'online', 'practice'].includes(name)) return;
  if (name.startsWith('level-')) {
    settings.difficulty = name.slice(6);
    saveSettings(settings);
    startLocal('solo');
    return;
  }
  switch (name) {
    case 'solo': screen = name; view.solo(settings); break;
    case 'online': screen = name; view.online(settings); break;
    case 'how': screen = name; view.how(); break;
    case 'settings': screen = name; view.settings(settings); break;
    case 'practice': startLocal('practice'); break;
    case 'pause': pause(); break;
    case 'resume': resume(); break;
    case 'restart': startLocal(mode); break;
    case 'pause-settings': screen = name; view.settings(settings, true); break;
    case 'rematch':
      if (mode === 'online') {
        if (rematchRequested) return;
        rematchRequested = true;
        network?.send({ type: 'rematch' });
        view.result(state, local, mode, true);
      } else startLocal(mode);
      break;
    case 'leave': home(); break;
    case 'back':
      if (screen === 'pause-settings') pause();
      else if (screen === 'waiting') { closeNetwork(); screen = 'online'; view.online(settings); }
      else home();
      break;
    case 'create':
    case 'join': connect(name); break;
    case 'copy': copyCode(); break;
  }
}

function setting(key, value) {
  if (key === 'volume') {
    settings.volume = Number(value);
    view.updateVolume(settings.volume);
  } else settings[key] = value;
  saveSettings(settings);
  audio.configure(settings);
  if (key === 'motion') view.root.dataset.motion = value;
  if (key === 'quality') scene?.setQuality?.(value);
}

function closeNetwork() {
  network?.close();
  network = null;
  code = '';
}

function home() {
  controls.clear();
  closeNetwork();
  mode = null;
  local = 0;
  paused = false;
  resultScreen = false;
  game = new Game(feedback);
  state = game.snapshot();
  view.end();
  screen = 'home';
  view.home();
}

function activate(next, nextState) {
  controls.clear();
  state = nextState;
  mode = next;
  paused = false;
  resultScreen = false;
  rematchRequested = false;
  screen = 'fight';
  noticeTimer = 0;
  scene?.resetCamera?.();
  view.begin(mode, local);
  pingMs = null;
  lastPing = 0;
  view.hud(state, local, 0, settings.motion === 'reduced');
  if (mode === 'practice') {
    const { title, text, count } = game.prompt;
    view.practicePrompt(title, text, count);
  }
}

function startLocal(next) {
  if (!playable()) return;
  local = 0;
  game = next === 'practice' ? new Practice(feedback) : new Game(feedback);
  if (next === 'solo') game.resetMatch(settings.difficulty);
  activate(next, game.snapshot());
}

function pause() {
  if (!mode || resultScreen) return;
  controls.clear();
  if (mode === 'online') {
    network?.send({ type: 'input', input: { x: 0, z: 0 } });
    network?.send({ type: 'action', action: 'release' });
  }
  paused = true;
  screen = 'pause';
  view.pause(mode, graphicsLost);
}

function resume() {
  if (graphicsLost) return;
  paused = false;
  screen = 'fight';
  view.resume();
  world.focus({ preventScroll: true });
}

function escape() {
  if (screen === 'pause-settings') pause();
  else if (paused) resume();
  else if (mode && !resultScreen) pause();
  else if (screen !== 'home') home();
}

function connect(type) {
  if (screen !== 'online') return;
  const typed = view.find('#server-url').value.trim();
  let server = '';
  if (typed) {
    try { server = parseServerUrl(typed); }
    catch (error) { view.status(error.message || 'Enter a valid room server address.'); return; }
  }
  const entered = roomCode(view.find('#room-code').value);
  if (type === 'join' && !validRoom(entered)) {
    view.status('Enter the five characters shown in your rival’s room.');
    return;
  }
  closeNetwork();
  settings.server = server;
  saveSettings(settings);
  const onStatus = status => {
    if (status === 'connecting') view.status(server ? 'Connecting to the room server…' : 'Opening the room…', true);
    if (status === 'connected') view.status(server ? 'Connected. Waiting for room confirmation…' : 'Connected. Waiting for your rival…', true);
    if (status === 'missing') networkLost('missing');
    if (status === 'timeout' || status === 'closed' || status === 'error') networkLost(status);
  };
  const connection = server ? new Network(receive, onStatus) : new RelayNetwork(receive, onStatus, { kind: relayKind });
  network = connection;
  relayRoom = !server;
  try { connection.connect(server, type, entered); }
  catch { networkLost('error'); }
}

function networkLost(status) {
  if (status === 'missing') disconnected('No open room has that code. Check the code and ask your rival to keep the room open.');
  else if (status === 'timeout') disconnected('The room server took too long to respond.');
  else if (screen === 'online') disconnected(relayRoom ? 'Could not reach the online relay. Check your connection and try again.' : 'Could not connect. Check the room server address and WebSocket setup.');
  else disconnected('Connection to the room server was lost.');
}

function disconnected(message) {
  controls.clear();
  closeNetwork();
  mode = null;
  paused = false;
  resultScreen = false;
  view.end();
  screen = 'online';
  view.online(settings, message);
}

function receive(message) {
  if (!message || typeof message.type !== 'string') return;
  switch (message.type) {
    case 'created':
      if (!validRoom(message.code)) return disconnected('The server returned an invalid room code.');
      code = message.code;
      local = 0;
      screen = 'waiting';
      view.waiting(code, relayRoom);
      break;
    case 'joined':
      if (!validRoom(message.code)) return disconnected('The server returned an invalid room code.');
      local = 1;
      code = message.code;
      break;
    case 'start':
      if (!validSnapshot(message.state)) return disconnected('The room server and browser must use compatible versions.');
      activate('online', message.state);
      break;
    case 'state':
      if (mode === 'online' && validSnapshot(message.state)) state = message.state;
      break;
    case 'event':
      if (mode === 'online' && typeof message.event === 'string' && [0, 1, undefined].includes(message.player)) {
        feedback(message.event, message.player, message.detail || {});
      }
      break;
    case 'peer-left':
      disconnected(message.message || 'Your rival left the room.');
      break;
    case 'error':
      closeNetwork();
      view.status(message.message);
      break;
    case 'pong':
      if (mode === 'online' && message.id === lastPing) {
        const sample = performance.now() - lastPing;
        pingMs = pingMs === null ? sample : (pingMs * 0.65 + sample * 0.35);
        view.latency(Math.round(pingMs));
      }
      break;
    case 'rematch':
      if (message.player !== local && resultScreen && !rematchRequested) view.notify('Rival ready', 'Choose Rematch to play again');
      break;
  }
}

async function copyCode() {
  try {
    await navigator.clipboard.writeText(code);
    view.status('Room code copied.');
  } catch {
    const selection = getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(view.find('#room-token'));
      selection.removeAllRanges();
      selection.addRange(range);
    }
    view.status('Select and copy the room code above.');
  }
}

function relativeDirection() {
  const input = controls.direction;
  const me = state.players[local], rival = state.players[1 - local];
  const dx = rival.x - me.x, dz = rival.z - me.z;
  const distance = Math.hypot(dx, dz) || 1;
  return { x: (dx * input.z - dz * input.x) / distance, z: (dz * input.z + dx * input.x) / distance };
}

function action(command) {
  if (!mode || (command !== 'release' && (paused || resultScreen || graphicsLost))) return;
  audio.unlock();
  const direction = command === 'dodge' ? relativeDirection() : undefined;
  const p = state.players[local];
  const minimum = command === 'dodge' ? 23 : command === 'heavy' ? 30 : command === 'light' ? (p.riposte > 0 ? 12 : 17) : 0;
  const available = p.stamina;
  if (mode === 'online') network?.send({ type: 'action', action: command, direction });
  else game.input(local, command, direction);
  if (state.phase === 'fight' && minimum && available < minimum && noticeTimer <= 0) {
    view.notify('Low stamina', 'Back away to recover', 'danger');
    noticeTimer = 1.1;
  }
}

function feedback(event, index, detail = {}) {
  const own = index === local;
  if (event === 'fight' && mode !== 'online' && !paused && controls.guard.size) game.input(local, 'block');
  audio.play(event, detail, event === 'parry' || event === 'evade' ? !own : own);
  scene?.impact?.(event, index, settings.motion === 'reduced');
  if (event === 'parry') view.notify(own ? 'Parried' : 'Parry', own ? 'Your rival can riposte' : 'Light attack to riposte', own ? 'danger' : 'gold');
  if (event === 'riposte') view.notify('Riposte', '', own ? 'gold' : 'danger');
  if (event === 'break') view.notify('Guard broken', own ? 'Attack while they are open' : 'Give yourself room to recover', own ? 'gold' : 'danger');
  if (event === 'feint' && own) view.notify('Feint');
  if (event === 'clash') view.notify('Clash');
  if (event === 'evade' && !own) view.notify('Dodged');
  if (event === 'overtime') view.notify('Overtime', 'Next damage wins the round');
  if (event === 'lesson') view.notify('Drill complete', detail.title);
  if ((event === 'hit' || event === 'riposte' || event === 'break') && !own) view.pulse();
}

world.tabIndex = -1;
scene?.canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  graphicsLost = true;
  if (mode) pause();
});
scene?.canvas.addEventListener('webglcontextrestored', () => {
  graphicsLost = false;
  scene?.resetCamera?.();
  if (paused && screen === 'pause') view.pause(mode, graphicsLost);
});

let latest = performance.now();
let lastPaint = 0;
document.addEventListener('visibilitychange', () => {
  latest = performance.now();
  if (document.hidden && mode && mode !== 'online' && !paused && !resultScreen) pause();
});
function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = (now - latest) / 1000;
  const dt = Math.min(0.08, elapsed);
  latest = now;
  if (document.hidden) return;
  noticeTimer -= dt;
  if (mode) {
    const direction = paused ? { x: 0, z: 0 } : relativeDirection();
    if (mode === 'online') {
      if (now - lastInput >= 45) {
        lastInput = now;
        network?.send({ type: 'input', input: direction, guard: !paused && controls.guard.size > 0 });
      }
      if (now - lastPing >= 2300 || lastPing === 0) {
        lastPing = Math.round(now);
        network?.send({ type: 'ping', id: lastPing });
      }
    } else if (!paused) {
      game.update(elapsed, [direction]);
      state = game.snapshot();
    }
    if (state.phase === 'finished' && !resultScreen) {
      resultScreen = true;
      paused = false;
      controls.clear();
      screen = 'result';
      view.result(state, local, mode);
    }
    view.hud(state, local, dt, settings.motion === 'reduced');
    if (mode === 'practice') {
      const { title, text, count } = game.prompt;
      view.practicePrompt(title, text, count);
    }
  }
  if (scene && !graphicsLost && (mode || now - lastPaint >= 30)) {
    const renderDt = lastPaint ? Math.min(0.08, (now - lastPaint) / 1000) : dt;
    lastPaint = now;
    const footsteps = scene.render(state, renderDt, local, { menu: !mode, online: mode === 'online', reduced: settings.motion === 'reduced', paused });
    for (let i = 0; i < footsteps.length; i++) if (footsteps[i]) audio.play('step', {}, i === local);
    if (mode) view.lock(scene.targetPoint?.(1 - local), state.players[1 - local], !paused && state.phase === 'fight', mode === 'practice');
  }
}
home();
window.__waldoBoot?.done?.();
requestAnimationFrame(frame);

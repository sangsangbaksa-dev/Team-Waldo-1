import { attacks, PARRY_WINDOW } from '../domain/combat.js';

const icons = {
  swords: '<path d="m3 3 5 1 10 10-4 4L4 8zm18 0-5 1-4 4m8 0-4 4M2 22l5-5m-5 0 5 5m10-5 5 5m-5 0 5-5M5 15l4 4m6-4 4 4"/>',
  link: '<path d="M10 13a4 4 0 0 0 6 .4l4-4a4 4 0 1 0-5.7-5.7L12 6m2 5a4 4 0 0 0-6-.4l-4 4a4 4 0 1 0 5.7 5.7L12 18"/>',
  book: '<path d="M12 5c-3.5-2.6-7.5-2.5-10-1v15c2.5-1.5 6.5-1.6 10 1 3.5-2.6 7.5-2.5 10-1V4c-2.5-1.5-6.5-1.6-10 1zm0 0v15"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="m9 3-.5 2.8-2 .9-2.6-1L2 9l2 1.9v2.2L2 15l1.9 3.3 2.6-1 2 .9L9 21h4l.5-2.8 2-.9 2.6 1L20 15l-2-1.9v-2.2L20 9l-1.9-3.3-2.6 1-2-.9L13 3z"/>',
  shield: '<path d="m12 2 8 3v6c0 5-3 8-8 11-5-3-8-6-8-11V5zm0 5v10m-4-6h8"/>',
  pause: '<path d="M8 4v16m8-16v16"/>',
  crest: '<path d="M6 4h12v9l-6 7-6-7zm6-1v14m-3-8h6M2 7l2 7 5 6m13-13-2 7-5 6"/>',
  move: '<path d="M12 3v18M3 12h18m-12-6 3-3 3 3m-6 12 3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const btn = (label, command, { glyph, primary = false, meta = '', disabled = false } = {}) =>
  `<button type="button" class="button ${primary ? 'primary' : ''}" data-command="${command}" ${disabled ? 'disabled' : ''}>${glyph ? icon(glyph) : ''}<span>${label}</span>${meta ? `<small>${meta}</small>` : ''}</button>`;
const pip = '<i></i><i></i>';
const fighter = (side, label, role) => `<section class="fighter ${side}" aria-label="${role}">
  <div class="fighter-id"><span class="fighter-icon">${icon('crest')}</span><div><span class="fighter-role">${role}</span><strong data-name>${label}</strong></div></div>
  <div class="meter hp" role="meter" aria-label="${role} health" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><i class="lag"></i><i class="value"></i></div>
  <div class="fighter-bottom"><div class="meter stamina" role="meter" aria-label="${role} stamina" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><i class="value"></i></div><div class="pips" aria-label="Round wins">${pip}</div></div>
</section>`;
const keyboard = (key, label) => `<span><kbd>${key}</kbd>${label}</span>`;
const hubReturn = /\/parry-gladiator\/(?:index\.html)?$/.test(window.location.pathname)
  ? '<a class="button hub-return" href="../">Return to WALDO hub</a>' : '';

export class View {
  constructor(root, handlers) {
    this.root = root;
    this.handlers = handlers;
    root.innerHTML = `
      <div id="world"></div>
      <div class="screen-film" aria-hidden="true"></div>
      <section id="game-ui" hidden>
        <header class="hud">
          ${fighter('player', 'WARDEN', 'YOU')}
          <div class="clock"><span id="hud-round">ROUND 1</span><strong id="hud-time">1:05</strong><small id="hud-ping" hidden></small></div>
          ${fighter('enemy', 'CHALLENGER', 'RIVAL')}
        </header>
        <div id="target" class="target" hidden><span></span></div>
        <div id="announcer" class="announcer" role="status" aria-live="polite" aria-atomic="true" hidden><span></span><strong></strong></div>
        <div id="reaction" class="reaction" aria-hidden="true" hidden><strong></strong><span></span></div>
        <div id="combat-announcement" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>
        <div id="practice-help" class="practice-help" hidden><strong></strong><p></p><div></div></div>
        <div class="hud-bottom"><div class="hints">${keyboard('W A S D','Move')}${keyboard('J','Light')}${keyboard('K','Heavy')}${keyboard('F','Feint')}${keyboard('Q','Guard / Parry')}${keyboard('Space','Dodge')}</div>
          <button type="button" class="icon-button pause-button" data-command="pause" aria-label="Pause or open match menu">${icon('pause')}</button>
        </div>
        <div id="touch-controls">
          <div class="touch-pad" aria-label="Movement pad"><i></i></div>
          <div class="touch-actions">
            <button type="button" data-action="block" aria-label="Guard or parry">${icon('shield')}<span>Guard</span></button>
            <button type="button" data-action="heavy" aria-label="Heavy attack">${icon('swords')}<span>Heavy</span></button>
            <button type="button" data-action="dodge" aria-label="Dodge">${icon('move')}<span>Dodge</span></button>
            <button type="button" data-action="light" aria-label="Light attack">${icon('swords')}<span>Light</span></button>
          </div>
        </div>
      </section>
      <div id="damage" aria-hidden="true"></div>
      <section id="overlay" class="overlay">
        <div class="brand"><i>${icon('crest')}</i><span>PARRY<br>GLADIATOR</span></div>
        <div id="panel" class="panel"></div>
        <div class="arena-label"><span>ARENA</span><strong>THE CINDER RING</strong></div>
      </section>`;
    this.find = selector => root.querySelector(selector);
    this.overlay = this.find('#overlay');
    this.panel = this.find('#panel');
    this.gameUI = this.find('#game-ui');
    this.announce = this.find('#announcer');
    this.reaction = this.find('#reaction');
    this.combatAnnouncement = this.find('#combat-announcement');
    this.target = this.find('#target');
    this.damage = this.find('#damage');
    this.practice = this.find('#practice-help');
    this.round = this.find('#hud-round');
    this.time = this.find('#hud-time');
    this.ping = this.find('#hud-ping');
    this.heavyTouch = this.find('[data-action=heavy]');
    this.fighters = ['.player', '.enemy'].map(side => {
      const base = this.find(side);
      return {
        name: base.querySelector('[data-name]'), hp: base.querySelector('.hp'),
        stamina: base.querySelector('.stamina'), pips: base.querySelector('.pips'),
        memo: {},
      };
    });
    this.bannerKey = '';
    this.reactionLeft = 0;
    this.damageLeft = 0;
    root.addEventListener('click', event => {
      const clicked = event.target.closest('[data-command]');
      if (clicked) handlers.command(clicked.dataset.command);
    });
    this.panel.addEventListener('submit', event => {
      event.preventDefault();
      handlers.command('join');
    });
    this.panel.addEventListener('input', event => {
      const target = event.target;
      if (target.dataset.setting) handlers.setting(target.dataset.setting, target.type === 'checkbox' ? target.checked : target.value);
    });
  }

  screen(name, title, content, { kicker = '', back = false, compact = false } = {}) {
    this.overlay.hidden = false;
    this.overlay.classList.toggle('compact', compact);
    this.overlay.dataset.screen = name;
    this.panel.innerHTML = `${back ? '<button type="button" class="back" data-command="back">Back</button>' : ''}
      ${kicker ? `<p class="kicker">${kicker}</p>` : ''}<h1 id="screen-title" tabindex="-1">${title}</h1>${content}`;
    this.overlay.setAttribute('aria-labelledby', 'screen-title');
    this.find('#screen-title').focus({ preventScroll: true });
  }

  home() {
    this.screen('home', 'Parry <em>Gladiator</em>', `
      <p class="lede">Read the blade. Break their guard. Win two rounds.</p>
      <div class="menu-actions">
      ${btn('Solo duel', 'solo', { glyph: 'swords', primary: true, meta: 'VS AI' })}
      ${btn('Combat practice', 'practice', { glyph: 'shield' })}
      <div class="menu-secondary">${btn('Controls', 'how', { glyph: 'book' })}${btn('Settings', 'settings', { glyph: 'cog' })}</div></div>${hubReturn}`);
  }

  solo(settings) {
    this.screen('solo', 'Solo duel', `<p class="lede">Choose a rival for a best-of-three duel.</p><div class="menu-actions">
      ${['squire', 'gladiator', 'champion'].map((name, i) => btn(name[0].toUpperCase() + name.slice(1), 'level-' + name, {
        glyph: 'swords', primary: settings.difficulty === name, meta: ['Learning', 'Standard', 'Expert'][i],
      })).join('')}</div>`, { back: true });
  }

  online(settings, notice = '') {
    this.screen('online', 'Online duel', `<p class="lede">Host a private room or enter a friend’s five-character code.</p>
      <form class="online-form" autocomplete="off">
        <label for="server-url">Room server (optional)</label>
        <input id="server-url" type="url" placeholder="Leave empty to play online with no server" spellcheck="false">
        <label for="room-code">Room code</label>
        <input id="room-code" maxlength="5" placeholder="5 characters" autocapitalize="characters" spellcheck="false">
        <div class="menu-secondary">${btn('Create room', 'create', { primary: true })}<button type="submit" class="button">Join room</button></div>
      </form><p id="connection-status" class="connection-status" role="status"></p>`, { back: true });
    this.find('#server-url').value = settings.server;
    this.status(notice);
  }

  status(text, busy = false) {
    const status = this.find('#connection-status');
    if (status) status.textContent = text;
    const form = this.find('.online-form');
    if (form) for (const button of form.querySelectorAll('button')) button.disabled = busy;
  }

  waiting(code, relay = false) {
    this.screen('waiting', 'Room open', `<p class="lede">${relay ? 'Share this code with your rival and keep this tab open.' : 'Share this code and the room server address with your rival.'}</p>
      <div class="room-token" id="room-token"></div><div class="menu-actions">${btn('Copy room code', 'copy', { primary: true })}</div>
      <p id="connection-status" class="connection-status" role="status">Waiting for your rival…</p>`, { back: true });
    this.find('#room-token').textContent = code;
  }

  how() {
    this.screen('how', 'Field manual', `<div class="manual">
      <p><strong>Read the windup.</strong> Light strikes are quick. Heavy strikes hit harder and drain more stamina from a shield.</p>
      <p><strong>Guard late.</strong> Raise guard shortly before impact to parry. Press Light while the rival is staggered to riposte.</p>
      <p><strong>Leave enough stamina.</strong> Attacking, dodging, and absorbing hits use it. An empty guard breaks. Back off to recover.</p>
      <p><strong>Make space.</strong> Dodge with a movement direction, or dodge backward when standing still. Press F during a heavy windup to feint.</p>
      </div><div class="manual-keys hints">${keyboard('W A S D / Arrows','Move')}${keyboard('J / Left click','Light')}${keyboard('K','Heavy')}${keyboard('Q / Right click','Guard')}${keyboard('Space','Dodge')}${keyboard('F','Heavy feint')}${keyboard('Esc','Menu')}</div>
      <div class="menu-actions">${btn('Practice the parry', 'practice', { glyph: 'shield', primary: true })}</div>`, { back: true });
  }

  settings(settings, paused = false) {
    this.screen('settings', 'Settings', `<div class="settings-list">
      <label for="volume">Effects volume <output id="volume-label"></output></label><input id="volume" data-setting="volume" type="range" min="0" max="1" step=".05">
      <label class="settings-row" for="muted">Mute audio <input id="muted" data-setting="muted" type="checkbox"></label>
      <label class="settings-row" for="motion">Camera and flash effects <select id="motion" data-setting="motion"><option value="full">Full</option><option value="reduced">Reduced</option></select></label>
      <label class="settings-row" for="quality">Graphics quality <select id="quality" data-setting="quality"><option value="auto">Auto</option><option value="high">High</option><option value="low">Low</option></select></label>
      </div>`, { back: true, compact: paused });
    for (const key of ['volume', 'motion', 'quality']) this.find('#' + key).value = settings[key];
    this.find('#muted').checked = settings.muted;
    this.updateVolume(settings.volume);
  }

  updateVolume(value) {
    const output = this.find('#volume-label');
    if (output) output.textContent = Math.round(value * 100) + '%';
  }

  pause(mode, graphicsLost) {
    this.screen('pause', mode === 'online' ? 'Match menu' : 'Paused', `
      ${graphicsLost ? '<p class="lede">Graphics were interrupted. Resume once rendering recovers, or return to the main menu.</p>' : mode === 'online' ? '<p class="lede">The online duel continues while this menu is open.</p>' : ''}
      <div class="menu-actions">
      ${btn('Resume match', 'resume', { primary: true, disabled: graphicsLost })}
      ${mode !== 'online' ? btn(mode === 'practice' ? 'Restart practice' : 'Restart match', 'restart') : ''}
      ${btn('Settings', 'pause-settings')}${btn(mode === 'online' ? 'Leave room' : 'Main menu', 'leave')}</div>`, { compact: true });
  }

  result(state, local, mode, waiting = false) {
    const ours = state.players[local].wins, theirs = state.players[1 - local].wins;
    const stats = state.stats?.[local];
    this.screen('result', ours > theirs ? 'Victory' : 'Defeat', `
      <p class="result-score" aria-label="${ours} to ${theirs}"><span>${ours}</span><i></i><span>${theirs}</span></p>
      ${stats ? `<dl class="result-stats"><div><dt>Parries</dt><dd>${stats.parries}</dd></div><div><dt>Ripostes</dt><dd>${stats.ripostes}</dd></div><div><dt>Damage</dt><dd>${stats.damage}</dd></div></dl>` : ''}
      <div class="menu-actions">${btn(waiting ? 'Waiting for your rival' : 'Rematch', 'rematch', { primary: true, glyph: 'swords', disabled: waiting })}${btn('Main menu', 'leave')}</div>`, { kicker: 'Final score', compact: true });
  }

  begin(mode, local) {
    this.gameUI.hidden = false;
    this.overlay.hidden = true;
    this.reactionLeft = this.damageLeft = 0;
    this.reaction.hidden = true;
    this.announce.hidden = true;
    this.damage.style.opacity = 0;
    this.bannerKey = '';
    this.previousPhase = null;
    this.fightBanner = 0;
    this.practice.hidden = mode !== 'practice';
    this.ping.hidden = true;
    this.practiceKey = '';
    const names = ['WARDEN', mode === 'practice' ? 'INSTRUCTOR' : 'CHALLENGER'];
    this.fighters[0].name.textContent = names[local];
    this.fighters[1].name.textContent = names[1 - local];
    this.fighters[0].hp.style.setProperty('--meter-color', local ? 'var(--rival)' : 'var(--warden)');
    this.fighters[1].hp.style.setProperty('--meter-color', local ? 'var(--warden)' : 'var(--rival)');
    for (const f of this.fighters) f.memo = {};
  }

  end() {
    this.gameUI.hidden = true;
    this.damage.style.opacity = 0;
    this.reactionLeft = this.damageLeft = 0;
  }

  resume() {
    this.overlay.hidden = true;
  }

  banner(title, subtitle) {
    const key = title + subtitle;
    if (key === this.bannerKey) return;
    this.bannerKey = key;
    this.announce.hidden = !title;
    if (title) {
      this.announce.querySelector('strong').textContent = title;
      this.announce.querySelector('span').textContent = subtitle;
      this.announce.classList.remove('arrive');
      requestAnimationFrame(() => this.announce.classList.add('arrive'));
    }
  }

  notify(title, hint = '', tone = 'gold') {
    this.reactionLeft = hint ? 1.18 : 0.85;
    this.combatAnnouncement.textContent = hint ? `${title}. ${hint}` : title;
    this.reaction.querySelector('strong').textContent = title;
    this.reaction.querySelector('span').textContent = hint;
    this.reaction.dataset.tone = tone;
    this.reaction.hidden = false;
  }

  pulse() {
    this.damageLeft = 0.29;
  }

  hud(state, local, dt, reduced) {
    const round = state.phase === 'fight' && state.reason === 'overtime' ? 'OVERTIME' : 'ROUND ' + state.round;
    if (this.round.textContent !== round) this.round.textContent = round;
    const time = Math.max(0, Math.ceil(state.time || 0));
    const timeLabel = state.time == null ? 'DRILL' : Math.floor(time / 60) + ':' + String(time % 60).padStart(2, '0');
    if (this.time.textContent !== timeLabel) {
      this.time.textContent = timeLabel;
      this.time.classList.toggle('urgent', state.time != null && time <= 10);
    }
    for (let i = 0; i < 2; i++) {
      const player = state.players[i ? 1 - local : local];
      const item = this.fighters[i];
      const hp = Math.ceil(player.hp), stamina = Math.floor(player.stamina);
      if (item.memo.hp !== hp) {
        item.memo.hp = hp;
        item.hp.style.setProperty('--fill', hp / 100);
        item.hp.setAttribute('aria-valuenow', hp);
      }
      if (item.memo.stamina !== stamina) {
        item.memo.stamina = stamina;
        item.stamina.style.setProperty('--fill', stamina / 100);
        item.stamina.classList.toggle('low', stamina < 23);
        item.stamina.setAttribute('aria-valuenow', stamina);
      }
      if (i === 0) {
        const canRiposte = player.riposte > 0 && state.phase === 'fight';
        if (item.memo.riposte !== canRiposte) {
          item.memo.riposte = canRiposte;
          this.gameUI.dataset.riposte = String(canRiposte);
          const light = this.find('[data-action=light]');
          light.setAttribute('aria-label', canRiposte ? 'Riposte' : 'Light attack');
          light.querySelector('span').textContent = canRiposte ? 'Riposte' : 'Light';
        }
        const feint = player.state === 'attack' && player.attack === 'heavy' && player.timer < attacks.heavy.windup - 0.035;
        if (item.memo.feint !== feint) {
          item.memo.feint = feint;
          this.heavyTouch.dataset.feint = String(feint);
          this.heavyTouch.setAttribute('aria-label', feint ? 'Feint' : 'Heavy attack');
          this.heavyTouch.querySelector('span').textContent = feint ? 'Feint' : 'Heavy';
        }
      }
      if (item.memo.wins !== player.wins) {
        item.memo.wins = player.wins;
        item.pips.setAttribute('aria-label', player.wins + ' round wins');
        [...item.pips.children].forEach((pip, index) => pip.classList.toggle('won', index < player.wins));
      }
    }
    if (state.phase === 'fight' && this.previousPhase === 'ready') this.fightBanner = 0.48;
    this.previousPhase = state.phase;
    this.fightBanner = Math.max(0, this.fightBanner - dt);
    if (state.phase === 'ready') this.banner(state.count > 0.85 ? 'Ready' : 'Set', 'ROUND ' + state.round);
    else if (state.phase === 'fight' && this.fightBanner > 0) this.banner('Fight', 'ROUND ' + state.round);
    else if (state.phase === 'over') this.banner(state.winner === local ? 'Round won' : 'Round lost', state.reason === 'time' ? 'TIME EXPIRED' : 'KNOCKOUT');
    else this.banner('', '');

    if (this.reactionLeft > 0) this.reactionLeft -= dt;
    if (this.damageLeft > 0) this.damageLeft -= dt;
    if (this.reactionLeft <= 0 && !this.reaction.hidden) this.reaction.hidden = true;
    this.damage.style.opacity = reduced ? 0 : Math.max(0, this.damageLeft * 2.5);
  }

  latency(ms) {
    this.ping.hidden = false;
    this.ping.textContent = ms + ' ms';
    this.ping.classList.toggle('slow', ms >= 140);
    this.ping.setAttribute('aria-label', 'Round-trip latency: ' + ms + ' milliseconds');
  }

  lock(point, enemy, enabled, practice) {
    this.target.hidden = !enabled || !point?.visible;
    if (this.target.hidden) return;
    this.target.style.transform = `translate3d(${Math.round(point.x)}px,${Math.round(point.y)}px,0)`;
    const windup = enemy.state === 'attack' && enemy.timer < attacks[enemy.attack]?.windup;
    this.target.classList.toggle('threat', windup);
    this.target.classList.toggle('timing', practice && windup && attacks[enemy.attack].windup - enemy.timer <= PARRY_WINDOW);
  }

  practicePrompt(title, text, count = '') {
    const key = title + count;
    if (this.practiceKey === key) return;
    this.practiceKey = key;
    this.practice.querySelector('strong').textContent = title;
    this.practice.querySelector('p').textContent = text;
    this.practice.querySelector('div').textContent = count;
  }
}

export function showGraphicsError(container) {
  const message = document.createElement('div');
  message.className = 'graphics-error';
  message.setAttribute('role', 'alert');
  message.textContent = 'The arena needs WebGL 2. Enable hardware acceleration or try another browser.';
  container.append(message);
}

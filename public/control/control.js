import { connect } from '/shared/ws-client.js';
import { SPORTS, getPeriod } from '/shared/sports.js';
import { valueAt, formatClock, parseClock } from '/shared/clock.js';
import { downAndDistance } from '/shared/view.js';

const $ = (sel, root = document) => root.querySelector(sel);
const TEAMS = ['home', 'away'];
// Shortcuts follow the screen: Q W E R is the left team, U I O P the right.
const KEYS = { left: ['Q', 'W', 'E', 'R'], right: ['U', 'I', 'O', 'P'] };
const sideOf = (team, sport) => ((team === 'home') === (sport.homeSide === 'left') ? 'left' : 'right');

let state = null;
let builtSport = null;

const conn = connect(
  (next) => {
    state = next;
    render();
  },
  (online) => $('#conn').classList.toggle('on', online),
);
const send = (cmd) => conn.send(cmd);

/** JSON for a data-cmd attribute. Only ever built from fixed values and numbers. */
const cmdAttr = (cmd) => JSON.stringify(cmd).replace(/&/g, '&amp;').replace(/'/g, '&#39;');
const btn = (label, cmd, cls = '') => `<button class="${cls}" data-cmd='${cmdAttr(cmd)}'>${label}</button>`;

// ---- static setup ------------------------------------------------------------

$('#sport').innerHTML = Object.values(SPORTS)
  .map((s) => `<option value="${s.id}">${s.name}</option>`)
  .join('');

function buildForSport(sport) {
  for (const team of TEAMS) {
    $(`.team[data-team="${team}"] .rows`).innerHTML = sport.scoreButtons
      .map(
        (b, i) => `<div class="row">
          <button class="plus" data-cmd='${cmdAttr({ type: 'score.add', team, delta: b.value })}'>
            <b>+${b.value}</b><small>${b.label}</small><kbd>${KEYS[sideOf(team, sport)][i]}</kbd>
          </button>
          ${btn(`−${b.value}`, { type: 'score.add', team, delta: -b.value }, 'minus')}
        </div>`,
      )
      .join('');
  }
  $('main').classList.toggle('home-right', sport.homeSide === 'right');
  $('#periods').innerHTML = sport.periods
    .map((p) => `<button data-period="${p.id}" title="${p.long}">${p.short}</button>`)
    .join('');
}

// ---- render ------------------------------------------------------------------

function stepper(label, value, cmd) {
  return `<div class="stepper"><span class="label">${label}</span>
    ${btn('−', { ...cmd, delta: -1 })}<span class="value">${value}</span>${btn('+', { ...cmd, delta: 1 })}</div>`;
}

function extrasHtml() {
  if (state.sport === 'football') {
    const f = state.football;
    const active = (on) => (on ? 'active' : '');
    return `<h3>Down &amp; distance</h3>
      <div class="big">${downAndDistance(f) || '—'}</div>
      <div class="seg">
        ${[1, 2, 3, 4].map((d) => btn(['1st', '2nd', '3rd', '4th'][d - 1], { type: 'football.set', down: d }, active(f.down === d))).join('')}
        ${btn('Hide', { type: 'football.set', down: 0 }, active(f.down === 0))}
      </div>
      <div class="seg">
        ${btn('−5', { type: 'football.set', goal: false, distance: f.distance - 5 })}
        ${btn('−1', { type: 'football.set', goal: false, distance: f.distance - 1 })}
        ${btn('+1', { type: 'football.set', goal: false, distance: f.distance + 1 })}
        ${btn('+5', { type: 'football.set', goal: false, distance: f.distance + 5 })}
        ${btn('Goal', { type: 'football.set', goal: !f.goal }, active(f.goal))}
      </div>
      <div class="seg">${btn('New 1st &amp; 10', { type: 'football.set', down: 1, distance: 10, goal: false })}</div>
      <h3>Possession</h3>
      <div class="seg">
        ${btn('◀ Away', { type: 'football.set', possession: 'away' }, active(f.possession === 'away'))}
        ${btn('None', { type: 'football.set', possession: '' }, active(!f.possession))}
        ${btn('Home ▶', { type: 'football.set', possession: 'home' }, active(f.possession === 'home'))}
      </div>`;
  }
  if (state.sport === 'basketball') {
    return `<h3>Shot clock</h3>
      <div id="shot" class="big"></div>
      <div class="seg">
        ${btn('Reset 24', { type: 'shot.set', seconds: 24 })}
        ${btn('Reset 14', { type: 'shot.set', seconds: 14 })}
        ${btn('Off', { type: 'shot.set', seconds: 0 })}
      </div>
      <div class="seg">${btn('Reset team fouls', { type: 'fouls.reset' })}</div>`;
  }
  if (state.sport === 'soccer') {
    const n = state.soccer.stoppage;
    return `<h3>Stoppage time</h3>
      <div class="big">${n ? `+${n}` : '—'}</div>
      <div class="seg">
        ${btn('−1', { type: 'soccer.set', stoppage: n - 1 })}
        ${btn('+1', { type: 'soccer.set', stoppage: n + 1 })}
        ${btn('Clear', { type: 'soccer.set', stoppage: 0 })}
      </div>`;
  }
  return '';
}

function render() {
  const sport = SPORTS[state.sport];
  if (builtSport !== state.sport) {
    buildForSport(sport);
    builtSport = state.sport;
  }
  $('#sport').value = state.sport;

  const vis = $('#visible');
  vis.textContent = state.visible ? 'On air — click to hide' : 'Hidden — click to show';
  vis.className = `toggle ${state.visible ? 'on' : 'off'}`;
  $('#undo').disabled = state.undo.length === 0;

  for (const team of TEAMS) {
    const t = state.teams[team];
    const root = $(`.team[data-team="${team}"]`);
    root.style.setProperty('--team', t.color);
    $('.name', root).textContent = t.name;
    $('.score', root).textContent = t.score;
    const logo = $('.logo', root);
    logo.hidden = !t.logo;
    if (t.logo && logo.getAttribute('src') !== t.logo) logo.src = t.logo;
    $('.stats', root).innerHTML =
      (sport.timeouts ? stepper('Timeouts left', t.timeouts, { type: 'team.stat', team, key: 'timeouts' }) : '') +
      (sport.fouls ? stepper('Team fouls', t.fouls, { type: 'team.stat', team, key: 'fouls' }) : '');
  }

  const period = getPeriod(state.sport, state.period);
  $('#period-label').textContent = period.long;
  for (const b of document.querySelectorAll('#periods button')) {
    b.classList.toggle('active', b.dataset.period === state.period);
  }
  const startstop = $('#startstop');
  startstop.textContent = state.clock.running ? 'Stop clock' : 'Start clock';
  startstop.classList.toggle('running', state.clock.running);
  $('#clock').classList.toggle('running', state.clock.running);

  $('#extras').innerHTML = extrasHtml();
  tick();
}

function tick() {
  if (!state) return;
  const now = Date.now() + conn.offset;
  const period = getPeriod(state.sport, state.period);
  $('#clock').textContent = period.noClock
    ? '—'
    : formatClock(valueAt(state.clock, now), state.clock.direction, state.sport === 'basketball');
  const shot = $('#shot');
  if (shot) {
    const ms = valueAt(state.shotClock, now);
    shot.textContent = ms < 5000 ? formatClock(ms, 'down', true) : String(Math.ceil(ms / 1000));
  }
}
(function loop() {
  tick();
  requestAnimationFrame(loop);
})();

// ---- events ------------------------------------------------------------------

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-cmd]');
  if (el) send(JSON.parse(el.dataset.cmd));
});

$('#sport').addEventListener('change', (e) => {
  const scored = state.teams.home.score || state.teams.away.score;
  if (scored && !confirm('Changing the sport starts a new match and clears the score. Continue?')) {
    e.target.value = state.sport;
    return;
  }
  send({ type: 'sport.set', sport: e.target.value });
});

$('#visible').addEventListener('click', () => send({ type: 'visible.set', visible: !state.visible }));
$('#undo').addEventListener('click', () => send({ type: 'undo' }));
$('#reset').addEventListener('click', () => {
  if (confirm('Start a new match? Scores, clock and period are reset. Teams are kept.')) send({ type: 'match.reset' });
});

$('#periods').addEventListener('click', (e) => {
  const period = e.target.closest('button')?.dataset.period;
  if (period) send({ type: 'period.set', period, resetClock: $('#reset-on-period').checked });
});

$('#set-clock').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#clock-input');
  const ms = parseClock(input.value);
  if (ms === null) return input.select();
  send({ type: 'clock.set', ms });
  input.value = '';
  input.blur();
});

for (const team of TEAMS) {
  $(`.team[data-team="${team}"] .score`).addEventListener('click', () => {
    const text = prompt(`Set ${state.teams[team].name} score`, state.teams[team].score);
    if (text === null) return;
    const value = Number(text);
    if (Number.isInteger(value) && value >= 0) send({ type: 'score.set', team, value });
  });
}

document.addEventListener('keydown', (e) => {
  if (!state || e.target.closest?.('input, select, textarea, dialog') || e.altKey || e.metaKey) return;
  const key = e.key.toUpperCase();
  if (e.ctrlKey) {
    if (key === 'Z') send({ type: 'undo' });
    return;
  }
  if (e.code === 'Space') {
    e.preventDefault(); // also keeps Space from re-clicking a focused button
    if (!e.repeat) send({ type: 'clock.toggle' });
    return;
  }
  if (e.repeat) return;
  for (const team of TEAMS) {
    const sport = SPORTS[state.sport];
    const button = sport.scoreButtons[KEYS[sideOf(team, sport)].indexOf(key)];
    if (button) send({ type: 'score.add', team, delta: e.shiftKey ? -button.value : button.value });
  }
});

// ---- teams & settings dialog ---------------------------------------------------

const dialog = $('#setup-dialog');

$('#setup').addEventListener('click', () => {
  for (const team of TEAMS) {
    const set = $(`fieldset[data-team="${team}"]`, dialog);
    const t = state.teams[team];
    set.elements.name.value = t.name;
    set.elements.short.value = t.short;
    set.elements.color.value = t.color;
    set.elements.logo.value = '';
  }
  $('#period-min').value = state.periodMin[state.sport];
  $('#period-style').value = state.periodStyle;
  dialog.showModal();
});

for (const team of TEAMS) {
  const set = $(`fieldset[data-team="${team}"]`, dialog);
  for (const key of ['name', 'short', 'color']) {
    set.elements[key].addEventListener('change', (e) => send({ type: 'team.update', team, [key]: e.target.value.trim() }));
  }
  set.elements.logo.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const res = await fetch(`/api/logo/${team}`, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    if (!res.ok) alert((await res.json().catch(() => ({}))).error ?? 'Logo upload failed.');
  });
  $('.clear-logo', set).addEventListener('click', () => {
    set.elements.logo.value = '';
    send({ type: 'team.update', team, logo: '' });
  });
}

$('#period-min').addEventListener('change', (e) => send({ type: 'settings.set', periodMin: Number(e.target.value) }));
$('#period-style').addEventListener('change', (e) => send({ type: 'settings.set', periodStyle: e.target.value }));

// ---- OBS output ----------------------------------------------------------------

async function initOutput() {
  const graphics = await (await fetch('/api/graphics')).json();
  const select = $('#graphic');
  for (const g of graphics) select.add(new Option(g.name, g.id));
  const fallback = state?.sport === 'soccer' ? 'soccer-scorebug' : 'scorebar';
  select.value = localStorage.getItem('graphic') ?? fallback;
  if (!select.value) select.value = fallback; // e.g. a saved id that no longer exists
  if (!select.value && graphics[0]) select.value = graphics[0].id;
  const position = $('#position');
  position.value = localStorage.getItem('position') ?? 'bottom';

  const update = () => {
    const hasPosition = graphics.find((g) => g.id === select.value)?.hasPosition;
    $('#position-field').hidden = !hasPosition;
    let url = `${location.origin}/render/?graphic=${encodeURIComponent(select.value)}`;
    if (hasPosition && position.value === 'top') url += '&position=top';
    localStorage.setItem('position', position.value);
    $('#url').value = url;
    $('#open').href = url;
    $('#preview').src = url;
    localStorage.setItem('graphic', select.value);
  };
  select.addEventListener('change', update);
  position.addEventListener('change', update);
  update();

  $('#copy').addEventListener('click', async () => {
    await navigator.clipboard.writeText($('#url').value);
    $('#copy').textContent = 'Copied';
    setTimeout(() => ($('#copy').textContent = 'Copy URL'), 1200);
  });
}
initOutput();

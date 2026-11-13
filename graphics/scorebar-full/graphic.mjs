// OGraf graphic: centred score bar in the American broadcast layout, wide
// enough for full team names (long names shrink to fit).
// Team logo and full name sit on the outer edges, the scores face the middle, and
// the centre block holds down & distance, period, clock and shot clock.
// Sits at the bottom of the frame, or the top with data.position = "top".
// Self-contained: no imports, so the package is portable.
// Size and position are the CSS custom properties at the top of the style.

const css = `
:host {
  --width: 1600px;
  --height: 104px;
  --edge: 44px;          /* distance from the bottom (or top) of the frame */
  --center: 300px;       /* width of the middle block */
  --name-size: 32px;
  --score-size: 68px;
  --panel: #0e1116;
  --panel-2: #1c222c;
  --panel-text: #f4f5f7;
  --accent: #facc15;
  position: absolute; inset: 0; display: block;
  font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
}
.bar {
  position: absolute; left: 50%; bottom: var(--edge); width: var(--width); height: var(--height);
  transform: translateX(-50%);
  display: grid; grid-template-columns: minmax(0, 1fr) var(--center) minmax(0, 1fr);
  border-radius: 10px; overflow: hidden; box-shadow: 0 10px 32px rgba(0,0,0,.5);
  color: var(--panel-text); background: var(--panel);
  font-variant-numeric: tabular-nums; white-space: nowrap;
  opacity: 0;
}
.bar.top { bottom: auto; top: var(--edge); }

.team {
  position: relative; display: flex; align-items: center; gap: 14px; min-width: 0; padding: 0 18px;
  color: var(--team-text);
  background: linear-gradient(180deg, rgba(255,255,255,.14), rgba(0,0,0,.18)), var(--team);
}
.team.right { flex-direction: row-reverse; }
.logo { flex: none; height: calc(var(--height) - 24px); width: calc(var(--height) - 24px); object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,.4)); }
.logo[hidden] { display: none; }
.name {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  font-size: var(--name-size); font-weight: 700; letter-spacing: .02em; text-transform: uppercase;
}
.team.right .name { text-align: right; }
.poss { flex: none; width: 14px; height: 14px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 2px rgba(0,0,0,.35); visibility: hidden; }
.poss.on { visibility: visible; }
.score {
  flex: none; min-width: 1.5em; text-align: center; padding-bottom: 12px;
  font-size: var(--score-size); font-weight: 800; line-height: 1;
  text-shadow: 0 2px 6px rgba(0,0,0,.35);
}
.meta { position: absolute; bottom: 9px; display: flex; align-items: center; gap: 12px; }
.team.left .meta { right: 26px; flex-direction: row-reverse; }
.team.right .meta { left: 26px; }
.pips { display: flex; gap: 6px; }
.pip { width: 24px; height: 5px; border-radius: 2px; background: currentColor; opacity: .28; }
.pip.on { opacity: 1; }
.fouls { font-size: 13px; font-weight: 700; letter-spacing: .04em; }

.center { display: flex; flex-direction: column; }
.info {
  padding: 5px 8px; text-align: center; font-size: 26px; font-weight: 800; letter-spacing: .02em; text-transform: uppercase;
  background: var(--panel-2);
}
.row { flex: 1; display: flex; align-items: center; justify-content: center; gap: 14px; font-size: 28px; font-weight: 700; }
.period { text-transform: uppercase; }
.clock { font-size: 36px; font-weight: 800; padding-left: 14px; border-left: 2px solid rgba(255,255,255,.3); }
.shot { min-width: 1.7em; padding: 2px 6px; text-align: center; font-size: 24px; border: 2px solid var(--accent); border-radius: 5px; color: var(--accent); }
.shot.low { border-color: #f87171; color: #f87171; }
.stoppage { padding: 2px 8px; border-radius: 5px; font-size: 24px; background: var(--accent); color: #14171c; }
[hidden] { display: none !important; }
`;

const team = (side) => `
  <div class="team ${side}">
    <img class="logo" alt=""><span class="name"></span><span class="poss"></span><span class="score"></span>
    <span class="meta"><span class="pips"></span><span class="fouls"></span></span>
  </div>`;

const html = `
<div class="bar">
  ${team('left')}
  <div class="center">
    <div class="info"></div>
    <div class="row"><span class="period"></span><span class="clock"></span><span class="shot"></span><span class="stoppage"></span></div>
  </div>
  ${team('right')}
</div>`;

const ok = (extra) => ({ statusCode: 200, ...extra });

function clockMs(c, now) {
  if (!c) return 0;
  if (!c.running) return Math.max(0, c.baseMs ?? 0);
  const elapsed = now - c.startedAt;
  return Math.max(0, c.direction === 'down' ? c.baseMs - elapsed : c.baseMs + elapsed);
}

function formatClock(ms, direction, tenths) {
  if (direction === 'down') {
    if (tenths && ms < 60000) {
      const t = Math.floor(ms / 100);
      return `${Math.floor(t / 10)}.${t % 10}`;
    }
    const total = Math.ceil(ms / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Black or white, whichever reads better on the given hex colour. */
function textOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 160 ? '#111' : '#fff';
}

function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

export default class ScoreBarFull extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._data = {};
    this._raf = 0;
    this._scores = {};
  }

  async load({ data } = {}) {
    const root = this.shadowRoot;
    root.innerHTML = `<style>${css}</style>${html}`;
    const q = (sel) => root.querySelector(sel);
    this._el = {
      bar: q('.bar'),
      info: q('.info'),
      period: q('.period'),
      clock: q('.clock'),
      shot: q('.shot'),
      stoppage: q('.stoppage'),
    };
    for (const side of ['left', 'right']) {
      const t = q(`.team.${side}`);
      this._el[side] = {
        root: t,
        logo: t.querySelector('.logo'),
        name: t.querySelector('.name'),
        poss: t.querySelector('.poss'),
        score: t.querySelector('.score'),
        pips: t.querySelector('.pips'),
        fouls: t.querySelector('.fouls'),
      };
    }
    this._apply(data, true);
    const tick = () => {
      this._tick();
      this._raf = requestAnimationFrame(tick);
    };
    tick();
    return ok();
  }

  async dispose() {
    cancelAnimationFrame(this._raf);
    this.shadowRoot.innerHTML = '';
    return ok();
  }

  async playAction({ skipAnimation } = {}) {
    await this._slide(true, skipAnimation);
    return ok({ currentStep: 0 });
  }

  async stopAction({ skipAnimation } = {}) {
    await this._slide(false, skipAnimation);
    return ok();
  }

  async updateAction({ data, skipAnimation } = {}) {
    this._apply(data, skipAnimation);
    return ok();
  }

  async customAction() {
    return { statusCode: 404, statusMessage: 'This graphic has no custom actions' };
  }

  _apply(data = {}, skipAnimation) {
    const d = (this._data = { ...this._data, ...data });
    this._el.bar.classList.toggle('top', d.position === 'top');

    // Away at Home: with homeSide "right" the visitor takes the left edge.
    const sides = d.homeSide === 'left' ? { left: 'home', right: 'away' } : { left: 'away', right: 'home' };
    for (const side of ['left', 'right']) {
      const key = sides[side];
      const team = d[key] ?? {};
      const el = this._el[side];
      el.root.style.setProperty('--team', team.color || '#333');
      el.root.style.setProperty('--team-text', textOn(team.color));
      if (el.name.textContent !== (team.name ?? '') || el.logo.hidden !== !team.logo) el.name.dataset.fit = '';
      setText(el.name, team.name ?? '');
      el.logo.hidden = !team.logo;
      if (team.logo && el.logo.getAttribute('src') !== team.logo) el.logo.src = team.logo;
      el.poss.classList.toggle('on', d.possession === key);

      const score = team.score ?? 0;
      setText(el.score, String(score));
      // Flash only when this team's own score changes, not when sides swap.
      if (!skipAnimation && this._scores[key] !== undefined && this._scores[key] !== score) {
        el.score.animate(
          [{ color: 'var(--accent)', transform: 'scale(1.25)' }, { color: 'inherit', transform: 'scale(1)' }],
          { duration: 800, easing: 'ease-out' },
        );
      }
      this._scores[key] = score;

      const max = d.maxTimeouts ?? 0;
      const pipKey = `${max}:${team.timeouts}`;
      if (el.pips.dataset.key !== pipKey) {
        el.pips.dataset.key = pipKey;
        el.pips.innerHTML = Array.from(
          { length: max },
          (_, i) => `<span class="pip${i < (team.timeouts ?? 0) ? ' on' : ''}"></span>`,
        ).join('');
      }
      setText(el.fouls, d.showFouls ? `FOULS ${team.fouls ?? 0}` : '');
    }

    for (const side of ['left', 'right']) this._fitName(this._el[side].name);

    this._el.info.hidden = !d.info;
    setText(this._el.info, d.info ?? '');
    setText(this._el.period, d.period ?? '');
    this._el.clock.hidden = !d.clock?.visible;
    this._el.shot.hidden = !d.shotClock?.visible;
    this._el.stoppage.hidden = !d.stoppage;
    setText(this._el.stoppage, d.stoppage ? `+${d.stoppage}` : '');
    this._tick();
  }

  /** Shrinks a long team name (down to 60%) so it fits instead of being cut off. */
  _fitName(el) {
    if (el.dataset.fit === 'done') return;
    el.style.fontSize = '';
    const base = parseFloat(getComputedStyle(el).fontSize);
    let size = base;
    while (el.scrollWidth > el.clientWidth && size > base * 0.6) {
      size -= 1;
      el.style.fontSize = `${size}px`;
    }
    if (el.clientWidth > 0) el.dataset.fit = 'done';
  }

  _tick() {
    const d = this._data;
    const now = Date.now();
    if (d.clock?.visible) {
      setText(this._el.clock, formatClock(clockMs(d.clock, now), d.clock.direction, d.clock.tenths));
    }
    if (d.shotClock?.visible) {
      const ms = clockMs(d.shotClock, now);
      setText(this._el.shot, ms < 5000 ? formatClock(ms, 'down', true) : String(Math.ceil(ms / 1000)));
      this._el.shot.classList.toggle('low', ms < 5000);
    }
  }

  _slide(show, skipAnimation) {
    const away = this._data.position === 'top' ? -50 : 50;
    const hidden = { opacity: 0, transform: `translateX(-50%) translateY(${away}px)` };
    const visible = { opacity: 1, transform: 'translateX(-50%) translateY(0)' };
    const anim = this._el.bar.animate(show ? [hidden, visible] : [visible, hidden], {
      duration: skipAnimation ? 0 : 450,
      easing: 'cubic-bezier(.2,.8,.2,1)',
      fill: 'forwards',
    });
    return anim.finished;
  }
}

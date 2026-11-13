// OGraf graphic: full score bar with logos, names, scores, period, clock and
// sport extras (timeouts, possession, down & distance, shot clock, fouls,
// stoppage time). Self-contained: no imports, so the package is portable.
// Size and position are the CSS custom properties at the top of the style.

const css = `
:host {
  --left: 60px;
  --top: 48px;
  --height: 72px;
  --name-size: 30px;
  --score-size: 46px;
  --panel: #14171c;
  --panel-text: #f4f5f7;
  --accent: #facc15;
  position: absolute; inset: 0; display: block;
  font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
}
.bug {
  position: absolute; left: var(--left); top: var(--top); height: var(--height);
  display: flex; align-items: stretch;
  border-radius: 8px; overflow: hidden;
  box-shadow: 0 8px 28px rgba(0,0,0,.45);
  color: var(--panel-text); background: var(--panel);
  font-variant-numeric: tabular-nums; white-space: nowrap;
  opacity: 0;
}
.team {
  position: relative; display: flex; align-items: center; gap: 12px;
  padding: 0 0 0 16px; background: var(--team); color: var(--team-text);
}
.logo { height: calc(var(--height) - 20px); width: calc(var(--height) - 20px); object-fit: contain; }
.logo[hidden] { display: none; }
.name {
  font-size: var(--name-size); font-weight: 700; letter-spacing: .02em; text-transform: uppercase;
  max-width: 300px; overflow: hidden; text-overflow: ellipsis; padding-bottom: 6px;
}
.poss { width: 12px; height: 12px; border-radius: 50%; background: var(--accent); margin-bottom: 6px; visibility: hidden; }
.poss.on { visibility: visible; }
.score {
  align-self: stretch; display: grid; place-items: center; min-width: 1.9em; margin-left: 4px; padding: 0 10px;
  font-size: var(--score-size); font-weight: 800; background: rgba(0,0,0,.28);
}
.meta { position: absolute; left: 16px; bottom: 7px; display: flex; align-items: center; gap: 10px; font-size: 12px; font-weight: 700; }
.pips { display: flex; gap: 4px; }
.pip { width: 16px; height: 4px; border-radius: 2px; background: currentColor; opacity: .3; }
.pip.on { opacity: 1; }
.cell { display: grid; place-items: center; padding: 0 18px; font-size: 28px; font-weight: 700; }
.cell[hidden] { display: none; }
.period { background: #232831; }
.clock { min-width: 3.4em; font-size: 34px; }
.shot { background: #232831; color: var(--accent); min-width: 1.6em; }
.shot.low { color: #f87171; }
.stoppage { background: var(--accent); color: #14171c; padding: 0 12px; }
.info { background: var(--accent); color: #14171c; font-size: 24px; }
`;

const html = `
<div class="bug">
  <div class="team home"><img class="logo" alt=""><span class="name"></span><span class="poss"></span><span class="score"></span><div class="meta"><span class="pips"></span><span class="fouls"></span></div></div>
  <div class="team away"><img class="logo" alt=""><span class="name"></span><span class="poss"></span><span class="score"></span><div class="meta"><span class="pips"></span><span class="fouls"></span></div></div>
  <div class="cell period"></div>
  <div class="cell clock"></div>
  <div class="cell shot"></div>
  <div class="cell stoppage"></div>
  <div class="cell info"></div>
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

export default class ScoreBug extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._data = {};
    this._raf = 0;
  }

  async load({ data } = {}) {
    const root = this.shadowRoot;
    root.innerHTML = `<style>${css}</style>${html}`;
    const q = (sel) => root.querySelector(sel);
    this._el = {
      bug: q('.bug'),
      period: q('.period'),
      clock: q('.clock'),
      shot: q('.shot'),
      stoppage: q('.stoppage'),
      info: q('.info'),
    };
    for (const side of ['home', 'away']) {
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
    for (const side of ['home', 'away']) {
      const team = d[side] ?? {};
      const el = this._el[side];
      el.root.style.setProperty('--team', team.color || '#333');
      el.root.style.setProperty('--team-text', textOn(team.color));
      setText(el.name, team.name ?? '');
      el.logo.hidden = !team.logo;
      if (team.logo && el.logo.getAttribute('src') !== team.logo) el.logo.src = team.logo;
      el.poss.classList.toggle('on', d.possession === side);

      const score = String(team.score ?? 0);
      if (el.score.textContent !== score) {
        el.score.textContent = score;
        if (!skipAnimation) {
          el.score.animate(
            [{ background: 'var(--accent)', color: '#111' }, { background: 'rgba(0,0,0,.28)', color: 'inherit' }],
            { duration: 900, easing: 'ease-out' },
          );
        }
      }

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

    setText(this._el.period, d.period ?? '');
    this._el.period.hidden = !d.period;
    this._el.clock.hidden = !d.clock?.visible;
    this._el.shot.hidden = !d.shotClock?.visible;
    this._el.stoppage.hidden = !d.stoppage;
    setText(this._el.stoppage, d.stoppage ? `+${d.stoppage}` : '');
    this._el.info.hidden = !d.info;
    setText(this._el.info, d.info ?? '');
    this._tick();
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
    const bug = this._el.bug;
    const hidden = { opacity: 0, transform: 'translateY(-40px)' };
    const visible = { opacity: 1, transform: 'translateY(0)' };
    const anim = bug.animate(show ? [hidden, visible] : [visible, hidden], {
      duration: skipAnimation ? 0 : 450,
      easing: 'cubic-bezier(.2,.8,.2,1)',
      fill: 'forwards',
    });
    return anim.finished;
  }
}

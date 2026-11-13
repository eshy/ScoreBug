// OGraf graphic: compact two-row bug (short names, scores, clock, period).
// Self-contained: no imports, so the package is portable.
// Size and position are the CSS custom properties at the top of the style.

const css = `
:host {
  --left: 48px;
  --top: 40px;
  --row: 44px;
  --font: 26px;
  --panel: #14171c;
  --panel-text: #f4f5f7;
  --accent: #facc15;
  position: absolute; inset: 0; display: block;
  font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
}
.bug {
  position: absolute; left: var(--left); top: var(--top);
  display: grid; grid-template-columns: auto auto; grid-template-rows: var(--row) var(--row) auto;
  border-radius: 6px; overflow: hidden; box-shadow: 0 6px 22px rgba(0,0,0,.45);
  background: var(--panel); color: var(--panel-text);
  font-size: var(--font); font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap;
  opacity: 0;
}
.team { display: flex; align-items: center; }
.team .short {
  width: 3.4em; padding: 0 12px; align-self: stretch; display: flex; align-items: center;
  background: var(--team); color: var(--team-text); letter-spacing: .04em; text-transform: uppercase;
  overflow: hidden;
}
.team .score { min-width: 1.8em; text-align: center; font-weight: 800; padding: 0 6px; }
.side { display: grid; place-items: center; padding: 0 16px; background: #232831; min-width: 3.2em; }
.clock { font-size: 1.1em; }
.period { font-size: .8em; color: #b8bec9; }
.period .stoppage { color: var(--accent); margin-left: .4em; }
.info { grid-column: 1 / -1; padding: 5px 12px; background: var(--accent); color: #14171c; font-size: .75em; text-align: center; }
[hidden] { display: none !important; }
`;

const html = `
<div class="bug">
  <div class="team home"><span class="short"></span><span class="score"></span></div>
  <div class="side clock"></div>
  <div class="team away"><span class="short"></span><span class="score"></span></div>
  <div class="side period"><span><span class="label"></span><span class="stoppage"></span></span></div>
  <div class="info"></div>
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

export default class ScoreBugCompact extends HTMLElement {
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
      clock: q('.clock'),
      label: q('.label'),
      stoppage: q('.stoppage'),
      info: q('.info'),
      home: { short: q('.home .short'), score: q('.home .score') },
      away: { short: q('.away .short'), score: q('.away .score') },
    };
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
      el.short.style.setProperty('--team', team.color || '#333');
      el.short.style.setProperty('--team-text', textOn(team.color));
      setText(el.short, team.short ?? '');
      const score = String(team.score ?? 0);
      if (el.score.textContent !== score) {
        el.score.textContent = score;
        if (!skipAnimation) {
          el.score.animate([{ color: 'var(--accent)', transform: 'scale(1.3)' }, { color: 'inherit', transform: 'scale(1)' }], {
            duration: 700,
            easing: 'ease-out',
          });
        }
      }
    }
    setText(this._el.label, d.period ?? '');
    setText(this._el.stoppage, d.stoppage ? `+${d.stoppage}` : '');
    this._el.info.hidden = !d.info;
    setText(this._el.info, d.info ?? '');
    this._tick();
  }

  _tick() {
    const c = this._data.clock;
    setText(this._el.clock, c?.visible ? formatClock(clockMs(c, Date.now()), c.direction, c.tenths) : '–');
  }

  _slide(show, skipAnimation) {
    const hidden = { opacity: 0, transform: 'translateX(-40px)' };
    const visible = { opacity: 1, transform: 'translateX(0)' };
    const anim = this._el.bug.animate(show ? [hidden, visible] : [visible, hidden], {
      duration: skipAnimation ? 0 : 400,
      easing: 'cubic-bezier(.2,.8,.2,1)',
      fill: 'forwards',
    });
    return anim.finished;
  }
}

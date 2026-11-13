// OGraf graphic: the two scores with a dash.
// Size and position are the CSS custom properties at the top of the style.

const css = `
:host {
  --top: 40px;
  --size: 96px;
  --color: #fff;
  position: absolute; inset: 0; display: block;
  font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
}
.score {
  position: absolute; top: var(--top); left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 0.3em;
  font-size: var(--size); font-weight: 800; line-height: 1; color: var(--color);
  font-variant-numeric: tabular-nums;
  text-shadow: 0 4px 18px rgba(0,0,0,.65), 0 0 2px rgba(0,0,0,.9);
  opacity: 0;
}
.num { display: inline-block; min-width: 0.7em; text-align: center; }
.home { text-align: right; }
.away { text-align: left; }
`;

const ok = (extra) => ({ statusCode: 200, ...extra });

export default class ScoreOnly extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._data = {};
  }

  async load({ data } = {}) {
    this.shadowRoot.innerHTML = `<style>${css}</style>
      <div class="score"><span class="num home">0</span><span>-</span><span class="num away">0</span></div>`;
    this._root = this.shadowRoot.querySelector('.score');
    this._home = this.shadowRoot.querySelector('.home');
    this._away = this.shadowRoot.querySelector('.away');
    this._apply(data, true);
    return ok();
  }

  async dispose() {
    this.shadowRoot.innerHTML = '';
    return ok();
  }

  async playAction({ skipAnimation } = {}) {
    await this._fade(1, skipAnimation);
    return ok({ currentStep: 0 });
  }

  async stopAction({ skipAnimation } = {}) {
    await this._fade(0, skipAnimation);
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
    this._data = { ...this._data, ...data };
    this._set(this._home, this._data.home?.score ?? 0, skipAnimation);
    this._set(this._away, this._data.away?.score ?? 0, skipAnimation);
  }

  _set(el, value, skipAnimation) {
    const text = String(value);
    if (el.textContent === text) return;
    el.textContent = text;
    if (!skipAnimation) {
      el.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 400, easing: 'ease-out' });
    }
  }

  _fade(to, skipAnimation) {
    const from = getComputedStyle(this._root).opacity;
    const anim = this._root.animate(
      [
        { opacity: from, transform: `translateX(-50%) translateY(${to ? -20 : 0}px)` },
        { opacity: to, transform: `translateX(-50%) translateY(${to ? 0 : -20}px)` },
      ],
      { duration: skipAnimation ? 0 : 350, easing: 'ease-out', fill: 'forwards' },
    );
    return anim.finished;
  }
}

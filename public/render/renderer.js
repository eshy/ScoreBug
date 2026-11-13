// Minimal OGraf renderer for OBS: loads one graphic package (?graphic=<id>),
// then feeds it the live match state through load() / updateAction() and
// shows or hides it with playAction() / stopAction().

import { connect } from '/shared/ws-client.js';
import { toGraphicData } from '/shared/view.js';

const stage = document.getElementById('stage');
const params = new URLSearchParams(location.search);
const id = params.get('graphic') || 'scorebar';
const position = params.get('position') === 'top' ? 'top' : 'bottom';

function fail(message) {
  const box = document.createElement('div');
  box.id = 'error';
  box.textContent = message;
  document.body.append(box);
}

async function main() {
  const graphics = await (await fetch('/api/graphics')).json();
  const graphic = graphics.find((g) => g.id === id);
  if (!graphic) {
    return fail(`Unknown graphic "${id}". Available: ${graphics.map((g) => g.id).join(', ')}`);
  }

  const module = await import(graphic.mainUrl);
  const tag = `ograf-${id.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  if (!customElements.get(tag)) customElements.define(tag, module.default);
  const el = document.createElement(tag);
  stage.append(el);

  let loaded = false;
  let shown = false;
  let queue = Promise.resolve();

  async function apply(state, offset) {
    const data = { ...toGraphicData(state, offset, location.origin), position };
    if (!loaded) {
      await el.load({
        data,
        renderType: 'realtime',
        renderCharacteristics: { resolution: { width: innerWidth, height: innerHeight }, frameRate: 60 },
      });
      loaded = true;
    } else {
      await el.updateAction({ data });
    }
    if (state.visible && !shown) {
      shown = true;
      await el.playAction({ delta: 1 });
    } else if (!state.visible && shown) {
      shown = false;
      await el.stopAction({});
    }
  }

  // Calls into the graphic are serialised so load() always finishes first.
  connect((state, offset) => {
    queue = queue.then(() => apply(state, offset)).catch((err) => console.error(err));
  });
}

main().catch((err) => fail(err.message));

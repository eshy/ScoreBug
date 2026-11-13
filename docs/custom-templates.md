# Custom templates

A template is an [OGraf](https://ograf.ebu.io/) graphic: a folder in `graphics/` with a manifest and one JavaScript file. There is no build step and nothing to register. Until there is a designer, this is how you add a new look or size.

## The quick way: copy and restyle

1. Copy the folder closest to what you want, for example `graphics/scorebar` to `graphics/my-bar`.
2. Rename the manifest to match the folder: `my-bar.ograf.json`. The name must end in `.ograf.json`.
3. In the manifest, change `id` (must be unique, no `/`) and `name` (shown in the control panel).
4. Open `graphic.mjs` and edit the CSS custom properties at the top of the style block.
5. Reload the control panel. The template is in the **Graphic** list, and its OBS URL is `http://localhost:4747/render/?graphic=my-bar`.

Open that URL in a browser tab while you work; reload it to see each change. The page is transparent, so set a background in the browser's dev tools if white text is hard to see.

The server does not need a restart for template changes.

### What the variables control

| Template | Variables |
|---|---|
| `scorebar`, `scorebar-full` | `--width`, `--height`, `--edge` (gap to the bottom or top of the frame), `--center` (width of the middle block), `--name-size`, `--score-size`, `--panel`, `--panel-2`, `--panel-text`, `--accent` |
| `soccer-scorebug` | `--left`, `--top`, `--height`, `--name-size`, `--score-size`, `--panel`, `--panel-text`, `--accent` |
| `soccer-scorebug-compact` | `--left`, `--top`, `--row` (row height), `--font`, `--panel`, `--panel-text`, `--accent` |
| `score-only` | `--top`, `--size`, `--color` |

Team colours are not variables: they come from the control panel's team setup.

Everything below the variables is ordinary CSS and HTML inside a shadow root, so you can go further than the variables: reorder elements, change fonts, add a background image.

## Folder layout

```
graphics/my-bar/
  my-bar.ograf.json    manifest
  graphic.mjs          the graphic (a web component)
  ...                  any images or fonts it uses
```

To use a file from the folder, build its URL from the module's own location so it works wherever the package is served from:

```js
const background = new URL('./background.png', import.meta.url).href;
```

Fonts installed on the PC running OBS work by name. To ship a font with the template, put the file in the folder and load it with an `@font-face` rule using a URL built the same way.

## The manifest

```json
{
  "$schema": "https://ograf.ebu.io/v1/specification/json-schemas/graphics/schema.json",
  "id": "my-bar",
  "version": "0.1.0",
  "name": "My bar",
  "description": "One line about what it shows.",
  "main": "graphic.mjs",
  "supportsRealTime": true,
  "supportsNonRealTime": false,
  "stepCount": 1,
  "schema": { "type": "object", "properties": { } }
}
```

`schema` is a JSON Schema describing the data the template uses. List only the fields you read. One property has an effect in ScoreBug: if `schema.properties.position` exists, the control panel shows the **Position** (Bottom / Top) selector for the template.

## The graphic

`graphic.mjs` must default-export a class that extends `HTMLElement`. ScoreBug's renderer calls these methods:

| Method | When | What to do |
|---|---|---|
| `load({ data })` | Once, when the page opens | Build the DOM, apply `data`, stay invisible |
| `playAction({ skipAnimation })` | The operator clicks **show** | Animate in |
| `stopAction({ skipAnimation })` | The operator clicks **hide** | Animate out |
| `updateAction({ data, skipAnimation })` | Every change to the match | Apply the new `data` |
| `dispose()` | The graphic is removed | Stop timers, clear the DOM |
| `customAction()` | Not used by ScoreBug | Return a 404 status |

Each returns a promise. Resolve `playAction` and `stopAction` when the animation has finished. Return `{ statusCode: 200 }` (and `currentStep: 0` from `playAction`).

A minimal graphic:

```js
export default class MyBar extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  async load({ data }) {
    this.shadowRoot.innerHTML = `
      <style>
        :host { position: absolute; inset: 0; display: block; font: 700 48px "Segoe UI", sans-serif; color: #fff; }
        .box { position: absolute; left: 60px; top: 48px; padding: 8px 20px; background: #14171c; opacity: 0; }
      </style>
      <div class="box"></div>`;
    this._box = this.shadowRoot.querySelector('.box');
    this._apply(data);
    return { statusCode: 200 };
  }

  async updateAction({ data }) {
    this._apply(data);
    return { statusCode: 200 };
  }

  async playAction() {
    await this._box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'forwards' }).finished;
    return { statusCode: 200, currentStep: 0 };
  }

  async stopAction() {
    await this._box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).finished;
    return { statusCode: 200 };
  }

  async dispose() {
    this.shadowRoot.innerHTML = '';
    return { statusCode: 200 };
  }

  async customAction() {
    return { statusCode: 404 };
  }

  _apply(data) {
    // Use textContent for anything typed by the operator, such as team names.
    this._box.textContent = `${data.away.short} ${data.away.score} - ${data.home.score} ${data.home.short}`;
  }
}
```

The frame is 1920 × 1080 with a transparent background. Position things in pixels against that size.

## The data

`load()` and `updateAction()` both receive the complete data object every time, so a template never has to remember earlier values.

| Field | Type | Meaning |
|---|---|---|
| `sport` | string | `football`, `soccer` or `basketball` |
| `homeSide` | `left` \| `right` | Side the home team belongs on. `right` for American Football and Basketball (visitor on the left), `left` for Soccer |
| `position` | `bottom` \| `top` | From `&position=top` in the OBS URL. Ignore it if your template has a fixed place |
| `home`, `away` | object | The two teams, see below |
| `period` | string | Ready-made label: `Q1`, `1st Quarter`, `2H`, `Extra Time`, ... |
| `clock` | object | The game clock, see below |
| `shotClock` | object | Same shape as `clock`. `visible` is false outside basketball or when the operator unticks Show |
| `info` | string | Football down & distance, such as `3rd & 10`. Empty when hidden or not football |
| `possession` | `home` \| `away` \| `""` | Football possession |
| `possessionIcon` | string | Image URL to show for possession instead of the template's own marker. Empty means use your own marker |
| `stoppage` | number | Soccer added minutes. `0` means none |
| `maxTimeouts` | number | Timeouts per team for the sport. `0` means the sport has none |
| `showFouls` | boolean | True for basketball |

Each team:

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Full name |
| `short` | string | Short name, up to 5 characters |
| `color` | string | Hex colour, such as `#1d4ed8` |
| `logo` | string | Image URL, or empty when the team has no logo |
| `score` | number | |
| `timeouts` | number | Timeouts left |
| `fouls` | number | Team fouls |

### The clock

The clock is not sent every second. The template gets a description and runs it itself, which keeps it smooth and exact:

| Field | Meaning |
|---|---|
| `visible` | False when the period has no clock (soccer penalties) |
| `running` | Whether it is counting |
| `baseMs` | The value in milliseconds when stopped, or at `startedAt` when running |
| `startedAt` | When it started, on the same scale as `Date.now()` in the page |
| `direction` | `down` for football and basketball, `up` for soccer |
| `tenths` | True when tenths should show under one minute (basketball) |

```js
function clockMs(c, now = Date.now()) {
  if (!c.running) return c.baseMs;
  const elapsed = now - c.startedAt;
  return Math.max(0, c.direction === 'down' ? c.baseMs - elapsed : c.baseMs + elapsed);
}
```

Call it from a `requestAnimationFrame` loop and write the text only when it changes. The existing templates have a `formatClock` function you can copy.

## Good habits

- Start hidden (`opacity: 0`) and show only in `playAction`. The operator may open the page while the scoreboard is hidden.
- Honour `homeSide` unless the template is for one sport only.
- Hide what is empty: no logo, `info` empty, `stoppage` 0, `shotClock.visible` false, `maxTimeouts` 0.
- Set operator text with `textContent`, never by building HTML from it.
- Keep the template self-contained: no imports from outside its folder. Then the same folder also loads in other OGraf renderers.
- Honour `skipAnimation`: when true, jump straight to the end state.

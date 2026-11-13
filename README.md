# ScoreBug

A scoreboard for live streams: an [OGraf](https://ograf.ebu.io/) graphic rendered in an OBS Browser source, driven from a control panel web page with modes for American Football, Soccer and Basketball.

## Run

```bash
npm install
```

```bash
npm start
```

- Control panel: <http://localhost:4747/control/>
- OBS source: `http://localhost:4747/render/?graphic=scorebar`

`npm run lan` also accepts connections from other devices on your network, so a tablet can run the control panel at `http://<this-pc-ip>:4747/control/`. Anyone on that network can then change the score.

Set the `PORT` environment variable to use another port.

## Add it to OBS

1. Sources → **+** → **Browser**.
2. URL: copy it from the bottom of the control panel (pick the graphic first).
3. Width 1920, Height 1080. Leave the custom CSS as is (transparent background).

Each Browser source shows one graphic. Add several sources to use more than one at once.

| Graphic id | What it shows |
|---|---|
| `scorebar` | American style: centred bar at the bottom (add `&position=top` for the top), logo and name on the edges, scores towards the middle, down & distance, period, clock, shot clock, timeouts, possession, fouls |
| `soccer-scorebug` | Soccer style: top-left bar with logos, names, scores, period, clock and stoppage time |
| `soccer-scorebug-compact` | Soccer style: small top-left two-row bug with short names, scores, clock, period |
| `score-only` | `21 - 14` |

## Control panel

- **+N** adds points, the smaller **−N** beside it corrects a mistake. Click the big score to type a value. **Undo score** steps back through score changes.
- Clock: Start/Stop, nudges, type a time (`12:30`, `12` = minutes, `:30` = seconds), Reset to the start of the period.
- Football and Basketball count down; Soccer counts up from the period start (0:00, 45:00, 90:00) and keeps running into stoppage time.
- American Football and Basketball show the visitor on the left and the home team on the right (Away at Home); Soccer shows the home team on the left. The control panel columns follow the same order.
- **On air / Hidden** animates the graphic in and out.
- **Teams & settings**: names, short names, colours, logos, period length, short or long period labels.
- Keys: `Space` start/stop · `Q W E R` left team's score rows · `U I O P` right team's score rows · `Shift` for minus · `Ctrl+Z` undo.

The match state is saved in `data/state.json` and survives a restart. A running clock keeps real time while the server is down.

## How it works

```
Control panel ──WebSocket──┐
                            ├── server (owns the match state)
OBS Browser source ─WebSocket┘
```

- `server/state.js` — the match state and a pure reducer for the control-panel commands.
- `shared/sports.js` — the sport definitions (score buttons, periods, clock direction). Add a sport here.
- `shared/view.js` — turns state into the `data` object the graphics receive.
- `public/render/` — a minimal OGraf renderer: imports the graphic's module, calls `load()`, then `updateAction()` on each change and `playAction()` / `stopAction()` for show and hide.
- `graphics/<name>/` — OGraf packages: a `*.ograf.json` manifest and a web component. They have no imports, so they also load in other OGraf renderers.

The clock is never ticked over the network. The state holds `{ running, baseMs, startedAt, direction }` and each page computes the display itself, so it cannot drift or stutter.

## Add a graphic or a size

Copy a folder in `graphics/`, change `id` and `name` in the manifest, and edit the CSS custom properties at the top of the style in `graphic.mjs` (`--left`, `--top`, `--height`, font sizes, colours). It appears in the control panel's Graphic list on reload.

## Test

```bash
npm test
```

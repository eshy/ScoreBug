# ScoreBug

A scoreboard for live streams: an [OGraf](https://ograf.ebu.io/) graphic rendered in an OBS Browser source, driven from a control panel web page with modes for American Football, Soccer and Basketball.

## Download and run

No installation needed.

1. Download the zip for your computer from the [latest release](https://github.com/eshy/ScoreBug/releases/latest): Windows, macOS (Apple silicon) or Linux.
2. Unzip it anywhere, for example your Desktop.
3. Double-click **ScoreBug** (`ScoreBug.exe` on Windows). A console window opens and your browser shows the control panel.
4. Keep the console window open while you stream. Close it to stop ScoreBug.

The first time, your computer may warn that the app is from an unknown publisher, because the download is not code-signed:

- **Windows:** click **More info**, then **Run anyway**.
- **macOS:** right-click **ScoreBug**, choose **Open**, then **Open** again. If macOS still refuses, allow it under System Settings → Privacy & Security.

Your teams, logos and match state are saved in a `data` folder next to the app. To update, unzip the new version and copy your `data` folder (and any templates you added to `graphics`) across.

- Control panel: <http://localhost:4747/control/>
- OBS source: `http://localhost:4747/render/?graphic=scorebar`

To use the control panel from a tablet or another PC on your network, double-click **ScoreBug (network)** instead (`ScoreBug (network).bat` on Windows, `.command` on macOS, `ScoreBug-network.sh` on Linux). The console window shows the address to open on the other device. It is the same as starting ScoreBug with `--lan`. Anyone on that network can then change the score, so use it on a network you trust; your computer may ask to allow network access the first time.

## Run from source

For developers. Needs [Node.js](https://nodejs.org/) 20 or newer.

```bash
npm install
```

```bash
npm start
```

`npm run lan` is the same as `--lan` above. Set the `PORT` environment variable to use another port.

### Build a release

```bash
npm run build:release
```

This needs Node 25.5 or newer and builds `dist/ScoreBug-<version>-<os>-<arch>.zip` for the computer it runs on. Pushing a tag such as `v0.2.0` runs [.github/workflows/release.yml](.github/workflows/release.yml), which builds the Windows, macOS and Linux zips and attaches them to a GitHub Release. Set `version` in `package.json` first; the zip names use it.

## Add it to OBS

1. Sources → **+** → **Browser**.
2. URL: copy it from the bottom of the control panel (pick the graphic first).
3. Width 1920, Height 1080. Leave the custom CSS as is (transparent background).

Each Browser source shows one graphic. Add several sources to use more than one at once.

To keep the control panel inside OBS, add it as a dock: Docks → **Custom Browser Docks**, with the control panel URL.

| Graphic id | What it shows |
|---|---|
| `scorebar` | American style: centred bar at the bottom (add `&position=top` for the top), logo and name on the edges, scores towards the middle, down & distance, period, clock, shot clock, timeouts, possession, fouls |
| `scorebar-full` | The same bar, wider (1600px), with full team names beside the logos; long names shrink to fit |
| `soccer-scorebug` | Soccer style: top-left bar with logos, names, scores, period, clock and stoppage time |
| `soccer-scorebug-compact` | Soccer style: small top-left two-row bug with short names, scores, clock, period |
| `score-only` | `21 - 14` |

## Control panel

- **+N** adds points, the smaller **−N** beside it corrects a mistake. Click the big score to type a value. **Undo score** steps back through score changes.
- Clock: Start/Stop, nudges, type a time (`12:30`, `12` = minutes, `:30` = seconds), Reset to the start of the period.
- Football and Basketball count down; Soccer counts up from the period start (0:00, 45:00, 90:00) and keeps running into stoppage time.
- American Football and Basketball show the visitor on the left and the home team on the right (Away at Home); Soccer shows the home team on the left. The control panel columns follow the same order.
- Down & distance (football) and the shot clock (basketball) each have a **Show** checkbox. Untick it to take that detail off the graphic if you don't want to keep it updated.
- **On air / Hidden** animates the graphic in and out.
- **Teams & settings**: names, short names, colours, logos, period length, short or long period labels, and the possession indicator (a dot, a football, or your own image).
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

Copy a folder in `graphics/`, change `id` and `name` in the manifest, and edit the CSS custom properties at the top of the style in `graphic.mjs`. It appears in the control panel's Graphic list on reload.

The full guide, with the data fields every template receives, is in [docs/custom-templates.md](docs/custom-templates.md).

## Test

```bash
npm test
```

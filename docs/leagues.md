# Leagues and team logos

In **Teams & settings** you can choose a league and then pick the home and away team from a list. That fills in the team's name, short name, color and logo in one step. You can still edit any of them afterward, or choose "None" and type everything yourself.

A league is a folder in `leagues/`. Nothing needs registering and ScoreBug does not need a restart: the folders are read each time you open Teams & settings.

```
leagues/
  nfl/
    league.json      the teams: names, short names, colors
    logos/           one image per team, named after the team id
      sf.png
      was.svg
```

ScoreBug includes team lists and colors for the NFL, NBA and MLS. **It does not include any logos.** Team logos are trademarks of their owners, so add the ones you have the right to use.

## Add or replace logos

Put an image in the league's `logos/` folder, named after the team's `id` from `league.json`:

| Team | File |
|---|---|
| San Francisco 49ers (`"id": "sf"`) | `leagues/nfl/logos/sf.png` |
| Boston Celtics (`"id": "bos"`) | `leagues/nba/logos/bos.svg` |

- PNG, SVG, WebP and JPEG work. Upper or lower case file names both match.
- Transparent, roughly square images look best. 300 pixels or more on the long side is plenty.
- To replace a logo, replace the file. To remove one, delete the file.
- A team with no file simply has no logo; the templates then show its name instead.

After adding files, reopen Teams & settings and pick the team again so the scoreboard gets the new logo.

## Change colors or names

Edit `league.json` in a text editor. Each team is one line:

```json
{"id": "sf", "short": "SF", "city": "San Francisco", "name": "49ers", "color": "#AA0000"}
```

| Field | Meaning |
|---|---|
| `id` | Used for the logo file name. Must be unique in the league |
| `short` | Short name on the scoreboard, up to 5 characters |
| `city` | Optional. Shown in the picker only ("San Francisco 49ers") |
| `name` | The name shown on the scoreboard |
| `color` | Team color as a six-digit hex code |
| `logo` | Optional. A file name in `logos/` if you do not want to name the file after the id |

To show the full name on the scoreboard, put it all in `name` and leave `city` out.

The bundled colors are each team's main color as best known when this was written. Check them against your own references, and change any that read poorly on your stream.

## Add your own league

1. Copy a league folder, for example `leagues/nfl` to `leagues/my-league`.
2. Edit `league.json`:

```json
{
  "name": "Sunday League",
  "sport": "soccer",
  "teams": [
    {"id": "lions", "short": "LIO", "name": "Lakeside Lions", "color": "#1D4ED8"},
    {"id": "hawks", "short": "HAW", "name": "Harbor Hawks", "color": "#B91C1C"}
  ]
}
```

3. Put the logos in `logos/` (`lions.png`, `hawks.png`).

`name` is what the League list shows. `sport` is `football`, `basketball` or `soccer`.

To keep your own version of a bundled league, copy the folder under a new name and edit the copy. Then a ScoreBug update will not overwrite your changes. When you update ScoreBug, copy your league folders across along with your `data` folder.

If a league does not appear in the list, `league.json` probably has a typing mistake such as a missing comma. The ScoreBug console window names the folder it skipped and why.

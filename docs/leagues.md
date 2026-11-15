# Leagues and team logos

In **Teams & settings** you can choose a league and then pick the home and away team from a list. That fills in the team's name, short name, color and logo in one step. You can still edit any of them afterward, or choose "None" and type everything yourself.

A league is a folder in `leagues/`. Nothing needs registering and ScoreBug does not need a restart: the folders are read each time you open Teams & settings.

```
leagues/
  nfl/
    league.json      the teams: names, short names, colors
    logos/           one image per team
      sf.png
      Washington Commanders.svg
```

ScoreBug includes team lists and colors for the NFL, NBA and MLS. **It does not include any logos.** Team logos are trademarks of their owners, so add the ones you have the right to use.

## Add or replace logos

There are two ways. Both end with an image file in the league's `logos/` folder.

### From the control panel

1. Open Teams & settings and choose the league.
2. Pick the team in the Team list.
3. Under Logo, choose an image file.

The logo goes on the scoreboard and is saved in the league's folder as `<team id>.png` (or `.svg`, `.webp`, `.jpg`), so the team has it every time you pick it from now on. Choosing another file later replaces it.

With no league team picked, an uploaded logo is used for the current match only.

### By copying files

Put the images in the league's `logos/` folder. You do not have to rename them: ScoreBug works out which team each file is for from its name. All of these are matched to the San Francisco 49ers:

| File name | Matched by |
|---|---|
| `sf.png` | the team's `id` or short name |
| `49ers.svg` | the team name |
| `San Francisco 49ers.png` | city and name |
| `san-francisco-49ers-logo-2024.png` | the name inside a longer file name |
| `San Francisco.png` | the city, when only one team in the league has it |

Upper and lower case, spaces, dashes and underscores make no difference, and words such as "logo", "primary" and the league name are ignored.

When you choose the league in Teams & settings, a line under the League list tells you how it went, for example: "Logos: 30 of 32 found. No logo for: New York Jets, Los Angeles Rams. Not recognized: ny.png." Rename a file that was not recognized after its team and reopen Teams & settings.

- A file named after the team's `id` (`sf.png`) always wins over other names. That is the name the control panel saves under.
- A name that fits two teams equally, such as `New York.png` in the NFL, is not guessed; it is listed as not recognized.
- PNG, SVG, WebP and JPEG work. If a team has more than one file, SVG is preferred, then PNG.
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
| `id` | A short unique name for the team. A logo file with this name always matches |
| `short` | Short name on the scoreboard, up to 5 characters |
| `city` | Optional. Shown in the picker only ("San Francisco 49ers") |
| `name` | The name shown on the scoreboard |
| `color` | Team color as a six-digit hex code |
| `logo` | Optional. A file name in `logos/` to use for this team no matter what it is called |

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

3. Put the logos in `logos/` (`lions.png`, `Harbor Hawks.png`).

`name` is what the League list shows. `sport` is `football`, `basketball` or `soccer`.

To keep your own version of a bundled league, copy the folder under a new name and edit the copy. Then a ScoreBug update will not overwrite your changes. When you update ScoreBug, copy your league folders across along with your `data` folder.

If a league does not appear in the list, `league.json` probably has a typing mistake such as a missing comma. The ScoreBug console window names the folder it skipped and why.

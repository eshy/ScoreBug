// League packs: every folder in leagues/ with a league.json is a league whose
// teams can be picked in the control panel. Logos are image files in its
// logos/ folder. They do not need exact names: "sf.png", "49ers.svg" and
// "San Francisco 49ers logo.png" are all matched to the same team.

import fs from 'node:fs';
import path from 'node:path';

// Preferred first when a team has several candidate files.
const LOGO_EXTENSIONS = ['.svg', '.png', '.webp', '.jpg', '.jpeg'];
// Words that say nothing about which team a file is for.
const NOISE = /\b(logos?|primary|secondary|official|alternate|alt|team|icon|badge|crest|transparent|small|large|hd|final|copy|\d{4})\b/g;

/** "San Francisco 49ers" -> "sanfrancisco49ers" */
const squash = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // é -> e
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** File name without extension, noise words and the league's own name. */
function fileKey(file, leagueWords) {
  let base = path
    .basename(file, path.extname(file))
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(NOISE, ' ');
  for (const word of leagueWords) base = base.replace(new RegExp(`\\b${word}\\b`, 'g'), ' ');
  return squash(base);
}

/**
 * Decides which logo file belongs to which team.
 * @returns { byTeam: Map<teamId, file>, unmatched: [file] }
 */
export function matchLogos(teams, files, leagueWords = []) {
  const images = files.filter((f) => LOGO_EXTENSIONS.includes(path.extname(f).toLowerCase()));

  // Keys that identify a team outright, and longer names that may appear
  // inside a longer file name. A city only counts when one team has it.
  const cityCount = new Map();
  for (const t of teams) if (t.city) cityCount.set(squash(t.city), (cityCount.get(squash(t.city)) ?? 0) + 1);
  const keys = teams.map((t) => {
    const full = squash([t.city, t.name].filter(Boolean).join(' '));
    const exact = new Set([squash(t.short), squash(t.name), full].filter(Boolean));
    if (t.city && cityCount.get(squash(t.city)) === 1) exact.add(squash(t.city));
    const inside = [squash(t.name), full].filter((k) => k.length >= 4);
    return { id: t.id, idKey: squash(t.id), exact, inside };
  });

  // Score every file against every team: an exact key beats a name found
  // inside the file name, and a longer name beats a shorter one ("hornets"
  // over "nets" for charlotte-hornets.png).
  const candidates = [];
  for (const file of images) {
    const key = fileKey(file, leagueWords);
    if (!key) continue;
    let best = null;
    let tied = false;
    for (const team of keys) {
      let score = 0;
      // The id is what a logo uploaded from the control panel is saved as.
      if (team.idKey === key) score = 2000;
      else if (team.exact.has(key)) score = 1000 + key.length;
      else for (const name of team.inside) if (key.includes(name)) score = Math.max(score, name.length);
      if (!score) continue;
      if (!best || score > best.score) {
        best = { id: team.id, score };
        tied = false;
      } else if (score === best.score && team.id !== best.id) {
        tied = true;
      }
    }
    // A file that fits two teams equally well is left for the user to rename.
    if (best && !tied) candidates.push({ file, ...best, ext: LOGO_EXTENSIONS.indexOf(path.extname(file).toLowerCase()) });
  }

  // One file per team: the best match, then the preferred image format.
  candidates.sort((a, b) => b.score - a.score || a.ext - b.ext || a.file.localeCompare(b.file));
  const byTeam = new Map();
  for (const c of candidates) if (!byTeam.has(c.id)) byTeam.set(c.id, c.file);

  const used = new Set(byTeam.values());
  return { byTeam, unmatched: images.filter((f) => !used.has(f)).sort() };
}

/**
 * Saves an uploaded logo as logos/<team id>.<ext>, replacing an earlier upload.
 * @returns the logo URL, or null if the league or team does not exist
 */
export function saveTeamLogo(leaguesDir, leagueId, teamId, ext, data, urlBase = '/leagues') {
  const league = loadLeagues(leaguesDir, urlBase).find((l) => l.id === leagueId);
  const team = league?.teams.find((t) => t.id === teamId);
  const base = squash(teamId); // also keeps the file name safe
  if (!team || !base) return null;

  const logosDir = path.join(leaguesDir, leagueId, 'logos');
  fs.mkdirSync(logosDir, { recursive: true });
  for (const f of fs.readdirSync(logosDir)) {
    const e = path.extname(f).toLowerCase();
    if (LOGO_EXTENSIONS.includes(e) && squash(path.basename(f, path.extname(f))) === base) fs.rmSync(path.join(logosDir, f));
  }
  const name = `${base}.${ext}`;
  fs.writeFileSync(path.join(logosDir, name), data);
  return `${urlBase}/${encodeURIComponent(leagueId)}/logos/${name}`;
}

/**
 * @returns [{ id, name, sport, teams: [{ id, label, name, short, color, logo }],
 *             logos: { found, missing: [label], unmatched: [file] } }]
 */
export function loadLeagues(leaguesDir, urlBase = '/leagues') {
  const leagues = [];
  if (!fs.existsSync(leaguesDir)) return leagues;

  for (const dir of fs.readdirSync(leaguesDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const file = path.join(leaguesDir, dir.name, 'league.json');
    if (!fs.existsSync(file)) continue;
    try {
      const league = JSON.parse(fs.readFileSync(file, 'utf8'));
      const logosDir = path.join(leaguesDir, dir.name, 'logos');
      const logoFiles = fs.existsSync(logosDir) ? fs.readdirSync(logosDir) : [];
      const logoUrl = (name) => `${urlBase}/${encodeURIComponent(dir.name)}/logos/${encodeURIComponent(name)}`;

      const raw = (league.teams ?? []).map((t) => ({ ...t, id: String(t.id ?? t.short ?? t.name) }));
      const leagueWords = [dir.name, league.name].map(squash).filter(Boolean);
      // A team with an explicit "logo" keeps it and takes no part in matching.
      const explicit = new Set(raw.filter((t) => t.logo).map((t) => t.logo));
      const { byTeam, unmatched } = matchLogos(
        raw.filter((t) => !t.logo),
        logoFiles.filter((f) => !explicit.has(f)),
        leagueWords,
      );

      const teams = raw.map((t) => {
        const found = t.logo ?? byTeam.get(t.id);
        return {
          id: t.id,
          label: [t.city, t.name].filter(Boolean).join(' '),
          name: String(t.name ?? ''),
          short: String(t.short ?? t.id).toUpperCase(),
          color: /^#[0-9a-f]{6}$/i.test(t.color ?? '') ? t.color : '#333333',
          logo: found ? logoUrl(found) : '',
        };
      });
      teams.sort((a, b) => a.label.localeCompare(b.label));
      leagues.push({
        id: dir.name,
        name: league.name ?? dir.name,
        sport: league.sport ?? '',
        teams,
        logos: {
          found: teams.filter((t) => t.logo).length,
          missing: teams.filter((t) => !t.logo).map((t) => t.label),
          unmatched,
        },
      });
    } catch (err) {
      console.warn(`Skipping leagues/${dir.name}: ${err.message}`);
    }
  }
  return leagues.sort((a, b) => a.name.localeCompare(b.name));
}

// League packs: every folder in leagues/ with a league.json is a league whose
// teams can be picked in the control panel. Logos are files in its logos/
// folder named after the team id, so replacing a logo is replacing a file.

import fs from 'node:fs';
import path from 'node:path';

const LOGO_EXTENSIONS = ['.svg', '.png', '.webp', '.jpg', '.jpeg'];

/** @returns [{ id, name, sport, teams: [{ id, label, name, short, color, logo }] }] */
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

      const teams = (league.teams ?? []).map((t) => {
        const id = String(t.id ?? t.short ?? t.name);
        // An explicit "logo" wins; otherwise any image named after the team id.
        const found =
          t.logo ??
          logoFiles.find((f) => {
            const ext = path.extname(f).toLowerCase();
            return LOGO_EXTENSIONS.includes(ext) && path.basename(f, path.extname(f)).toLowerCase() === id.toLowerCase();
          });
        return {
          id,
          label: [t.city, t.name].filter(Boolean).join(' '),
          name: String(t.name ?? ''),
          short: String(t.short ?? id).toUpperCase(),
          color: /^#[0-9a-f]{6}$/i.test(t.color ?? '') ? t.color : '#333333',
          logo: found ? logoUrl(found) : '',
        };
      });
      teams.sort((a, b) => a.label.localeCompare(b.label));
      leagues.push({ id: dir.name, name: league.name ?? dir.name, sport: league.sport ?? '', teams });
    } catch (err) {
      console.warn(`Skipping leagues/${dir.name}: ${err.message}`);
    }
  }
  return leagues.sort((a, b) => a.name.localeCompare(b.name));
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, reduce, msUntilExpiry } from '../server/state.js';
import { valueAt, formatClock, parseClock } from '../shared/clock.js';
import { toGraphicData } from '../shared/view.js';
import { loadLeagues, matchLogos, saveTeamLogo } from '../server/leagues.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SPORTS } from '../shared/sports.js';
import { fileURLToPath } from 'node:url';

const run = (s, cmds, now = 0) => cmds.reduce((acc, c) => reduce(acc, c, c.at ?? now), s);

test('football scoring, minus correction and clamping at zero', () => {
  let s = run(defaultState(), [
    { type: 'score.add', team: 'home', delta: 6 },
    { type: 'score.add', team: 'home', delta: 1 },
    { type: 'score.add', team: 'away', delta: 3 },
    { type: 'score.add', team: 'home', delta: -1 },
  ]);
  assert.equal(s.teams.home.score, 6);
  assert.equal(s.teams.away.score, 3);
  s = reduce(s, { type: 'score.add', team: 'away', delta: -6 }, 0);
  assert.equal(s.teams.away.score, 0);
});

test('undo restores the previous scores', () => {
  let s = run(defaultState(), [
    { type: 'score.add', team: 'home', delta: 6 },
    { type: 'score.add', team: 'away', delta: 3 },
    { type: 'undo' },
  ]);
  assert.deepEqual([s.teams.home.score, s.teams.away.score], [6, 0]);
  s = run(s, [{ type: 'undo' }]);
  assert.deepEqual([s.teams.home.score, s.teams.away.score], [0, 0]);
  assert.equal(reduce(s, { type: 'undo' }, 0), s, 'nothing left to undo');
});

test('invalid commands leave the state untouched', () => {
  const s = defaultState();
  assert.equal(reduce(s, { type: 'nope' }, 0), s);
  assert.equal(reduce(s, { type: 'score.add', team: 'x', delta: 1 }, 0), s);
  assert.equal(reduce(s, { type: 'sport.set', sport: 'curling' }, 0), s);
});

test('countdown clock runs, stops, adjusts and expires at zero', () => {
  let s = defaultState();
  assert.equal(s.clock.baseMs, 15 * 60_000);
  s = reduce(s, { type: 'clock.start' }, 1000);
  assert.equal(valueAt(s.clock, 11_000), 15 * 60_000 - 10_000);
  assert.equal(msUntilExpiry(s, 11_000), 15 * 60_000 - 10_000);
  s = reduce(s, { type: 'clock.stop' }, 11_000);
  assert.equal(s.clock.running, false);
  assert.equal(valueAt(s.clock, 99_000), 15 * 60_000 - 10_000);
  s = reduce(s, { type: 'clock.set', ms: 5000 }, 0);
  s = reduce(s, { type: 'clock.start' }, 0);
  s = reduce(s, { type: 'clock.adjust', deltaMs: 1000 }, 2000);
  assert.equal(valueAt(s.clock, 2000), 4000);
  s = reduce(s, { type: 'tick' }, 6001);
  assert.equal(s.clock.running, false);
  assert.equal(s.clock.baseMs, 0);
  s = reduce(s, { type: 'clock.start' }, 7000);
  assert.equal(s.clock.running, false, 'a finished countdown does not restart');
});

test('soccer clock counts up from the period start and runs past the half', () => {
  let s = reduce(defaultState(), { type: 'sport.set', sport: 'soccer' }, 0);
  assert.equal(s.period, 'H1');
  assert.equal(s.clock.direction, 'up');
  s = reduce(s, { type: 'clock.start' }, 0);
  assert.equal(valueAt(s.clock, 47 * 60_000), 47 * 60_000);
  s = reduce(s, { type: 'period.set', period: 'H2', resetClock: true }, 50 * 60_000);
  assert.equal(s.clock.running, false);
  assert.equal(s.clock.baseMs, 45 * 60_000);
  s = reduce(s, { type: 'period.set', period: 'ET', resetClock: true }, 0);
  assert.equal(s.clock.baseMs, 90 * 60_000);
  s = reduce(s, { type: 'soccer.set', stoppage: 3 }, 0);
  const data = toGraphicData(s);
  assert.equal(data.stoppage, 3);
  assert.equal(data.period, 'ET');
  assert.equal(toGraphicData(reduce(s, { type: 'period.set', period: 'PEN' }, 0)).clock.visible, false);
});

test('basketball shot clock follows the game clock', () => {
  let s = reduce(defaultState(), { type: 'sport.set', sport: 'basketball' }, 0);
  assert.equal(s.clock.baseMs, 12 * 60_000);
  assert.equal(s.teams.home.timeouts, 5);
  s = reduce(s, { type: 'clock.start' }, 0);
  assert.equal(s.shotClock.running, true);
  assert.equal(valueAt(s.shotClock, 4000), 20_000);
  s = reduce(s, { type: 'shot.set', seconds: 14 }, 4000);
  assert.equal(valueAt(s.shotClock, 5000), 13_000);
  s = reduce(s, { type: 'tick' }, 19_000);
  assert.equal(s.shotClock.running, false);
  assert.equal(s.clock.running, true);
  s = reduce(s, { type: 'team.stat', team: 'home', key: 'fouls', delta: 1 }, 19_000);
  assert.equal(s.teams.home.fouls, 1);
  s = reduce(s, { type: 'team.stat', team: 'home', key: 'timeouts', delta: 9 }, 19_000);
  assert.equal(s.teams.home.timeouts, 5, 'timeouts are capped at the sport maximum');
});

test('football down and distance, period labels', () => {
  let s = defaultState();
  assert.equal(toGraphicData(s).info, '1st & 10');
  s = reduce(s, { type: 'football.set', down: 3, distance: 4, possession: 'away' }, 0);
  let d = toGraphicData(s);
  assert.equal(d.info, '3rd & 4');
  assert.equal(d.possession, 'away');
  s = reduce(s, { type: 'football.set', goal: true }, 0);
  assert.equal(toGraphicData(s).info, '3rd & Goal');
  s = reduce(s, { type: 'football.set', down: 0 }, 0);
  assert.equal(toGraphicData(s).info, '');
  s = reduce(s, { type: 'settings.set', periodStyle: 'long' }, 0);
  assert.equal(toGraphicData(s).period, '1st Quarter');
  s = reduce(s, { type: 'period.set', period: 'OT', resetClock: true }, 0);
  assert.equal(s.clock.baseMs, 10 * 60_000);
});

test('American sports put the home team on the right, soccer on the left', () => {
  const s = defaultState();
  assert.equal(toGraphicData(s).homeSide, 'right');
  assert.equal(toGraphicData(reduce(s, { type: 'sport.set', sport: 'basketball' }, 0)).homeSide, 'right');
  assert.equal(toGraphicData(reduce(s, { type: 'sport.set', sport: 'soccer' }, 0)).homeSide, 'left');
});

test('down & distance and shot clock can be switched off', () => {
  let s = defaultState();
  assert.equal(toGraphicData(s).info, '1st & 10');
  s = reduce(s, { type: 'show.set', key: 'downDistance', value: false }, 0);
  assert.equal(toGraphicData(s).info, '');
  s = reduce(s, { type: 'sport.set', sport: 'basketball' }, 0);
  assert.equal(toGraphicData(s).shotClock.visible, true);
  s = reduce(s, { type: 'show.set', key: 'shotClock', value: false }, 0);
  assert.equal(toGraphicData(s).shotClock.visible, false);
  s = reduce(s, { type: 'match.reset' }, 0);
  assert.equal(s.show.shotClock, false, 'the choice survives a new match');
  assert.equal(reduce(s, { type: 'show.set', key: 'nope', value: true }, 0), s);
});

test('possession indicator can be the dot, the football or an uploaded image', () => {
  let s = defaultState();
  assert.equal(toGraphicData(s).possessionIcon, '');
  s = reduce(s, { type: 'settings.set', possessionIcon: 'football' }, 0);
  assert.equal(toGraphicData(s, 0, 'http://host').possessionIcon, 'http://host/icons/football.svg');
  s = reduce(s, { type: 'settings.set', possessionIcon: '/uploads/possession-1.png' }, 0);
  assert.equal(toGraphicData(s, 0, 'http://host').possessionIcon, 'http://host/uploads/possession-1.png');
  assert.equal(reduce(s, { type: 'settings.set', possessionIcon: 'https://elsewhere/x.png' }, 0), s);
  s = reduce(s, { type: 'match.reset' }, 0);
  assert.equal(s.possessionIcon, '/uploads/possession-1.png', 'the choice survives a new match');
});

test('graphic data shifts clock start into local time', () => {
  const s = reduce(defaultState(), { type: 'clock.start' }, 10_000);
  assert.equal(toGraphicData(s, 250).clock.startedAt, 9750);
});

test('clock formatting and parsing', () => {
  assert.equal(formatClock(15 * 60_000, 'down'), '15:00');
  assert.equal(formatClock(15 * 60_000 - 1, 'down'), '15:00');
  assert.equal(formatClock(59_940, 'down', true), '59.9');
  assert.equal(formatClock(0, 'down', true), '0.0');
  assert.equal(formatClock(47 * 60_000 + 5999, 'up'), '47:05');
  assert.equal(parseClock('12:30'), 750_000);
  assert.equal(parseClock('12'), 720_000);
  assert.equal(parseClock(':30'), 30_000);
  assert.equal(parseClock('abc'), null);
});

test('bundled league packs are well formed', () => {
  const leagues = loadLeagues(fileURLToPath(new URL('../leagues', import.meta.url)));
  assert.deepEqual(leagues.map((l) => l.id), ['mls', 'nba', 'nfl']);
  const counts = Object.fromEntries(leagues.map((l) => [l.id, l.teams.length]));
  assert.deepEqual(counts, { mls: 30, nba: 30, nfl: 32 });
  for (const league of leagues) {
    assert.ok(SPORTS[league.sport], `${league.id} names a known sport`);
    assert.equal(new Set(league.teams.map((t) => t.id)).size, league.teams.length, `${league.id} team ids are unique`);
    for (const t of league.teams) {
      assert.ok(t.name && t.label && t.short.length <= 5, `${league.id}/${t.id} has a name and short name`);
      assert.match(t.color, /^#[0-9a-f]{6}$/i);
      assert.equal(t.logo, '', 'no logos are shipped');
    }
    assert.deepEqual(league.logos, { found: 0, missing: league.teams.map((t) => t.label), unmatched: [] });
  }
  const niners = leagues.find((l) => l.id === 'nfl').teams.find((t) => t.id === 'sf');
  assert.deepEqual(niners, { id: 'sf', label: 'San Francisco 49ers', name: '49ers', short: 'SF', color: '#AA0000', logo: '' });
});

test('logo files are matched to teams by loose names', () => {
  const nba = [
    { id: 'cha', short: 'CHA', city: 'Charlotte', name: 'Hornets' },
    { id: 'bkn', short: 'BKN', city: 'Brooklyn', name: 'Nets' },
    { id: 'lal', short: 'LAL', city: 'Los Angeles', name: 'Lakers' },
    { id: 'lac', short: 'LAC', city: 'LA', name: 'Clippers' },
    { id: 'phi', short: 'PHI', city: 'Philadelphia', name: '76ers' },
    { id: 'nyk', short: 'NYK', city: 'New York', name: 'Knicks' },
  ];
  const { byTeam, unmatched } = matchLogos(
    nba,
    [
      'charlotte-hornets.png', // contains "nets" too: the longer name wins
      'Nets_Logo_2024.svg',
      'LAL.png',
      'la clippers primary logo.webp',
      'Philadelphia 76ers.jpg',
      'knicks.png',
      'knicks.svg', // two files for one team: svg is preferred
      'nba-logo.png', // the league's own logo is not a team
      'mystery.png',
      'README.txt',
    ],
    ['nba'],
  );
  assert.deepEqual(Object.fromEntries(byTeam), {
    cha: 'charlotte-hornets.png',
    bkn: 'Nets_Logo_2024.svg',
    lal: 'LAL.png',
    lac: 'la clippers primary logo.webp',
    phi: 'Philadelphia 76ers.jpg',
    nyk: 'knicks.svg',
  });
  assert.deepEqual(unmatched, ['knicks.png', 'mystery.png', 'nba-logo.png']);

  // A city shared by two teams does not pick one of them.
  const nfl = [
    { id: 'nyg', short: 'NYG', city: 'New York', name: 'Giants' },
    { id: 'nyj', short: 'NYJ', city: 'New York', name: 'Jets' },
    { id: 'sf', short: 'SF', city: 'San Francisco', name: '49ers' },
  ];
  const r = matchLogos(nfl, ['New York.png', 'san francisco.png', 'jets.png']);
  assert.deepEqual(Object.fromEntries(r.byTeam), { sf: 'san francisco.png', nyj: 'jets.png' });
  assert.deepEqual(r.unmatched, ['New York.png']);
});

test('a league folder reports found, missing and unrecognized logos', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scorebug-leagues-'));
  try {
    const logos = path.join(dir, 'demo', 'logos');
    fs.mkdirSync(logos, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'demo', 'league.json'),
      JSON.stringify({
        name: 'Demo',
        sport: 'soccer',
        teams: [
          { id: 'lions', short: 'LIO', name: 'Lakeside Lions', color: '#1D4ED8' },
          { id: 'hawks', short: 'HAW', name: 'Harbor Hawks', color: '#B91C1C' },
          { id: 'owls', short: 'OWL', name: 'Night Owls', color: '#111111', logo: 'special.png' },
        ],
      }),
    );
    for (const f of ['Lakeside Lions Logo.png', 'special.png', 'other.png']) fs.writeFileSync(path.join(logos, f), '');
    const [league] = loadLeagues(dir);
    const logo = (id) => league.teams.find((t) => t.id === id).logo;
    assert.equal(logo('lions'), '/leagues/demo/logos/Lakeside%20Lions%20Logo.png');
    assert.equal(logo('owls'), '/leagues/demo/logos/special.png');
    assert.equal(logo('hawks'), '');
    assert.deepEqual(league.logos, { found: 2, missing: ['Harbor Hawks'], unmatched: ['other.png'] });

    // An upload is saved under the team id and wins over a loosely named file.
    assert.equal(saveTeamLogo(dir, 'demo', 'lions', 'svg', '<svg/>'), '/leagues/demo/logos/lions.svg');
    assert.equal(saveTeamLogo(dir, 'demo', 'lions', 'png', 'x'), '/leagues/demo/logos/lions.png');
    assert.equal(fs.existsSync(path.join(logos, 'lions.svg')), false, 'the earlier upload is replaced');
    const after = loadLeagues(dir)[0];
    assert.equal(after.teams.find((t) => t.id === 'lions').logo, '/leagues/demo/logos/lions.png');
    assert.deepEqual(after.logos.unmatched, ['Lakeside Lions Logo.png', 'other.png']);
    assert.equal(saveTeamLogo(dir, 'demo', 'nobody', 'png', 'x'), null);
    assert.equal(saveTeamLogo(dir, '../demo', 'lions', 'png', 'x'), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

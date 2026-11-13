import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, reduce, msUntilExpiry } from '../server/state.js';
import { valueAt, formatClock, parseClock } from '../shared/clock.js';
import { toGraphicData } from '../shared/view.js';

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

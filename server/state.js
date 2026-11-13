// Match state and the pure reducer that applies control-panel commands.

import { SPORTS, periodStartMs } from '../shared/sports.js';
import { valueAt, startClock, stopClock, setClock } from '../shared/clock.js';

export const STATE_VERSION = 1;
const TEAMS = ['home', 'away'];
const UNDO_LIMIT = 50;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const int = (v) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : null);

function newTeam(name, short, color) {
  return { name, short, color, logo: '', score: 0, timeouts: 0, fouls: 0 };
}

export function defaultState() {
  const s = {
    version: STATE_VERSION,
    rev: 0,
    sport: 'football',
    visible: true,
    periodStyle: 'short',
    period: 'Q1',
    periodMin: Object.fromEntries(Object.values(SPORTS).map((sp) => [sp.id, sp.periodMin])),
    teams: {
      home: newTeam('Home', 'HOM', '#1d4ed8'),
      away: newTeam('Away', 'AWY', '#b91c1c'),
    },
    clock: { running: false, baseMs: 0, startedAt: 0, direction: 'down' },
    shotClock: { running: false, baseMs: 24_000, startedAt: 0, direction: 'down' },
    football: { down: 1, distance: 10, goal: false, possession: '' },
    soccer: { stoppage: 0 },
    undo: [],
  };
  resetMatch(s, 0);
  return s;
}

function resetClockToPeriod(s, now) {
  const sport = SPORTS[s.sport];
  s.clock.running = false;
  s.clock.direction = sport.clock;
  setClock(s.clock, periodStartMs(s.sport, s.period, s.periodMin[s.sport]), now);
  s.shotClock.running = false;
  setClock(s.shotClock, (sport.shotClock ?? 24) * 1000, now);
}

function resetMatch(s, now) {
  const sport = SPORTS[s.sport];
  s.period = sport.periods[0].id;
  for (const t of TEAMS) {
    s.teams[t].score = 0;
    s.teams[t].timeouts = sport.timeouts;
    s.teams[t].fouls = 0;
  }
  s.football = { down: 1, distance: 10, goal: false, possession: '' };
  s.soccer = { stoppage: 0 };
  s.undo = [];
  resetClockToPeriod(s, now);
}

function pushUndo(s) {
  s.undo.push([s.teams.home.score, s.teams.away.score]);
  if (s.undo.length > UNDO_LIMIT) s.undo.shift();
}

/** Stop clocks that have counted down to zero. */
function expire(s, now) {
  if (s.clock.running && s.clock.direction === 'down' && valueAt(s.clock, now) <= 0) {
    stopClock(s.clock, now);
    stopClock(s.shotClock, now);
  }
  if (s.shotClock.running && valueAt(s.shotClock, now) <= 0) stopClock(s.shotClock, now);
}

/** Returns the next state, or the same object if the command is invalid. */
export function reduce(prev, cmd, now = Date.now()) {
  const s = structuredClone(prev);
  const sport = SPORTS[s.sport];
  const team = TEAMS.includes(cmd.team) ? s.teams[cmd.team] : null;

  switch (cmd.type) {
    case 'tick':
      break;

    case 'sport.set':
      if (!SPORTS[cmd.sport] || cmd.sport === s.sport) return prev;
      s.sport = cmd.sport;
      resetMatch(s, now);
      break;

    case 'match.reset':
      resetMatch(s, now);
      break;

    case 'visible.set':
      s.visible = !!cmd.visible;
      break;

    case 'score.add': {
      const delta = int(cmd.delta);
      if (!team || delta === null) return prev;
      const next = Math.max(0, team.score + delta);
      if (next === team.score) return prev;
      pushUndo(s);
      team.score = next;
      break;
    }
    case 'score.set': {
      const value = int(cmd.value);
      if (!team || value === null || value < 0) return prev;
      pushUndo(s);
      team.score = value;
      break;
    }
    case 'undo': {
      const last = s.undo.pop();
      if (!last) return prev;
      [s.teams.home.score, s.teams.away.score] = last;
      break;
    }

    case 'team.update': {
      if (!team) return prev;
      for (const key of ['name', 'short', 'color', 'logo']) {
        if (typeof cmd[key] === 'string') team[key] = cmd[key].slice(0, 200);
      }
      break;
    }
    case 'team.stat': {
      const delta = int(cmd.delta);
      if (!team || delta === null) return prev;
      if (cmd.key === 'timeouts') team.timeouts = clamp(team.timeouts + delta, 0, sport.timeouts);
      else if (cmd.key === 'fouls') team.fouls = clamp(team.fouls + delta, 0, 99);
      else return prev;
      break;
    }
    case 'fouls.reset':
      for (const t of TEAMS) s.teams[t].fouls = 0;
      break;

    case 'clock.start':
      startClock(s.clock, now);
      if (sport.shotClock && s.clock.running) startClock(s.shotClock, now);
      break;
    case 'clock.stop':
      stopClock(s.clock, now);
      stopClock(s.shotClock, now);
      break;
    case 'clock.toggle':
      return reduce(prev, { type: s.clock.running ? 'clock.stop' : 'clock.start' }, now);
    case 'clock.set': {
      const ms = Number(cmd.ms);
      if (!Number.isFinite(ms)) return prev;
      setClock(s.clock, ms, now);
      break;
    }
    case 'clock.adjust': {
      const delta = Number(cmd.deltaMs);
      if (!Number.isFinite(delta)) return prev;
      setClock(s.clock, valueAt(s.clock, now) + delta, now);
      break;
    }
    case 'clock.reset':
      resetClockToPeriod(s, now);
      break;

    case 'period.set':
      if (!sport.periods.some((p) => p.id === cmd.period)) return prev;
      s.period = cmd.period;
      if (cmd.resetClock) resetClockToPeriod(s, now);
      break;

    case 'shot.set': {
      const seconds = Number(cmd.seconds);
      if (!sport.shotClock || !Number.isFinite(seconds)) return prev;
      setClock(s.shotClock, seconds * 1000, now);
      s.shotClock.running = s.clock.running && seconds > 0;
      break;
    }

    case 'football.set': {
      const f = s.football;
      if (cmd.down !== undefined) f.down = clamp(int(cmd.down) ?? f.down, 0, 4);
      if (cmd.distance !== undefined) f.distance = clamp(int(cmd.distance) ?? f.distance, 0, 99);
      if (cmd.goal !== undefined) f.goal = !!cmd.goal;
      if (cmd.possession !== undefined) f.possession = TEAMS.includes(cmd.possession) ? cmd.possession : '';
      break;
    }
    case 'soccer.set':
      if (cmd.stoppage !== undefined) s.soccer.stoppage = clamp(int(cmd.stoppage) ?? 0, 0, 30);
      break;

    case 'settings.set':
      if (cmd.periodStyle === 'short' || cmd.periodStyle === 'long') s.periodStyle = cmd.periodStyle;
      if (cmd.periodMin !== undefined) {
        const min = Number(cmd.periodMin);
        if (!Number.isFinite(min) || min <= 0 || min > 120) return prev;
        s.periodMin[s.sport] = min;
      }
      break;

    default:
      return prev;
  }

  expire(s, now);
  s.rev = prev.rev + 1;
  return s;
}

/** Milliseconds until a running countdown needs an expiry tick, or null. */
export function msUntilExpiry(s, now) {
  const times = [];
  if (s.clock.running && s.clock.direction === 'down') times.push(valueAt(s.clock, now));
  if (s.shotClock.running) times.push(valueAt(s.shotClock, now));
  return times.length ? Math.min(...times) : null;
}

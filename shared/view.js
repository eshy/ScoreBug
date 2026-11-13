// Turns match state into the presentation-ready `data` object the OGraf
// graphics receive in load() / updateAction().

import { SPORTS, getPeriod } from './sports.js';

const ORDINALS = ['', '1st', '2nd', '3rd', '4th'];

export function downAndDistance(f) {
  if (!f.down) return '';
  return `${ORDINALS[f.down]} & ${f.goal ? 'Goal' : f.distance}`;
}

/**
 * @param state   match state from the server
 * @param offset  server clock minus local clock (ms), so the graphic can run
 *                the clock against its own Date.now()
 * @param origin  prefix for logo URLs
 */
export function toGraphicData(state, offset = 0, origin = '') {
  const sport = SPORTS[state.sport];
  const period = getPeriod(state.sport, state.period);
  const local = (c) => ({
    running: c.running,
    baseMs: c.baseMs,
    startedAt: c.startedAt - offset,
    direction: c.direction,
  });
  const team = (t) => ({
    name: t.name,
    short: t.short,
    color: t.color,
    logo: t.logo ? origin + t.logo : '',
    score: t.score,
    timeouts: t.timeouts,
    fouls: t.fouls,
  });
  return {
    sport: state.sport,
    home: team(state.teams.home),
    away: team(state.teams.away),
    period: state.periodStyle === 'long' ? period.long : period.short,
    clock: { ...local(state.clock), visible: !period.noClock, tenths: state.sport === 'basketball' },
    shotClock: { ...local(state.shotClock), visible: !!sport.shotClock },
    info: state.sport === 'football' ? downAndDistance(state.football) : '',
    possession: state.sport === 'football' ? state.football.possession : '',
    stoppage: state.sport === 'soccer' ? state.soccer.stoppage : 0,
    maxTimeouts: sport.timeouts,
    showFouls: !!sport.fouls,
  };
}

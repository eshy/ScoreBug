// Sport definitions: the single source of truth for the server, the control
// panel and the renderer. Adding a sport = adding one entry here.

export const MIN = 60_000;

export const SPORTS = {
  football: {
    id: 'football',
    name: 'American Football',
    scoreButtons: [
      { value: 6, label: 'TD' },
      { value: 1, label: 'PAT' },
      { value: 2, label: '2PT / Safety' },
      { value: 3, label: 'FG' },
    ],
    clock: 'down',
    periodMin: 15,
    periods: [
      { id: 'Q1', short: 'Q1', long: '1st Quarter' },
      { id: 'Q2', short: 'Q2', long: '2nd Quarter' },
      { id: 'Q3', short: 'Q3', long: '3rd Quarter' },
      { id: 'Q4', short: 'Q4', long: '4th Quarter' },
      { id: 'OT', short: 'OT', long: 'Overtime', minutes: 10 },
    ],
    timeouts: 3,
  },
  soccer: {
    id: 'soccer',
    name: 'Soccer',
    scoreButtons: [{ value: 1, label: 'Goal' }],
    clock: 'up',
    periodMin: 45,
    // startPeriods: the running clock starts at this many period lengths.
    periods: [
      { id: 'H1', short: '1H', long: 'First Half', startPeriods: 0 },
      { id: 'H2', short: '2H', long: 'Second Half', startPeriods: 1 },
      { id: 'ET', short: 'ET', long: 'Extra Time', startPeriods: 2 },
      { id: 'PEN', short: 'PEN', long: 'Penalties', noClock: true },
    ],
    timeouts: 0,
  },
  basketball: {
    id: 'basketball',
    name: 'Basketball',
    scoreButtons: [
      { value: 1, label: 'Free throw' },
      { value: 2, label: '2 pts' },
      { value: 3, label: '3 pts' },
    ],
    clock: 'down',
    periodMin: 12,
    periods: [
      { id: 'Q1', short: 'Q1', long: '1st Quarter' },
      { id: 'Q2', short: 'Q2', long: '2nd Quarter' },
      { id: 'Q3', short: 'Q3', long: '3rd Quarter' },
      { id: 'Q4', short: 'Q4', long: '4th Quarter' },
      { id: 'OT', short: 'OT', long: 'Overtime', minutes: 5 },
    ],
    timeouts: 5,
    shotClock: 24,
    fouls: true,
  },
};

export function getPeriod(sportId, periodId) {
  const sport = SPORTS[sportId];
  return sport.periods.find((p) => p.id === periodId) ?? sport.periods[0];
}

/** Clock value (ms) at the start of a period. */
export function periodStartMs(sportId, periodId, periodMin) {
  const sport = SPORTS[sportId];
  const period = getPeriod(sportId, periodId);
  if (period.noClock) return 0;
  if (sport.clock === 'down') return (period.minutes ?? periodMin) * MIN;
  return (period.startPeriods ?? 0) * periodMin * MIN;
}

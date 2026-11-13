// Clock math. A clock is { running, baseMs, startedAt, direction }.
// baseMs is the value when stopped, or the value at startedAt when running,
// so nothing has to tick over the network.

export function valueAt(c, now) {
  if (!c.running) return Math.max(0, c.baseMs);
  const elapsed = now - c.startedAt;
  return Math.max(0, c.direction === 'down' ? c.baseMs - elapsed : c.baseMs + elapsed);
}

export function startClock(c, now) {
  if (c.running) return;
  if (c.direction === 'down' && c.baseMs <= 0) return;
  c.running = true;
  c.startedAt = now;
}

export function stopClock(c, now) {
  if (!c.running) return;
  c.baseMs = valueAt(c, now);
  c.running = false;
}

export function setClock(c, ms, now) {
  c.baseMs = Math.max(0, Math.round(ms));
  c.startedAt = now;
}

export function formatClock(ms, direction = 'up', tenths = false) {
  ms = Math.max(0, ms);
  if (direction === 'down') {
    if (tenths && ms < 60_000) {
      const t = Math.floor(ms / 100);
      return `${Math.floor(t / 10)}.${t % 10}`;
    }
    const total = Math.ceil(ms / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** "12:30" -> 750000, "12" -> 12 minutes, ":30" -> 30 seconds. null if invalid. */
export function parseClock(text) {
  const m = /^\s*(\d*)(?::(\d{1,2}(?:\.\d)?))?\s*$/.exec(text);
  if (!m || (m[1] === '' && m[2] === undefined)) return null;
  return Math.round((Number(m[1] || 0) * 60 + Number(m[2] || 0)) * 1000);
}

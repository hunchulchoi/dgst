const REPLAY_CLASS = 'seotda-replay-data';
const MAX_EVENTS = 64;

/** @param {unknown} value @param {number} maxLength */
function cleanText(value, maxLength) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/** @param {unknown} value @param {number} min @param {number} max */
function cleanNumber(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : 0;
}

/** @param {unknown} value */
export function sanitizeSeotdaReplay(value) {
  if (!value || typeof value !== 'object') return null;
  const replay = /** @type {Record<string, unknown>} */ (value);
  const rawSeats = Array.isArray(replay.seats) ? replay.seats : [];
  const rawEvents = Array.isArray(replay.events) ? replay.events : [];
  if (rawSeats.length < 2 || rawSeats.length > 4 || rawEvents.length < 2) return null;

  const seatIds = new Set();
  const seats = rawSeats.map((rawSeat) => {
    if (!rawSeat || typeof rawSeat !== 'object') return null;
    const seat = /** @type {Record<string, unknown>} */ (rawSeat);
    const id = cleanText(seat.id, 32);
    const name = cleanText(seat.name, 24);
    if (!id || !name || seatIds.has(id)) return null;
    seatIds.add(id);
    const rawCards = Array.isArray(seat.cards) ? seat.cards : [];
    if (rawCards.length > 2) return null;
    const cards = rawCards.map((rawCard) => {
      if (!rawCard || typeof rawCard !== 'object') return null;
      const card = /** @type {Record<string, unknown>} */ (rawCard);
      const month = cleanNumber(card.month, 1, 10);
      if (!month) return null;
      return { month, gwang: Boolean(card.gwang) };
    });
    if (cards.some((card) => card === null)) return null;
    return {
      id,
      name,
      chips: cleanNumber(seat.chips, 0, 1_000_000_000_000),
      folded: Boolean(seat.folded),
      winner: Boolean(seat.winner),
      handName: cleanText(seat.handName, 32),
      cards
    };
  });
  if (seats.some((seat) => seat === null)) return null;

  const events = rawEvents.slice(0, MAX_EVENTS).map((rawEvent) => {
    if (!rawEvent || typeof rawEvent !== 'object') return null;
    const event = /** @type {Record<string, unknown>} */ (rawEvent);
    const type = cleanText(event.type, 20);
    const allowedTypes = new Set([
      'deal',
      'ante',
      'action',
      'taunt',
      'showdown',
      'ddaeng',
      'result'
    ]);
    if (!allowedTypes.has(type)) return null;
    const seatId = cleanText(event.seatId, 32) || null;
    if (seatId && !seatIds.has(seatId)) return null;
    return {
      type,
      seatId,
      text: cleanText(event.text, 160),
      amount: cleanNumber(event.amount, 0, 1_000_000_000_000),
      potAfter: cleanNumber(event.potAfter, 0, 1_000_000_000_000)
    };
  });
  if (events.some((event) => event === null)) return null;
  const rawDdaeng =
    replay.ddaeng && typeof replay.ddaeng === 'object'
      ? /** @type {Record<string, unknown>} */ (replay.ddaeng)
      : null;

  return {
    version: 1,
    result: ['승리', '패배', '무승부'].includes(String(replay.result))
      ? String(replay.result)
      : '무승부',
    ante: cleanNumber(replay.ante, 0, 1_000_000_000_000),
    finalPot: cleanNumber(replay.finalPot, 0, 1_000_000_000_000),
    note: cleanText(replay.note, 500),
    seats,
    events,
    ddaeng: rawDdaeng
      ? {
          winnerId: cleanText(rawDdaeng.winnerId, 32),
          handName: cleanText(rawDdaeng.handName, 32),
          valuePerLoser: cleanNumber(rawDdaeng.valuePerLoser, 0, 1_000_000_000_000),
          totalPaid: cleanNumber(rawDdaeng.totalPaid, 0, 1_000_000_000_000)
        }
      : null
  };
}

/** @param {unknown} replay */
export function embedSeotdaReplay(replay) {
  const sanitized = sanitizeSeotdaReplay(replay);
  if (!sanitized) throw new Error('invalid seotda replay');
  const encoded = Buffer.from(JSON.stringify(sanitized), 'utf8').toString('base64url');
  return `<pre class="${REPLAY_CLASS}">${encoded}</pre>`;
}

/** @param {string | null | undefined} content */
export function extractSeotdaReplay(content) {
  const match = String(content ?? '').match(
    /<pre\s+class=["'][^"']*\bseotda-replay-data\b[^"']*["'][^>]*>([A-Za-z0-9_-]+)<\/pre>/i
  );
  if (!match) return null;
  try {
    return sanitizeSeotdaReplay(JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8')));
  } catch {
    return null;
  }
}

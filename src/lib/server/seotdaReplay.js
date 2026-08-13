const REPLAY_CLASS = 'seotda-replay-data';
const MAX_EVENTS = 64;
// ASCII control characters are intentionally matched so replay text cannot embed them.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = new RegExp('[\\u0000-\\u001f\\u007f]', 'g');

/** @param {unknown} value @param {number} maxLength */
function cleanText(value, maxLength) {
  return String(value ?? '')
    .replace(CONTROL_CHARACTERS, ' ')
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
    if (rawCards.length > 5) return null;
    const cards = rawCards.map((rawCard) => {
      if (!rawCard || typeof rawCard !== 'object') return null;
      const card = /** @type {Record<string, unknown>} */ (rawCard);
      const month = cleanNumber(card.month, 1, 10);
      if (!month) return null;
      return { month, gwang: Boolean(card.gwang) };
    });
    if (cards.some((card) => card === null)) return null;
    const rawDoriIndices = Array.isArray(seat.doriIndices) ? seat.doriIndices : null;
    const hasDoriIndices = rawDoriIndices !== null;
    const doriIndices = rawDoriIndices
      ? [...new Set(rawDoriIndices.map((index) => Number(index)))].sort((a, b) => a - b)
      : null;
    const emotion =
      seat.emotion && typeof seat.emotion === 'object'
        ? /** @type {Record<string, unknown>} */ (seat.emotion)
        : null;
    const tell =
      seat.tell && typeof seat.tell === 'object'
        ? /** @type {Record<string, unknown>} */ (seat.tell)
        : null;
    if (
      doriIndices &&
      ((doriIndices.length !== 0 && doriIndices.length !== 3) ||
        doriIndices.some((index) => !Number.isInteger(index) || index < 0 || index >= cards.length))
    ) {
      return null;
    }
    return {
      id,
      name,
      chips: cleanNumber(seat.chips, 0, 1_000_000_000_000),
      folded: Boolean(seat.folded),
      winner: Boolean(seat.winner),
      handName: cleanText(seat.handName, 32),
      cards,
      ...(hasDoriIndices ? { doriIndices } : {}),
      emotion: emotion
        ? {
            mood: cleanText(emotion.mood, 24),
            line: cleanText(emotion.line, 80),
            revenge: Boolean(emotion.revenge),
            aggression: cleanNumber(emotion.aggression, 0, 3)
          }
        : null,
      tell:
        tell && ['strong', 'neutral', 'weak'].includes(String(tell.signal))
          ? {
              signal: String(tell.signal),
              label: cleanText(tell.label, 24),
              text: cleanText(tell.text, 80)
            }
          : null
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
      'gaepyeong',
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
  const rawSeries =
    replay.series && typeof replay.series === 'object'
      ? /** @type {Record<string, unknown>} */ (replay.series)
      : null;
  const rawEvent =
    replay.event && typeof replay.event === 'object'
      ? /** @type {Record<string, unknown>} */ (replay.event)
      : null;
  const rawGaepyeong =
    replay.gaepyeong && typeof replay.gaepyeong === 'object'
      ? /** @type {Record<string, unknown>} */ (replay.gaepyeong)
      : null;
  const bossNpcId = cleanText(rawSeries?.bossNpcId, 32) || null;

  return {
    version: cleanNumber(replay.version, 1, 2) || 1,
    result: ['승리', '패배', '무승부'].includes(String(replay.result))
      ? String(replay.result)
      : '무승부',
    ruleMode: replay.ruleMode === 'classic' ? 'classic' : 'basic',
    ante: cleanNumber(replay.ante, 0, 1_000_000_000_000),
    finalPot: cleanNumber(replay.finalPot, 0, 1_000_000_000_000),
    note: cleanText(replay.note, 500),
    series: rawSeries
      ? {
          handNo: cleanNumber(rawSeries.handNo, 1, 5) || 1,
          isBoss: Boolean(rawSeries.isBoss),
          bossNpcId: bossNpcId && seatIds.has(bossNpcId) ? bossNpcId : null,
          anteMultiplier: cleanNumber(rawSeries.anteMultiplier, 1, 10) || 1,
          completed: cleanNumber(rawSeries.completed, 0, 5),
          userWins: cleanNumber(rawSeries.userWins, 0, 5),
          npcWins: cleanNumber(rawSeries.npcWins, 0, 5)
        }
      : null,
    event:
      rawEvent && ['scout', 'lightning', 'high-roller', 'frenzy'].includes(String(rawEvent.id))
        ? {
            id: String(rawEvent.id),
            name: cleanText(rawEvent.name, 24),
            description: cleanText(rawEvent.description, 80),
            anteMultiplier: cleanNumber(rawEvent.anteMultiplier, 1, 10) || 1,
            maxRaises: cleanNumber(rawEvent.maxRaises, 0, 10)
          }
        : null,
    gaepyeong:
      rawGaepyeong &&
      Number.isFinite(Number(rawGaepyeong.amount)) &&
      Number(rawGaepyeong.amount) >= 700
        ? {
            amount: cleanNumber(rawGaepyeong.amount, 700, 100_000),
            line: cleanText(rawGaepyeong.line, 120)
          }
        : null,
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

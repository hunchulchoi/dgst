import { NPC_PROFILES } from './seotdaNpc.js';

/**
 * @typedef {{
 *   completed: number;
 *   userWins: number;
 *   npcWins: Record<string, number>;
 * }} SeotdaSeries
 */

/** @returns {SeotdaSeries} */
export function createSeries() {
  return {
    completed: 0,
    userWins: 0,
    npcWins: Object.fromEntries(NPC_PROFILES.map((profile) => [profile.id, 0]))
  };
}

/**
 * @param {SeotdaSeries | null | undefined} current
 * @param {{ winnerId?: string | null; winnerIds?: string[]; showdown?: boolean; series?: { isBoss?: boolean } | null }} round
 * @returns {SeotdaSeries}
 */
export function advanceSeries(current, round) {
  if (round.series?.isBoss) return createSeries();

  const before = current ?? createSeries();
  const next = {
    completed: Math.min(4, Math.max(0, Number(before.completed) || 0) + 1),
    userWins: Math.max(0, Number(before.userWins) || 0),
    npcWins: { ...createSeries().npcWins, ...(before.npcWins ?? {}) }
  };
  const winnerIds = round.winnerIds?.length
    ? round.winnerIds
    : round.winnerId
      ? [round.winnerId]
      : [];
  if (winnerIds.length !== 1) return next;

  const winnerId = winnerIds[0];
  if (winnerId === 'user') next.userWins += 1;
  else if (Object.prototype.hasOwnProperty.call(next.npcWins, winnerId)) {
    next.npcWins[winnerId] = Math.max(0, Number(next.npcWins[winnerId]) || 0) + 1;
  }
  return next;
}

/** @param {SeotdaSeries} series */
function pickBossNpcId(series) {
  let boss = NPC_PROFILES[0];
  let bestWins = -1;
  for (const profile of NPC_PROFILES) {
    const wins = Math.max(0, Number(series.npcWins?.[profile.id]) || 0);
    if (wins > bestWins) {
      boss = profile;
      bestWins = wins;
    }
  }
  return boss.id;
}

/**
 * @param {SeotdaSeries | null | undefined} current
 */
export function seriesRoundConfig(current) {
  const series = current ?? createSeries();
  const completed = Math.max(0, Math.min(4, Number(series.completed) || 0));
  const isBoss = completed >= 4;
  return {
    handNo: isBoss ? 5 : completed + 1,
    isBoss,
    bossNpcId: isBoss ? pickBossNpcId(series) : null,
    anteMultiplier: isBoss ? 2 : 1,
    completed,
    userWins: Math.max(0, Number(series.userWins) || 0),
    npcWins: Object.values(series.npcWins ?? {}).reduce(
      (sum, wins) => sum + Math.max(0, Number(wins) || 0),
      0
    )
  };
}

/**
 * @param {{ showdown?: boolean; winnerId?: string | null; winnerIds?: string[]; series?: ReturnType<typeof seriesRoundConfig> | null }} round
 */
export function publicSeries(round) {
  if (!round.series) return null;
  const current = { ...round.series };
  if (!round.showdown) return current;

  current.completed = Math.min(5, current.completed + 1);
  const winnerIds = round.winnerIds?.length
    ? round.winnerIds
    : round.winnerId
      ? [round.winnerId]
      : [];
  if (winnerIds.length === 1) {
    if (winnerIds[0] === 'user') current.userWins += 1;
    else current.npcWins += 1;
  }
  return current;
}

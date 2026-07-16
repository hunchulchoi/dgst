import {
  evaluateHand,
  handStrength,
  minRaisePay
} from '../src/routes/games/seotda/seotdaEngine.js';
import {
  applyPlayerAction,
  contributionCapacity,
  createNewRound,
  runNpcTurns
} from '../src/routes/games/seotda/seotdaRound.js';

function seededRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function userMove(round, policy) {
  const user = round.seats.find((seat) => seat.id === 'user');
  if (!user || user.folded || !user.needsAction) return null;
  const toCall = Math.max(0, round.currentBet - user.contrib);
  const capacity = contributionCapacity(round, user);
  if (policy === 'max-raise') {
    if (capacity > toCall) return { action: 'raise', amount: capacity };
    return { action: 'call' };
  }
  const strength = handStrength(evaluateHand(user.cards));
  if (toCall === 0) {
    if (strength >= 0.72 && capacity > 0) {
      return {
        action: 'raise',
        amount: Math.min(capacity, minRaisePay(toCall, round.antePaid))
      };
    }
    return { action: 'call' };
  }
  if (strength >= 0.72 && capacity > toCall) {
    return {
      action: 'raise',
      amount: Math.min(capacity, minRaisePay(toCall, round.antePaid))
    };
  }
  if (strength >= 0.4) return { action: 'call' };
  return { action: 'die' };
}

export function simulateSession({ startingBalance, hands = 100, seed = 1, policy = 'hand' }) {
  const rng = seededRng(seed);
  let balance = startingBalance;
  let npcStacks = {};
  let openingActorId = 'user';
  let played = 0;
  for (; played < hands && balance >= 10; played += 1) {
    const round = createNewRound(balance, rng, npcStacks, openingActorId, 0, null);
    runNpcTurns(round, rng);
    for (let guard = 0; guard < 20 && round.phase === 'betting'; guard += 1) {
      const move = userMove(round, policy);
      if (!move) break;
      applyPlayerAction(round, 'user', move.action, move.amount);
      runNpcTurns(round, rng);
    }
    const user = round.seats.find((seat) => seat.id === 'user');
    balance = Math.max(0, user?.chips ?? 0);
    npcStacks = Object.fromEntries(
      round.seats.filter((seat) => seat.isNpc).map((seat) => [seat.id, seat.chips])
    );
    openingActorId = round.winnerId ?? 'user';
  }
  return {
    startingBalance,
    finalBalance: balance,
    played,
    returnPercent: ((balance - startingBalance) / startingBalance) * 100
  };
}

export function simulateAverage({ startingBalance, hands = 100, sessions = 200, policy = 'hand' }) {
  const results = Array.from({ length: sessions }, (_, index) =>
    simulateSession({ startingBalance, hands, seed: index + 1, policy })
  );
  return {
    startingBalance,
    hands,
    sessions,
    policy,
    averageReturnPercent:
      results.reduce((sum, result) => sum + result.returnPercent, 0) / results.length,
    bustRatePercent:
      (results.filter((result) => result.played < hands).length / results.length) * 100
  };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const balances = [42_454, 100_000, 1_000_000];
  const report = balances.flatMap((startingBalance) => [
    simulateAverage({ startingBalance, policy: 'hand' }),
    simulateAverage({ startingBalance, policy: 'max-raise' })
  ]);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

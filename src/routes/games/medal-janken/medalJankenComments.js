/**
 * @param {{ balance: number; outcome: 'win'|'lose'|'draw'; multiplier: number; payout: number }} result
 * @param {{ bet: number }} round
 */
export function buildMedalJankenResultComment(result, round) {
  const payout = new Intl.NumberFormat('ko-KR').format(result.payout);
  const bet = new Intl.NumberFormat('ko-KR').format(round.bet);

  // 꽝과 오링이 동시에 발생하면 보상 중복을 막기 위해 합친 리플 하나만 작성한다.
  if (result.balance === 0) {
    return result.outcome === 'win' && result.multiplier === 0
      ? `💥 룰렛 꽝으로 오링! 마지막 베팅 ${bet}개까지 사라졌다… 😵`
      : `😢 메달 짱껨보 오링! 마지막 베팅 ${bet}개를 잃었다…`;
  }
  if (result.outcome !== 'win') return '';
  if (result.multiplier === 20) {
    return `🎰 메달 짱껨보 20배 잭팟! ${payout}개 당첨! 🎰`;
  }
  if (result.multiplier === 10) {
    return `🎉 메달 짱껨보 10배 당첨! ${payout}개 획득! 🎉`;
  }
  if (result.multiplier === 0) {
    return `💥 이겼는데 룰렛은 꽝! 베팅 ${bet}개가 사라졌다…`;
  }
  return '';
}

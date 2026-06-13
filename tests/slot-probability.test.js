import { describe, it, expect } from 'vitest';

/**
 * 슬롯 머신 확률 테스트
 * 1000번 스핀을 돌려서 각 승리 패턴의 출현 횟수를 통계로 확인
 */

function spinReels() {
  // const symbols = ['🍒', '🍋', '🔔', '⭐', '7️⃣', '💎', '🍀'];
  //const symbols = ['🍒', '🍋', '🔔', '⭐', '7️⃣'];
  const symbols = ['🍒', '🍋', '🔔', '⭐', '7️⃣', '🍀'];
  return [0, 0, 0].map(() => symbols[Math.floor(Math.random() * symbols.length)]);
}

/**
 * @param {string[]} reels
 * @param {number} bet
 */
function calcPayout(reels, bet) {
  const [a, b, c] = reels;
  if (a === b && b === c) {
    // triple
    // 7️⃣7️⃣7️⃣은 ×20, 나머지는 ×10
    if (a === '7️⃣' && b === '7️⃣' && c === '7️⃣') {
      return bet * 20;
    }
    return bet * 10;
  }
  if (a === b || b === c || a === c) {
    // pair
    return bet * 2;
  }
  return 0;
}

/**
 * @param {number} [spins=1000]
 * @param {number} [bet=100]
 */
function runSlotProbabilityTest(spins = 1000, bet = 100) {
  const stats = {
    total: spins,
    failure: 0, // 배당 0 (실패)
    x2: 0, // ×2 (페어)
    x10: 0, // ×10 (트리플, 7️⃣7️⃣7️⃣ 제외)
    x20: 0, // ×20 (7️⃣7️⃣7️⃣ 잭팟)
    totalBet: 0,
    totalPayout: 0,
    /** @type {Record<string, number>} */
    tripleDetails: {} // 트리플별 상세 (심볼별)
  };

  for (let i = 0; i < spins; i++) {
    const reels = spinReels();
    const payout = calcPayout(reels, bet);
    const multiplier = payout / bet;

    stats.totalBet += bet;
    stats.totalPayout += payout;

    if (multiplier === 0) {
      stats.failure++;
    } else if (multiplier === 2) {
      stats.x2++;
    } else if (multiplier === 10) {
      stats.x10++;
      // 트리플 상세 기록
      const symbol = reels[0];
      stats.tripleDetails[symbol] = (stats.tripleDetails[symbol] || 0) + 1;
    } else if (multiplier === 20) {
      stats.x20++;
    }
  }

  // 통계 계산
  const netResult = stats.totalPayout - stats.totalBet;
  const rtp = (stats.totalPayout / stats.totalBet) * 100; // Return to Player (%)

  return {
    ...stats,
    netResult,
    rtp: rtp.toFixed(2),
    percentages: {
      failure: ((stats.failure / spins) * 100).toFixed(2),
      x2: ((stats.x2 / spins) * 100).toFixed(2),
      x10: ((stats.x10 / spins) * 100).toFixed(2),
      x20: ((stats.x20 / spins) * 100).toFixed(2)
    }
  };
}

describe('Slot Machine Probability', () => {
  it('1000회 스핀 시뮬레이션이 정상적으로 완료되어야 함', () => {
    console.log('🎰 슬롯 머신 확률 테스트 시작...\n');
    const result = runSlotProbabilityTest(1000, 100);

    console.log('='.repeat(60));
    console.log('📊 테스트 결과 (1000회 스핀, 베팅: 100점)');
    console.log('='.repeat(60));
    console.log(`\n총 스핀: ${result.total}회`);
    console.log(`총 베팅: ${result.totalBet.toLocaleString()}점`);
    console.log(`총 배당: ${result.totalPayout.toLocaleString()}점`);
    console.log(
      `순 손익: ${result.netResult >= 0 ? '+' : ''}${result.netResult.toLocaleString()}점`
    );
    console.log(`RTP (Return to Player): ${result.rtp}%\n`);

    console.log('-'.repeat(60));
    console.log('🎲 승리 패턴별 통계:');
    console.log('-'.repeat(60));
    console.log(
      `실패 (×0):  ${result.failure.toString().padStart(4)}회 (${result.percentages.failure}%)`
    );
    console.log(`페어 (×2):  ${result.x2.toString().padStart(4)}회 (${result.percentages.x2}%)`);
    console.log(`트리플(×10): ${result.x10.toString().padStart(4)}회 (${result.percentages.x10}%)`);
    console.log(
      `잭팟 (×20): ${result.x20.toString().padStart(4)}회 (${result.percentages.x20}%)\n`
    );

    if (Object.keys(result.tripleDetails).length > 0) {
      console.log('-'.repeat(60));
      console.log('🎯 트리플 상세 (×10):');
      console.log('-'.repeat(60));
      for (const [symbol, count] of Object.entries(result.tripleDetails)) {
        const percentage = ((count / result.x10) * 100).toFixed(1);
        console.log(
          `  ${symbol}${symbol}${symbol}: ${count.toString().padStart(3)}회 (${percentage}%)`
        );
      }
      console.log();
    }

    console.log('='.repeat(60));

    expect(Number(result.rtp)).toBeGreaterThan(0);
    expect(result.total).toBe(1000);
  });

  // 여러 번 실행하여 평균 확률 확인 (선택적)
  if (process.env.RUN_MULTIPLE) {
    it('여러 번 실행하여 평균 확률 확인', () => {
      console.log('\n🔄 여러 번 실행하여 평균 확률 확인 중...\n');
      const iterations = 10;
      const avgStats = {
        failure: 0,
        x2: 0,
        x10: 0,
        x20: 0,
        rtp: 0
      };

      for (let i = 0; i < iterations; i++) {
        const iterResult = runSlotProbabilityTest(1000, 100);
        avgStats.failure += parseFloat(iterResult.percentages.failure);
        avgStats.x2 += parseFloat(iterResult.percentages.x2);
        avgStats.x10 += parseFloat(iterResult.percentages.x10);
        avgStats.x20 += parseFloat(iterResult.percentages.x20);
        avgStats.rtp += parseFloat(iterResult.rtp);
      }

      console.log('='.repeat(60));
      console.log(`📈 ${iterations}회 평균 결과:`);
      console.log('='.repeat(60));
      console.log(`실패 (×0):  ${(avgStats.failure / iterations).toFixed(2)}%`);
      console.log(`페어 (×2):  ${(avgStats.x2 / iterations).toFixed(2)}%`);
      console.log(`트리플(×10): ${(avgStats.x10 / iterations).toFixed(2)}%`);
      console.log(`잭팟 (×20): ${(avgStats.x20 / iterations).toFixed(2)}%`);
      console.log(`평균 RTP: ${(avgStats.rtp / iterations).toFixed(2)}%`);
      console.log('='.repeat(60));

      expect(avgStats.rtp / iterations).toBeGreaterThan(0);
    });
  }
});

// 모듈로 export (테스트 프레임워크 사용 시)
export { runSlotProbabilityTest, spinReels, calcPayout };

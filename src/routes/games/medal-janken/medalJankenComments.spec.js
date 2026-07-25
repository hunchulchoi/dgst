import { describe, expect, it } from 'vitest';
import { buildMedalJankenResultComment } from './medalJankenComments.js';

describe('buildMedalJankenResultComment', () => {
  it.each([
    [10, '10배 당첨'],
    [20, '20배 잭팟']
  ])('%d배 당첨 자동 리플을 만든다', (multiplier, text) => {
    expect(
      buildMedalJankenResultComment(
        { balance: 200, outcome: 'win', multiplier, payout: multiplier * 5 },
        { bet: 5 }
      )
    ).toContain(text);
  });

  it('꽝 자동 리플을 만든다', () => {
    expect(
      buildMedalJankenResultComment(
        { balance: 95, outcome: 'win', multiplier: 0, payout: 0 },
        { bet: 5 }
      )
    ).toContain('룰렛은 꽝');
  });

  it('오링 자동 리플을 만든다', () => {
    expect(
      buildMedalJankenResultComment(
        { balance: 0, outcome: 'lose', multiplier: 0, payout: 0 },
        { bet: 5 }
      )
    ).toContain('오링');
  });

  it('꽝과 오링은 합친 리플 하나로 표시한다', () => {
    expect(
      buildMedalJankenResultComment(
        { balance: 0, outcome: 'win', multiplier: 0, payout: 0 },
        { bet: 5 }
      )
    ).toContain('꽝으로 오링');
  });

  it('일반 결과에는 자동 리플을 만들지 않는다', () => {
    expect(
      buildMedalJankenResultComment(
        { balance: 101, outcome: 'win', multiplier: 2, payout: 2 },
        { bet: 1 }
      )
    ).toBe('');
  });
});

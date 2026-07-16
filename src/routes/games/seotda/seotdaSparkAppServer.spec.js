import { describe, expect, it, vi } from 'vitest';
import { decideSparkIntervention, normalizeSparkDecision } from './seotdaSparkAppServer.js';

describe('seotda Spark Codex app-server decision', () => {
  it('accepts a constrained app-server decision', async () => {
    const requestDecision = vi.fn().mockResolvedValue({
      active: true,
      npcId: 'npc_agwi',
      taunt: '어디서 약을 팔아?',
      reason: '연속 최대 레이즈 감지'
    });
    const result = await decideSparkIntervention(
      {
        balance: 120_000,
        npcChips: { npc_agwi: 3000 },
        sparkTauntCooldown: 0,
        history: { hands: 20, consecutiveMaxRaises: 3 }
      },
      { requestDecision }
    );

    expect(result).toEqual({
      active: true,
      npcId: 'npc_agwi',
      taunt: '어디서 약을 팔아?',
      reason: '연속 최대 레이즈 감지'
    });
    expect(requestDecision).toHaveBeenCalledOnce();
  });

  it('logs app-server failures and safely disables intervention', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await decideSparkIntervention(
      { balance: 50_000, npcChips: {}, sparkTauntCooldown: 0, history: {} },
      { requestDecision: vi.fn().mockRejectedValue(new Error('app-server unavailable')) }
    );

    expect(result).toEqual({
      active: false,
      npcId: null,
      taunt: null,
      reason: 'app-server-failure'
    });
    expect(errorLog).toHaveBeenCalledWith(
      '[seotda spark app-server] decision failed',
      expect.objectContaining({ name: 'Error', message: 'app-server unavailable' })
    );
    errorLog.mockRestore();
  });

  it('rejects unknown NPCs and taunts from model output', () => {
    expect(
      normalizeSparkDecision({ active: true, npcId: 'user', taunt: '임의 대사', reason: 'x' })
    ).toEqual({
      active: false,
      npcId: null,
      taunt: null,
      reason: 'invalid-app-server-output'
    });
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  decideSparkIntervention,
  decideSparkNpcAction,
  normalizeSparkDecision
} from './seotdaSparkAppServer.js';

describe('seotda Spark Codex app-server decision', () => {
  it('accepts a constrained app-server decision', async () => {
    const requestDecision = vi.fn().mockResolvedValue({
      active: true,
      npcId: 'npc_agwi',
      taunt: '어디서 약을 팔아?',
      difficulty: 'challenge',
      npcStyle: 'aggressive',
      directPlay: true,
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
      difficulty: 'challenge',
      npcStyle: 'aggressive',
      directPlay: true,
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
      difficulty: 'balanced',
      npcStyle: null,
      directPlay: false,
      reason: 'app-server-failure'
    });
    expect(errorLog).toHaveBeenCalledWith(
      '[seotda spark app-server] decision failed',
      expect.objectContaining({
        name: 'Error',
        message: 'app-server unavailable',
        operation: 'intervention',
        status: 'failure',
        totalTokens: null,
        elapsedMs: expect.any(Number)
      })
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
      difficulty: 'balanced',
      npcStyle: null,
      directPlay: false,
      reason: 'invalid-app-server-output'
    });
  });

  it('returns a direct NPC action and logs token/time telemetry', async () => {
    const infoLog = vi.spyOn(console, 'info').mockImplementation(() => {});
    const result = await decideSparkNpcAction(
      { npcId: 'npc_goni' },
      {
        requestAction: vi.fn().mockResolvedValue({
          payload: { action: 'raise', raiseScale: 'half', taunt: null, reason: '압박' },
          telemetry: {
            model: 'gpt-5.3-codex-spark',
            elapsedMs: 321,
            turnDurationMs: 280,
            tokenUsage: { inputTokens: 90, outputTokens: 12, totalTokens: 102 }
          }
        })
      }
    );

    expect(result).toMatchObject({ action: 'raise', raiseScale: 'half' });
    expect(infoLog).toHaveBeenCalledWith(
      '[seotda spark app-server] call',
      expect.objectContaining({
        operation: 'npc-action',
        elapsedMs: 321,
        inputTokens: 90,
        outputTokens: 12,
        totalTokens: 102
      })
    );
    infoLog.mockRestore();
  });
});

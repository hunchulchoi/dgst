import { describe, expect, it, vi } from 'vitest';
import {
  decideSparkIntervention,
  decideSparkNpcAction,
  normalizeSparkDecision,
  requestSparkDecisionFromAppServer
} from './seotdaSparkAppServer.js';

describe('seotda Spark Codex app-server decision', () => {
  it('uses the authenticated host bridge in production', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousToken = process.env.CRON_SECRET;
    process.env.NODE_ENV = 'production';
    process.env.CRON_SECRET = 'test-bridge-token';
    process.env.DGST_SPARK_BRIDGE_URL = 'http://bridge.test/v1/seotda/spark';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        decision: {
          active: false,
          npcId: null,
          taunt: null,
          difficulty: 'balanced',
          npcStyle: null,
          directPlay: false,
          reason: 'stable'
        },
        durationMs: 123,
        turnDurationMs: 110,
        tokenUsage: {
          inputTokens: 240,
          cachedInputTokens: 120,
          outputTokens: 30,
          reasoningOutputTokens: 10,
          totalTokens: 270
        }
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const result = await requestSparkDecisionFromAppServer({ balance: 50_000 });
      expect(result).toMatchObject({
        payload: { active: false, directPlay: false, reason: 'stable' },
        telemetry: {
          model: 'gpt-5.3-codex-spark',
          elapsedMs: 123,
          turnDurationMs: 110,
          tokenUsage: {
            inputTokens: 240,
            cachedInputTokens: 120,
            outputTokens: 30,
            reasoningOutputTokens: 10,
            totalTokens: 270
          }
        }
      });
      expect(fetchMock).toHaveBeenCalledWith(
        'http://bridge.test/v1/seotda/spark',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ authorization: 'Bearer test-bridge-token' })
        })
      );
    } finally {
      vi.unstubAllGlobals();
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousToken === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = previousToken;
      delete process.env.DGST_SPARK_BRIDGE_URL;
    }
  });

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
    const bridgeError = Object.assign(new Error('app-server unavailable'), {
      telemetry: {
        model: 'gpt-5.3-codex-spark',
        elapsedMs: 30_000,
        turnDurationMs: 29_800,
        tokenUsage: {
          inputTokens: 180,
          cachedInputTokens: 90,
          outputTokens: 8,
          reasoningOutputTokens: 3,
          totalTokens: 188
        }
      }
    });
    const result = await decideSparkIntervention(
      { balance: 50_000, npcChips: {}, sparkTauntCooldown: 0, history: {} },
      { requestDecision: vi.fn().mockRejectedValue(bridgeError) }
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
        elapsedMs: 30_000,
        turnDurationMs: 29_800,
        inputTokens: 180,
        outputTokens: 8,
        totalTokens: 188
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

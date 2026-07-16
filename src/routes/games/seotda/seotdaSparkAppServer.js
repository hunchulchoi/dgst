import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createInterface } from 'node:readline';
import { NPC_PROFILES, SPARK_TAUNTS } from './seotdaNpc.js';

const DEFAULT_MODEL = 'gpt-5.3-codex-spark';
const DEFAULT_TIMEOUT_MS = 15_000;
const NPC_IDS = new Set(NPC_PROFILES.map((profile) => profile.id));
const TAUNTS = new Set(SPARK_TAUNTS);

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['active', 'npcId', 'taunt', 'reason'],
  properties: {
    active: { type: 'boolean' },
    npcId: { anyOf: [{ enum: [...NPC_IDS] }, { type: 'null' }] },
    taunt: { anyOf: [{ enum: SPARK_TAUNTS }, { type: 'null' }] },
    reason: { type: 'string', maxLength: 160 }
  }
};

/** @param {unknown} raw */
export function normalizeSparkDecision(raw) {
  if (!raw || typeof raw !== 'object') {
    return { active: false, npcId: null, taunt: null, reason: 'invalid-app-server-output' };
  }
  const value = /** @type {Record<string, unknown>} */ (raw);
  if (!value.active) {
    return {
      active: false,
      npcId: null,
      taunt: null,
      reason: String(value.reason ?? 'app-server-no-intervention').slice(0, 160)
    };
  }
  if (
    !NPC_IDS.has(String(value.npcId)) ||
    (value.taunt != null && !TAUNTS.has(String(value.taunt)))
  ) {
    return { active: false, npcId: null, taunt: null, reason: 'invalid-app-server-output' };
  }
  return {
    active: true,
    npcId: String(value.npcId),
    taunt: value.taunt == null ? null : String(value.taunt),
    reason: String(value.reason ?? 'app-server-intervention').slice(0, 160)
  };
}

/** @param {Record<string, unknown>} context */
function decisionPrompt(context) {
  return [
    '섯다 게임의 Spark 밸런스 개입 여부를 판단하라.',
    '확률 추첨을 하지 말고 제공된 최근 실제 플레이 통계와 경제 상태만 판단 근거로 사용하라.',
    '목표: 10만점 미만 유저는 100판 기준 +3~5% 재미 구간, 10만점 이상은 +0.5~1% 완만한 구간.',
    'Spark는 연속 최대 레이즈, 연속 다이, 과도한 장기 수익, NPC 자금 편중을 완화하는 보조 수단이다.',
    '유저 히든 패는 제공되지 않으며 추정하거나 요구하지 마라.',
    '개입이 필요하면 NPC 한 명과 허용된 대사 하나 또는 null을 고른다. 쿨다운이 남으면 taunt는 null이다.',
    `게임 상태: ${JSON.stringify(context)}`
  ].join('\n');
}

/**
 * Codex app-server JSONL 프로토콜로 단일 판단을 요청한다.
 * @param {Record<string, unknown>} context
 * @param {{ spawnImpl?: typeof spawn; timeoutMs?: number; model?: string }} [options]
 */
export async function requestSparkDecisionFromAppServer(context, options = {}) {
  const spawnImpl = options.spawnImpl ?? spawn;
  const timeoutMs = Math.max(
    1000,
    Number(options.timeoutMs ?? process.env.DGST_SPARK_CODEX_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS
  );
  const model = options.model ?? process.env.DGST_SPARK_CODEX_MODEL ?? DEFAULT_MODEL;
  const binary = process.env.CODEX_APP_SERVER_BIN ?? 'codex';
  const child = spawnImpl(binary, ['app-server', '--listen', 'stdio://'], {
    cwd: tmpdir(),
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  const lines = createInterface({ input: child.stdout });
  /** @type {Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>} */
  const pending = new Map();
  let requestId = 0;
  let finalText = '';
  let completed = false;
  /** @type {Error | null} */
  let fatalError = null;
  /** @type {(value?: unknown) => void} */
  let resolveTurn;
  const turnCompleted = new Promise((resolve) => {
    resolveTurn = resolve;
  });

  /** @param {Error} error */
  const fail = (error) => {
    if (completed) return;
    completed = true;
    fatalError = error;
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
    resolveTurn();
  };
  const timer = setTimeout(
    () => fail(new Error(`app-server timeout after ${timeoutMs}ms`)),
    timeoutMs
  );

  lines.on('line', (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      fail(new Error('app-server returned invalid JSONL'));
      return;
    }
    if (Number.isInteger(message.id) && pending.has(message.id)) {
      const waiter = pending.get(message.id);
      pending.delete(message.id);
      if (message.error)
        waiter?.reject(new Error(message.error.message ?? 'app-server request failed'));
      else waiter?.resolve(message.result);
      return;
    }
    if (message.method === 'item/completed' && message.params?.item?.type === 'agentMessage') {
      finalText = String(message.params.item.text ?? '');
    }
    if (message.method === 'turn/completed') resolveTurn();
    if (message.method === 'error')
      fail(new Error(message.params?.error?.message ?? 'app-server error'));
  });
  child.once('error', (error) => fail(error));
  child.once('exit', (code) => {
    if (!completed) fail(new Error(`app-server exited before completion (${code ?? 'signal'})`));
  });

  /** @param {Record<string, unknown>} message */
  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
  /** @param {string} method @param {Record<string, unknown>} params */
  const request = (method, params) => {
    const id = requestId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      send({ method, id, params });
    });
  };

  try {
    await request('initialize', {
      clientInfo: { name: 'dgst_seotda', title: 'DGST Seotda Spark', version: '1.0.0' }
    });
    send({ method: 'initialized', params: {} });
    const started = await request('thread/start', {
      model,
      cwd: tmpdir(),
      sandbox: 'read-only',
      approvalPolicy: 'never',
      ephemeral: true,
      developerInstructions:
        '게임 밸런스 판단만 수행한다. 도구를 호출하거나 파일·네트워크에 접근하지 말고 최종 JSON만 반환한다.'
    });
    const threadId = started?.thread?.id;
    if (!threadId) throw new Error('app-server did not return a thread id');
    await request('turn/start', {
      threadId,
      input: [{ type: 'text', text: decisionPrompt(context) }],
      model,
      effort: 'low',
      approvalPolicy: 'never',
      outputSchema: OUTPUT_SCHEMA
    });
    await turnCompleted;
    if (fatalError) throw fatalError;
    if (!finalText) throw new Error('app-server returned no final agent message');
    return JSON.parse(finalText);
  } finally {
    completed = true;
    clearTimeout(timer);
    lines.close();
    child.kill();
  }
}

/**
 * @param {Record<string, unknown>} context
 * @param {{ requestDecision?: (context: Record<string, unknown>) => Promise<unknown> }} [options]
 */
export async function decideSparkIntervention(context, options = {}) {
  const requestDecision = options.requestDecision ?? requestSparkDecisionFromAppServer;
  try {
    const decision = normalizeSparkDecision(await requestDecision(context));
    if (decision.reason === 'invalid-app-server-output') {
      console.error('[seotda spark app-server] decision failed', {
        name: 'InvalidOutput',
        message: 'invalid app-server decision payload'
      });
    }
    if (Number(context.sparkTauntCooldown ?? 0) > 0) decision.taunt = null;
    return decision;
  } catch (error) {
    console.error('[seotda spark app-server] decision failed', {
      name: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : String(error)
    });
    return { active: false, npcId: null, taunt: null, reason: 'app-server-failure' };
  }
}

import { spawn } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { createInterface } from 'node:readline';
import { NPC_PROFILES, SPARK_TAUNTS } from './seotdaNpc.js';

const DEFAULT_MODEL = 'gpt-5.3-codex-spark';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_BRIDGE_SOCKET = '/run/dgst-spark/seotda-codex-bridge.sock';
const NPC_IDS = new Set(NPC_PROFILES.map((profile) => profile.id));
const TAUNTS = new Set(SPARK_TAUNTS);
const DIFFICULTIES = new Set(['give-room', 'balanced', 'challenge']);
const NPC_STYLES = new Set(['loose-caller', 'cautious', 'aggressive']);

/**
 * @typedef {{
 *   inputTokens?: number;
 *   cachedInputTokens?: number;
 *   outputTokens?: number;
 *   reasoningOutputTokens?: number;
 *   totalTokens?: number;
 * }} SparkTokenUsage
 */

/**
 * @typedef {{
 *   model: string;
 *   elapsedMs: number;
 *   turnDurationMs: number | null;
 *   tokenUsage: SparkTokenUsage | null;
 * }} SparkTelemetry
 */

const DECISION_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['active', 'npcId', 'taunt', 'difficulty', 'npcStyle', 'directPlay', 'reason'],
  properties: {
    active: { type: 'boolean' },
    npcId: { anyOf: [{ enum: [...NPC_IDS] }, { type: 'null' }] },
    taunt: { anyOf: [{ enum: SPARK_TAUNTS }, { type: 'null' }] },
    difficulty: { enum: [...DIFFICULTIES] },
    npcStyle: { anyOf: [{ enum: [...NPC_STYLES] }, { type: 'null' }] },
    directPlay: { type: 'boolean' },
    reason: { type: 'string', maxLength: 160 }
  }
};

const ACTION_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'raiseScale', 'taunt', 'reason'],
  properties: {
    action: { enum: ['die', 'call', 'raise'] },
    raiseScale: { anyOf: [{ enum: ['min', 'half', 'max'] }, { type: 'null' }] },
    taunt: { anyOf: [{ enum: SPARK_TAUNTS }, { type: 'null' }] },
    reason: { type: 'string', maxLength: 160 }
  }
};

/** @param {string} reason */
function inactiveDecision(reason) {
  return {
    active: false,
    npcId: null,
    taunt: null,
    difficulty: 'balanced',
    npcStyle: null,
    directPlay: false,
    reason
  };
}

/** @param {unknown} raw */
export function normalizeSparkDecision(raw) {
  if (!raw || typeof raw !== 'object') {
    return inactiveDecision('invalid-app-server-output');
  }
  const value = /** @type {Record<string, unknown>} */ (raw);
  if (!value.active) {
    return inactiveDecision(String(value.reason ?? 'app-server-no-intervention').slice(0, 160));
  }
  if (
    !NPC_IDS.has(String(value.npcId)) ||
    (value.taunt != null && !TAUNTS.has(String(value.taunt))) ||
    !DIFFICULTIES.has(String(value.difficulty ?? 'balanced')) ||
    (value.npcStyle != null && !NPC_STYLES.has(String(value.npcStyle)))
  ) {
    return inactiveDecision('invalid-app-server-output');
  }
  return {
    active: true,
    npcId: String(value.npcId),
    taunt: value.taunt == null ? null : String(value.taunt),
    difficulty: String(value.difficulty ?? 'balanced'),
    npcStyle: value.npcStyle == null ? null : String(value.npcStyle),
    directPlay: !!value.directPlay,
    reason: String(value.reason ?? 'app-server-intervention').slice(0, 160)
  };
}

/** @param {unknown} raw */
export function normalizeSparkNpcAction(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const value = /** @type {Record<string, unknown>} */ (raw);
  if (!['die', 'call', 'raise'].includes(String(value.action))) return null;
  if (value.raiseScale != null && !['min', 'half', 'max'].includes(String(value.raiseScale))) {
    return null;
  }
  if (value.taunt != null && !TAUNTS.has(String(value.taunt))) return null;
  return {
    action: String(value.action),
    raiseScale: value.action === 'raise' ? String(value.raiseScale ?? 'min') : null,
    taunt: value.taunt == null ? null : String(value.taunt),
    reason: String(value.reason ?? 'app-server-direct-play').slice(0, 160)
  };
}

/** @param {Record<string, unknown>} context */
function decisionPrompt(context) {
  return [
    '섯다 게임의 Spark 밸런스 개입 여부를 판단하라.',
    '확률 추첨을 하지 말고 제공된 최근 실제 플레이 통계와 경제 상태만 판단 근거로 사용하라.',
    '목표: 10만점 미만 유저는 100판 기준 +3~5% 재미 구간, 10만점 이상은 +0.5~1% 완만한 구간.',
    'Spark는 연속 최대 레이즈, 연속 다이, 과도한 장기 수익, NPC 자금 편중을 완화하는 보조 수단이다.',
    '재미 흐름에 따라 give-room, balanced, challenge 중 난이도와 지정 NPC의 임시 성향을 고른다.',
    '직접 플레이가 재미에 필요할 때만 directPlay를 true로 한다. 연속 Spark 판이면 개입을 쉬어라.',
    '유저 히든 패는 제공되지 않으며 추정하거나 요구하지 마라.',
    '개입이 필요하면 NPC 한 명과 허용된 대사 하나 또는 null을 고른다. 쿨다운이 남으면 taunt는 null이다.',
    `게임 상태: ${JSON.stringify(context)}`
  ].join('\n');
}

/** @param {Record<string, unknown>} context */
function actionPrompt(context) {
  return [
    '너는 섯다 게임의 Spark이며 지정된 NPC 한 명의 이번 행동을 직접 결정한다.',
    'NPC 자기 패와 공개 베팅 정보만 사용한다. 유저 히든 패는 제공되지 않으며 추정하지 마라.',
    '재미가 우선이다. 유저가 연속으로 잃거나 다이했다면 숨통을 주고, 연속 최대 레이즈나 과수익이면 합리적으로 응징한다.',
    'raiseScale은 raise일 때만 min, half, max 중 하나를 고른다. 무지성 max는 피한다.',
    `현재 상태: ${JSON.stringify(context)}`
  ].join('\n');
}

/**
 * Codex app-server JSONL 프로토콜로 단일 JSON 판단을 요청한다.
 * @param {string} prompt
 * @param {Record<string, unknown>} outputSchema
 * @param {{ spawnImpl?: typeof spawn; timeoutMs?: number; model?: string }} [options]
 */
async function requestCodexJson(prompt, outputSchema, options = {}) {
  const startedAt = Date.now();
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
  /** @type {SparkTokenUsage | null} */
  let tokenUsage = null;
  let turnDurationMs = null;
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
    if (message.method === 'thread/tokenUsage/updated') {
      tokenUsage = message.params?.tokenUsage?.last ?? tokenUsage;
    }
    if (message.method === 'turn/completed') {
      turnDurationMs = message.params?.turn?.durationMs ?? null;
      resolveTurn();
    }
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
      input: [{ type: 'text', text: prompt }],
      model,
      effort: 'low',
      approvalPolicy: 'never',
      outputSchema
    });
    await turnCompleted;
    if (fatalError) throw fatalError;
    if (!finalText) throw new Error('app-server returned no final agent message');
    return {
      payload: JSON.parse(finalText),
      telemetry: {
        model,
        elapsedMs: Date.now() - startedAt,
        turnDurationMs,
        tokenUsage
      }
    };
  } finally {
    completed = true;
    clearTimeout(timer);
    lines.close();
    child.kill();
  }
}

/**
 * @param {Record<string, unknown>} context
 * @param {{ spawnImpl?: typeof spawn; timeoutMs?: number; model?: string }} [options]
 */
export function requestSparkDecisionFromAppServer(context, options = {}) {
  if (
    !options.spawnImpl &&
    (process.env.NODE_ENV === 'production' || process.env.DGST_SPARK_BRIDGE_URL)
  ) {
    return requestSparkDecisionFromBridge(context, options);
  }
  return requestCodexJson(decisionPrompt(context), DECISION_OUTPUT_SCHEMA, options);
}

/**
 * 운영 컨테이너에서 Docker 게이트웨이의 호스트 Codex 브리지로 판단을 요청한다.
 * @param {Record<string, unknown>} context
 * @param {{ timeoutMs?: number; model?: string }} [options]
 */
async function requestSparkDecisionFromBridge(context, options = {}) {
  const startedAt = Date.now();
  const timeoutMs = Math.max(
    1000,
    Number(options.timeoutMs ?? process.env.DGST_SPARK_CODEX_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS
  );
  const model = options.model ?? process.env.DGST_SPARK_CODEX_MODEL ?? DEFAULT_MODEL;
  const token = process.env.DGST_SPARK_BRIDGE_TOKEN ?? process.env.CRON_SECRET;
  if (!token) throw new Error('Spark bridge token is unavailable');
  const bridgeUrl = process.env.DGST_SPARK_BRIDGE_URL;
  if (bridgeUrl) {
    const response = await fetch(bridgeUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ context }),
      signal: AbortSignal.timeout(timeoutMs + 10_000)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw bridgeError(body, response.status, model, startedAt);
    }
    return bridgeResult(body, model, startedAt);
  }

  const body = await requestBridgeSocket(
    process.env.DGST_SPARK_BRIDGE_SOCKET ?? DEFAULT_BRIDGE_SOCKET,
    token,
    context,
    timeoutMs + 10_000,
    model,
    startedAt
  );
  return bridgeResult(body, model, startedAt);
}

/** @param {Record<string, any>} body @param {string} model @param {number} startedAt */
function bridgeResult(body, model, startedAt) {
  return {
    payload: body.decision,
    telemetry: bridgeTelemetry(body, model, startedAt)
  };
}

/** @param {Record<string, any>} body @param {string} model @param {number} startedAt */
function bridgeTelemetry(body, model, startedAt) {
  return {
    model,
    elapsedMs: Number(body.durationMs ?? Date.now() - startedAt),
    turnDurationMs: Number(body.turnDurationMs ?? 0) || null,
    tokenUsage: body.tokenUsage ?? null
  };
}

/**
 * @param {Record<string, any>} body
 * @param {number} status
 * @param {string} model
 * @param {number} startedAt
 */
function bridgeError(body, status, model, startedAt) {
  const error = /** @type {Error & { telemetry?: SparkTelemetry }} */ (
    new Error(`Spark bridge ${status}: ${String(body?.error ?? 'request failed')}`)
  );
  error.telemetry = bridgeTelemetry(body, model, startedAt);
  return error;
}

/**
 * @param {string} socketPath
 * @param {string} token
 * @param {Record<string, unknown>} context
 * @param {number} timeoutMs
 * @param {string} model
 * @param {number} startedAt
 */
function requestBridgeSocket(socketPath, token, context, timeoutMs, model, startedAt) {
  const payload = JSON.stringify({ context });
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      socketPath,
      path: '/v1/seotda/spark',
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload)
      },
      timeout: timeoutMs
    });
    /** @type {Buffer[]} */
    const chunks = [];
    request.on('response', (response) => {
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        let body;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          reject(new Error('Spark bridge returned invalid JSON'));
          return;
        }
        if ((response.statusCode ?? 500) >= 400) {
          reject(bridgeError(body, response.statusCode ?? 500, model, startedAt));
          return;
        }
        resolve(body);
      });
    });
    request.on('timeout', () => request.destroy(new Error('Spark bridge timeout')));
    request.on('error', reject);
    request.end(payload);
  });
}

/**
 * @param {Record<string, unknown>} context
 * @param {{ spawnImpl?: typeof spawn; timeoutMs?: number; model?: string }} [options]
 */
export function requestSparkNpcActionFromAppServer(context, options = {}) {
  return requestCodexJson(actionPrompt(context), ACTION_OUTPUT_SCHEMA, options);
}

/**
 * @param {unknown} rawResult
 * @returns {{ payload: unknown; telemetry: SparkTelemetry | null }}
 */
function unwrapAppServerResult(rawResult) {
  if (rawResult && typeof rawResult === 'object' && 'payload' in rawResult) {
    const wrapped = /** @type {{ payload: unknown; telemetry?: SparkTelemetry | null }} */ (
      rawResult
    );
    return { payload: wrapped.payload, telemetry: wrapped.telemetry ?? null };
  }
  return { payload: rawResult, telemetry: null };
}

/**
 * @param {Record<string, unknown>} context
 * @param {{ requestDecision?: (context: Record<string, unknown>) => Promise<unknown> }} [options]
 */
export async function decideSparkIntervention(context, options = {}) {
  const requestDecision = options.requestDecision ?? requestSparkDecisionFromAppServer;
  const startedAt = Date.now();
  try {
    const rawResult = await requestDecision(context);
    const wrapped = unwrapAppServerResult(rawResult);
    const decision = normalizeSparkDecision(wrapped.payload);
    if (decision.reason === 'invalid-app-server-output') {
      console.error('[seotda spark app-server] decision failed', {
        name: 'InvalidOutput',
        message: 'invalid app-server decision payload',
        operation: 'intervention',
        status: 'failure',
        elapsedMs: Date.now() - startedAt
      });
    }
    if (Number(context.sparkTauntCooldown ?? 0) > 0) decision.taunt = null;
    console.info('[seotda spark app-server] call', {
      operation: 'intervention',
      status: 'success',
      model: wrapped.telemetry?.model ?? process.env.DGST_SPARK_CODEX_MODEL ?? DEFAULT_MODEL,
      elapsedMs: wrapped.telemetry?.elapsedMs ?? Date.now() - startedAt,
      turnDurationMs: wrapped.telemetry?.turnDurationMs ?? null,
      inputTokens: wrapped.telemetry?.tokenUsage?.inputTokens ?? null,
      cachedInputTokens: wrapped.telemetry?.tokenUsage?.cachedInputTokens ?? null,
      outputTokens: wrapped.telemetry?.tokenUsage?.outputTokens ?? null,
      reasoningOutputTokens: wrapped.telemetry?.tokenUsage?.reasoningOutputTokens ?? null,
      totalTokens: wrapped.telemetry?.tokenUsage?.totalTokens ?? null,
      active: decision.active,
      npcId: decision.npcId,
      difficulty: decision.difficulty,
      npcStyle: decision.npcStyle,
      directPlay: decision.directPlay
    });
    return decision;
  } catch (error) {
    const telemetry =
      error && typeof error === 'object' && 'telemetry' in error
        ? /** @type {{ telemetry?: SparkTelemetry }} */ (error).telemetry
        : null;
    console.error('[seotda spark app-server] decision failed', {
      name: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : String(error),
      operation: 'intervention',
      status: 'failure',
      model: telemetry?.model ?? process.env.DGST_SPARK_CODEX_MODEL ?? DEFAULT_MODEL,
      elapsedMs: telemetry?.elapsedMs ?? Date.now() - startedAt,
      turnDurationMs: telemetry?.turnDurationMs ?? null,
      inputTokens: telemetry?.tokenUsage?.inputTokens ?? null,
      cachedInputTokens: telemetry?.tokenUsage?.cachedInputTokens ?? null,
      outputTokens: telemetry?.tokenUsage?.outputTokens ?? null,
      reasoningOutputTokens: telemetry?.tokenUsage?.reasoningOutputTokens ?? null,
      totalTokens: telemetry?.tokenUsage?.totalTokens ?? null
    });
    return inactiveDecision('app-server-failure');
  }
}

/**
 * @param {Record<string, unknown>} context
 * @param {{ requestAction?: (context: Record<string, unknown>) => Promise<unknown> }} [options]
 */
export async function decideSparkNpcAction(context, options = {}) {
  const requestAction = options.requestAction ?? requestSparkNpcActionFromAppServer;
  const startedAt = Date.now();
  try {
    const rawResult = await requestAction(context);
    const wrapped = unwrapAppServerResult(rawResult);
    const action = normalizeSparkNpcAction(wrapped.payload);
    if (!action) throw new Error('invalid app-server NPC action payload');
    console.info('[seotda spark app-server] call', {
      operation: 'npc-action',
      status: 'success',
      model: wrapped.telemetry?.model ?? process.env.DGST_SPARK_CODEX_MODEL ?? DEFAULT_MODEL,
      elapsedMs: wrapped.telemetry?.elapsedMs ?? Date.now() - startedAt,
      turnDurationMs: wrapped.telemetry?.turnDurationMs ?? null,
      inputTokens: wrapped.telemetry?.tokenUsage?.inputTokens ?? null,
      cachedInputTokens: wrapped.telemetry?.tokenUsage?.cachedInputTokens ?? null,
      outputTokens: wrapped.telemetry?.tokenUsage?.outputTokens ?? null,
      reasoningOutputTokens: wrapped.telemetry?.tokenUsage?.reasoningOutputTokens ?? null,
      totalTokens: wrapped.telemetry?.tokenUsage?.totalTokens ?? null,
      npcId: String(context.npcId ?? ''),
      action: action.action,
      raiseScale: action.raiseScale
    });
    return action;
  } catch (error) {
    console.error('[seotda spark app-server] action failed', {
      name: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : String(error),
      operation: 'npc-action',
      status: 'failure',
      model: process.env.DGST_SPARK_CODEX_MODEL ?? DEFAULT_MODEL,
      elapsedMs: Date.now() - startedAt,
      turnDurationMs: null,
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      reasoningOutputTokens: null,
      totalTokens: null,
      npcId: String(context.npcId ?? '')
    });
    return null;
  }
}

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PLACEHOLDER_VALUES = new Set([
  '',
  'password',
  'pass',
  'changeme',
  'change-me',
  'example',
  'secret',
  'token',
  'dummy',
  'placeholder',
  'localhost'
]);

const SECRET_ENV_NAMES = new Set([
  'AUTH_SECRET',
  'NEXTAUTH_SECRET',
  'GOOGLE_CLIENT_SECRET',
  'KAKAO_CLIENT_SECRET',
  'GOOGLE_RECAPTCHA_SECRET_KEY',
  'DATABASE_URL',
  'MONGODB_CONNECTION_STRING',
  'REDIS_URL',
  'POSTGRES_PASSWORD',
  'MONGO_INITDB_ROOT_PASSWORD',
  'REDIS_PASSWORD'
]);

const DB_URL_PATTERN = /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|redis(?:s)?)?:\/\/[^\s'"`<>]+/gi;
const ENV_ASSIGNMENT_PATTERN =
  /^\s*(?:[-\s]*)?([A-Z][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|KEY|URL)[A-Z0-9_]*)\s*[:=]\s*["']?([^"'\s]+)?/gm;

/**
 * @typedef {{ filePath: string; line: number; rule: string; message: string }} SecretFinding
 */

/** @param {string} value @returns {boolean} */
function isPlaceholderValue(value) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/^['"]|['"]$/g, '');
  const lower = normalized.toLowerCase();

  if (/^(?:mongodb(?:\+srv)?|postgres(?:ql)?|redis(?:s)?)?:\/\//i.test(normalized)) {
    return !hasRealUrlPassword(normalized);
  }

  return (
    PLACEHOLDER_VALUES.has(lower) ||
    lower.includes('...') ||
    lower.includes('<') ||
    lower.includes('>') ||
    lower.startsWith('${') ||
    lower.startsWith('$') ||
    lower.includes('env(')
  );
}

/**
 * @param {string} text
 * @param {number} index
 */
function lineNumberAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

/** @param {string} rawUrl @returns {boolean} */
function hasRealUrlPassword(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return Boolean(parsed.password) && !isPlaceholderValue(parsed.password);
  } catch {
    const credentialMatch = rawUrl.match(/:\/\/([^:@\s/]+):([^@\s/]+)@/);
    if (!credentialMatch?.[2]) return false;
    return !isPlaceholderValue(credentialMatch[2]);
  }
}

/**
 * @param {string} filePath
 * @param {string} text
 * @returns {SecretFinding[]}
 */
export function scanTextForSecrets(filePath, text) {
  /** @type {SecretFinding[]} */
  const findings = [];

  const privateKeyMatch = text.match(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
  if (privateKeyMatch?.index != null) {
    findings.push({
      filePath,
      line: lineNumberAt(text, privateKeyMatch.index),
      rule: 'private-key',
      message: 'Private key block must not be committed'
    });
  }

  for (const match of text.matchAll(DB_URL_PATTERN)) {
    const rawUrl = match[0];
    if (!hasRealUrlPassword(rawUrl)) continue;

    findings.push({
      filePath,
      line: lineNumberAt(text, match.index ?? 0),
      rule: 'credentialed-db-url',
      message: 'Database URL contains inline credentials'
    });
  }

  for (const match of text.matchAll(ENV_ASSIGNMENT_PATTERN)) {
    const [, name, value = ''] = match;
    if (!SECRET_ENV_NAMES.has(name)) continue;
    if (isPlaceholderValue(value)) continue;

    findings.push({
      filePath,
      line: lineNumberAt(text, match.index ?? 0),
      rule: 'hardcoded-secret-env',
      message: `${name} appears to be hardcoded`
    });
  }

  return findings;
}

function trackedFiles() {
  const output = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
  return output.split('\0').filter(Boolean);
}

/** @param {Buffer} buffer */
function isLikelyText(buffer) {
  if (buffer.includes(0)) return false;
  return true;
}

export function scanTrackedFiles() {
  /** @type {SecretFinding[]} */
  const findings = [];

  for (const filePath of trackedFiles()) {
    if (!existsSync(filePath)) continue;

    const buffer = readFileSync(filePath);
    if (!isLikelyText(buffer)) continue;

    findings.push(...scanTextForSecrets(filePath, buffer.toString('utf8')));
  }

  return findings;
}

export function main() {
  const findings = scanTrackedFiles();
  if (findings.length === 0) {
    console.log('Secret scan passed');
    return;
  }

  console.error('Secret scan failed:');
  for (const finding of findings) {
    console.error(`- ${finding.filePath}:${finding.line} [${finding.rule}] ${finding.message}`);
  }
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

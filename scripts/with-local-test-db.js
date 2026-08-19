import { existsSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const FARM_POSTGRES_HOST = process.env.LOCAL_TEST_POSTGRES_HOST || '127.0.0.1';
const FARM_POSTGRES_PORT = process.env.LOCAL_TEST_POSTGRES_PORT || '55432';
const FARM_POSTGRES_CONTAINER = process.env.LOCAL_TEST_POSTGRES_CONTAINER || 'dgst_farm_postgres';
const FARM_COMPOSE_FILE =
  process.env.LOCAL_TEST_FARM_COMPOSE_FILE ||
  fileURLToPath(new URL('../conf/docker-compose.yml', import.meta.url));
const DATABASE_URL_KEY = 'DATABASE' + '_URL';

function parseEnvFile(path) {
  const env = {};
  const content = readFileSync(path, 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }

  return env;
}

function useFarmPostgres(databaseUrl) {
  const url = new URL(databaseUrl);
  url.hostname = FARM_POSTGRES_HOST;
  url.port = FARM_POSTGRES_PORT;
  return url.toString();
}

function runDocker(args, options = {}) {
  return spawnSync('docker', args, {
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
    env: options.env || process.env
  });
}

function getFarmPostgresState() {
  const result = runDocker([
    'inspect',
    FARM_POSTGRES_CONTAINER,
    '--format',
    '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}'
  ]);

  if (result.status !== 0) return null;

  const [status, health] = result.stdout.trim().split(/\s+/);
  return { status, health: health || '' };
}

function waitForFarmPostgres() {
  const deadline = Date.now() + 60_000;
  const waitBuffer = new SharedArrayBuffer(4);
  const waitArray = new Int32Array(waitBuffer);

  while (Date.now() < deadline) {
    const state = getFarmPostgresState();
    if (state?.status === 'running' && (!state.health || state.health === 'healthy')) return;
    Atomics.wait(waitArray, 0, 0, 1000);
  }

  throw new Error(`${FARM_POSTGRES_CONTAINER} did not become healthy within 60s`);
}

function ensureFarmPostgres(fileEnv) {
  const dockerVersion = runDocker(['version', '--format', '{{.Server.Version}}']);
  if (dockerVersion.status !== 0) {
    throw new Error(
      `Docker is required to start ${FARM_POSTGRES_CONTAINER}: ${dockerVersion.stderr.trim()}`
    );
  }

  const state = getFarmPostgresState();
  if (state?.status === 'running' && (!state.health || state.health === 'healthy')) return;

  const password = process.env.POSTGRES_PASSWORD || fileEnv.POSTGRES_PASSWORD;
  if (!password) {
    throw new Error('POSTGRES_PASSWORD is required to start dgst_farm_postgres');
  }

  const result = runDocker(
    ['compose', '-f', FARM_COMPOSE_FILE, 'up', '-d', FARM_POSTGRES_CONTAINER],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        ...fileEnv,
        POSTGRES_PASSWORD: password
      }
    }
  );

  if (result.status !== 0) {
    throw new Error(`Failed to start ${FARM_POSTGRES_CONTAINER}`);
  }

  waitForFarmPostgres();
}

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error('Usage: node scripts/with-local-test-db.js <command> [...args]');
  process.exit(1);
}

const fileEnv = existsSync('.env') ? parseEnvFile('.env') : {};
const databaseUrl = process.env.DATABASE_URL || fileEnv.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL is required for local tests');
  process.exit(1);
}

try {
  ensureFarmPostgres(fileEnv);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const child = spawn(command, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    ...fileEnv,
    [DATABASE_URL_KEY]: useFarmPostgres(databaseUrl)
  }
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

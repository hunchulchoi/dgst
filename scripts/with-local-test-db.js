import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const FARM_POSTGRES_HOST = process.env.LOCAL_TEST_POSTGRES_HOST || '127.0.0.1';
const FARM_POSTGRES_PORT = process.env.LOCAL_TEST_POSTGRES_PORT || '55432';

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

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error('Usage: node scripts/with-local-test-db.js <command> [...args]');
  process.exit(1);
}

const fileEnv = parseEnvFile('.env');
const databaseUrl = process.env.DATABASE_URL || fileEnv.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL is required for local tests');
  process.exit(1);
}

const child = spawn(command, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    ...fileEnv,
    DATABASE_URL: useFarmPostgres(databaseUrl)
  }
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

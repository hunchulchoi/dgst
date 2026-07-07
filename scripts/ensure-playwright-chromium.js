import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const playwrightCorePackage = require.resolve('playwright-core/package.json');
const browsers = JSON.parse(
  readFileSync(path.join(path.dirname(playwrightCorePackage), 'browsers.json'), 'utf8')
);

const chromium = browsers.browsers.find((browser) => browser.name === 'chromium');

if (!chromium?.revision) {
  throw new Error('Unable to determine Playwright Chromium revision');
}

const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
const cacheRoot =
  browsersPath && browsersPath !== '0'
    ? browsersPath
    : path.join(os.homedir(), '.cache', 'ms-playwright');
const chromiumPath = path.join(cacheRoot, `chromium-${chromium.revision}`);
const headlessShellPath = path.join(cacheRoot, `chromium_headless_shell-${chromium.revision}`);

if (existsSync(chromiumPath) && existsSync(headlessShellPath)) {
  process.exit(0);
}

const result = spawnSync('npx', ['playwright', 'install', 'chromium'], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

process.exit(result.status ?? 1);

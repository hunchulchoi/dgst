// Applies patches/ with patch-package. The production image installs with
// `npm ci --omit dev`, where patch-package is absent; patched packages are
// bundled into the build there, so skipping is safe.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

try {
  require.resolve('patch-package/package.json');
} catch {
  console.log('patch-package not installed; skipping patches (production install).');
  process.exit(0);
}

const result = spawnSync('npx', ['--no-install', 'patch-package', '--error-on-fail'], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});
process.exit(result.status ?? 1);

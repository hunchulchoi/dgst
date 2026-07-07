/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  webServer: {
    command:
      'set -a; . ./.env; set +a; PLAYWRIGHT_SMOKE=1 npm run build && PLAYWRIGHT_SMOKE=1 npm run preview -- --host 127.0.0.1',
    port: 4173
  },
  testDir: 'tests',
  testMatch: /.+\.pw\.[jt]s/
};

export default config;

/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  reporter: [
    ['list'],
    [
      'html',
      {
        outputFolder: 'playwright-report',
        open: process.env.PLAYWRIGHT_HTML_OPEN === 'always' ? 'always' : 'never'
      }
    ]
  ],
  use: { baseURL: 'http://127.0.0.1:4173' },
  webServer: [
    {
      command:
        'PLAYWRIGHT_SMOKE=1 npm run build && PLAYWRIGHT_SMOKE=1 npm run preview -- --host 127.0.0.1',
      port: 4173
    },
    {
      // Dev server with the local game smoke session (disabled under NODE_ENV=production),
      // for tests that need a logged-in game user. Use `test.use({ baseURL: SMOKE_SESSION_URL })`.
      command: 'DGST_LOCAL_GAME_SMOKE=1 npx vite dev --host 127.0.0.1 --port 5174 --strictPort',
      url: 'http://127.0.0.1:5174/games/block-blast',
      timeout: 120_000
    }
  ],
  testDir: 'tests',
  testMatch: /.+\.pw\.[jt]s/
};

export default config;

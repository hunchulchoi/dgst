/**
 * vite build / Docker image build 시 DB 연결 스킵.
 * 런타임(node .)에서는 false — 정상 연결.
 * @returns {boolean}
 */
export function isDbConnectSkipped() {
  return process.env.SKIP_DB_CONNECT === 'true' || process.env.npm_lifecycle_event === 'build';
}

#!/usr/bin/env bash
# 장시호봇 CLI 실행 래퍼 (로컬 서버 전용, crontab에서 호출).
#
#   scripts/bot-cron.sh tick            # 크론: 10분마다
#   scripts/bot-cron.sh post --dry-run  # 수동 테스트
#
# - .env 의 Infisical 머신 자격증명으로 로그인해 prod 시크릿을 주입한다.
# - CLAUDE_API_KEY 가 prod 에 없으면 dev 에서 가져온다.
# - DB는 docker 로 매핑된 dgst_postgres 포트 주소(이 머신)로 붙는다.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.nvm/versions/node/v22.23.4/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

PROJECT_ID="$(sed -n 's/.*"workspaceId": *"\([^"]*\)".*/\1/p' .infisical.json)"

read_env() { sed -n "s/^$1=//p" .env | head -1 | sed -e 's/^["'\'']//' -e 's/["'\'']$//'; }
INFISICAL_DOMAIN="$(read_env INFISICAL_DOMAIN)"
CLIENT_ID="$(read_env INFISICAL_CLIENT_ID)"
CLIENT_SECRET="$(read_env INFISICAL_CLIENT_SECRET)"
SECRET_ENV="$(read_env INFISICAL_SECRET_ENV)"
SECRET_ENV="${SECRET_ENV:-prod}"

INFISICAL_TOKEN="$(infisical login --method=universal-auth \
  --client-id="$CLIENT_ID" --client-secret="$CLIENT_SECRET" \
  --domain="$INFISICAL_DOMAIN" --plain --silent)"
export INFISICAL_TOKEN
unset CLIENT_SECRET

inf() { infisical "$@" --token="$INFISICAL_TOKEN" --projectId="$PROJECT_ID" --domain="$INFISICAL_DOMAIN" --silent; }

if [ -z "$(inf secrets get CLAUDE_API_KEY --env="$SECRET_ENV" --plain 2>/dev/null || true)" ]; then
  CLAUDE_API_KEY="$(inf secrets get CLAUDE_API_KEY --env=dev --plain)"
  export CLAUDE_API_KEY
fi

# 예: 100.74.208.69:5432 → 100.74.208.69
BOT_DB_HOST="$(docker port dgst_postgres 5432/tcp | head -1 | sed -E 's/:[0-9]+$//; s/^\[|\]$//g')"
export BOT_DB_HOST

LOCK="${XDG_RUNTIME_DIR:-/tmp}/dgst-bot.lock"
exec flock -n "$LOCK" \
  infisical run --token="$INFISICAL_TOKEN" --projectId="$PROJECT_ID" --domain="$INFISICAL_DOMAIN" \
  --env="$SECRET_ENV" --silent -- node scripts/bot-cli.js "$@"

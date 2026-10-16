#!/bin/sh
set -eu

: "${INFISICAL_CLIENT_ID:?INFISICAL_CLIENT_ID is required}"
: "${INFISICAL_CLIENT_SECRET:?INFISICAL_CLIENT_SECRET is required}"
: "${PROJECT_ID:?PROJECT_ID is required}"
: "${INFISICAL_DOMAIN:?INFISICAL_DOMAIN is required}"
: "${INFISICAL_SECRET_ENV:?INFISICAL_SECRET_ENV is required}"

# Cross-project services can still be starting after a host reboot.
# Retry authentication here instead of repeatedly restarting the container.
INFISICAL_LOGIN_MAX_ATTEMPTS="${INFISICAL_LOGIN_MAX_ATTEMPTS:-60}"
INFISICAL_LOGIN_RETRY_SECONDS="${INFISICAL_LOGIN_RETRY_SECONDS:-5}"
for value in "$INFISICAL_LOGIN_MAX_ATTEMPTS" "$INFISICAL_LOGIN_RETRY_SECONDS"; do
  case "$value" in
    ''|*[!0-9]*)
      printf '%s\n' 'Infisical retry settings must be positive integers' >&2
      exit 1
      ;;
  esac
  if [ "$value" -eq 0 ]; then
    printf '%s\n' 'Infisical retry settings must be positive integers' >&2
    exit 1
  fi
done

attempt=1
export INFISICAL_TOKEN
while :; do
  if INFISICAL_TOKEN="$(infisical login \
    --method=universal-auth \
    --client-id="$INFISICAL_CLIENT_ID" \
    --client-secret="$INFISICAL_CLIENT_SECRET" \
    --domain="$INFISICAL_DOMAIN" \
    --plain \
    --silent)" && [ -n "$INFISICAL_TOKEN" ]; then
    break
  fi

  if [ "$attempt" -ge "$INFISICAL_LOGIN_MAX_ATTEMPTS" ]; then
    printf 'Infisical authentication failed after %s attempts\n' "$attempt" >&2
    exit 1
  fi
  printf 'Infisical not ready (attempt %s/%s); retrying in %ss\n' \
    "$attempt" "$INFISICAL_LOGIN_MAX_ATTEMPTS" "$INFISICAL_LOGIN_RETRY_SECONDS" >&2
  sleep "$INFISICAL_LOGIN_RETRY_SECONDS"
  attempt=$((attempt + 1))
done

unset INFISICAL_CLIENT_SECRET

exec infisical run \
  --token="$INFISICAL_TOKEN" \
  --projectId="$PROJECT_ID" \
  --env="$INFISICAL_SECRET_ENV" \
  --domain="$INFISICAL_DOMAIN" \
  -- "$@"

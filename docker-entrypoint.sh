#!/bin/sh
set -eu

: "${INFISICAL_CLIENT_ID:?INFISICAL_CLIENT_ID is required}"
: "${INFISICAL_CLIENT_SECRET:?INFISICAL_CLIENT_SECRET is required}"
: "${INFISICAL_PROJECT_ID:?INFISICAL_PROJECT_ID is required}"
: "${INFISICAL_DOMAIN:?INFISICAL_DOMAIN is required}"
: "${INFISICAL_SECRET_ENV:?INFISICAL_SECRET_ENV is required}"

export INFISICAL_TOKEN
INFISICAL_TOKEN="$(infisical login \
  --method=universal-auth \
  --client-id="$INFISICAL_CLIENT_ID" \
  --client-secret="$INFISICAL_CLIENT_SECRET" \
  --plain \
  --silent)"

unset INFISICAL_CLIENT_SECRET

exec infisical run \
  --token="$INFISICAL_TOKEN" \
  --projectId="$INFISICAL_PROJECT_ID" \
  --env="$INFISICAL_SECRET_ENV" \
  --domain="$INFISICAL_DOMAIN" \
  -- "$@"

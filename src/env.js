import { defineEnvVars } from '@sveltejs/kit/env';

// Runtime (non-static) variables accept missing values like `$env/dynamic` did; callers
// validate what they require (e.g. minioStorage, turnstile).
export const variables = defineEnvVars({
  MINIO_ACCESS_KEY: { schema: (input) => input },
  MINIO_BUCKET: { schema: (input) => input },
  MINIO_ENDPOINT: { schema: (input) => input },
  MINIO_REGION: { schema: (input) => input },
  MINIO_SECRET_KEY: { schema: (input) => input },
  GOOGLE_CLIENT_ID: { schema: (input) => input },
  GOOGLE_CLIENT_SECRET: { schema: (input) => input },
  KAKAO_CLIENT_ID: { schema: (input) => input },
  KAKAO_CLIENT_SECRET: { schema: (input) => input },
  NODE_ENV: { static: true },
  NEXTAUTH_SECRET: { schema: (input) => input },
  BLUE_DGST_HOST: { schema: (input) => input },
  PUBLIC_PRIVACY_CONTACT_EMAIL: { public: true, schema: (input) => input },
  PUBLIC_PRIVACY_OPERATOR_NAME: { public: true, schema: (input) => input },
  PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY: { public: true, schema: (input) => input },
  BOT_MCP_TOKENS: { schema: (input) => input },
  CRON_SECRET: { schema: (input) => input },
  DGST_LOCAL_GAME_SMOKE: { schema: (input) => input },
  CLOUDFLARE_TURNSTILE_SECRET_KEY: { schema: (input) => input }
});

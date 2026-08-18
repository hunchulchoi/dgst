import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dockerfile = readFileSync('Dockerfile', 'utf8');
const dockerEntrypoint = readFileSync('docker-entrypoint.sh', 'utf8');
const dockerignore = readFileSync('.dockerignore', 'utf8');
const minioStorage = readFileSync('src/lib/server/minioStorage.js', 'utf8');
const profilePage = readFileSync('src/routes/auth/profile/+page.svelte', 'utf8');
const registerPage = readFileSync('src/routes/auth/register/+page.svelte', 'utf8');

describe('production container hygiene', () => {
  it('uses reproducible installs and a slim runtime image', () => {
    expect(dockerfile).toContain('FROM node:22-trixie-slim AS production');
    expect(dockerfile).toContain('RUN npm ci');
    expect(dockerfile).not.toContain('RUN npm install');
  });

  it('keeps Debian package sources unchanged so minimal images can update reliably', () => {
    expect(dockerfile).toContain('RUN apt-get update');
    expect(dockerfile).not.toContain("sed -i 's|http://deb.debian.org|https://deb.debian.org|g'");
  });

  it('copies only the generated Prisma client payload after production install', () => {
    expect(dockerfile).toContain(
      'COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma'
    );
    expect(dockerfile).not.toContain(
      'COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client'
    );
  });

  it('uses a non-secret, build-only Prisma URL without persisting it in the image', () => {
    expect(dockerfile).toContain(
      'RUN DATABASE_URL=postgresql://localhost/dgst_build npm run db:generate'
    );
    expect(dockerfile).toContain(
      'RUN DATABASE_URL=postgresql://localhost/dgst_build npm ci --omit dev'
    );
    expect(dockerfile).not.toContain('ENV DATABASE_URL=');
  });

  it('never sends local secrets or generated reports in the build context', () => {
    expect(dockerignore).toMatch(/^\.env\*$/m);
    expect(dockerignore).toMatch(/^\.codex-artifacts$/m);
    expect(dockerignore).toMatch(/^tmp$/m);
    expect(dockerignore).toMatch(/^vitest-report$/m);
    expect(dockerignore).toMatch(/^playwright-report$/m);
  });

  it('reads deployment secrets and public runtime configuration dynamically', () => {
    expect(minioStorage).toContain("from '$env/dynamic/private'");
    expect(minioStorage).not.toContain("from '$env/static/private'");
    expect(profilePage).toContain("from '$env/dynamic/public'");
    expect(registerPage).toContain("from '$env/dynamic/public'");
  });

  it('fetches runtime secrets from Infisical with universal auth', () => {
    expect(dockerfile).toContain("apt-get install -y --no-install-recommends infisical");
    expect(dockerfile).toContain('ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]');
    expect(dockerfile).toContain('CMD ["node", "."]');
    expect(dockerEntrypoint).toContain('infisical login');
    expect(dockerEntrypoint).toContain('--method=universal-auth');
    expect(dockerEntrypoint).toContain('exec infisical run');
    expect(dockerEntrypoint).toContain('--projectId="$PROJECT_ID"');
    expect(dockerEntrypoint).toContain('INFISICAL_SECRET_ENV is required');
    expect(dockerEntrypoint).toContain('unset INFISICAL_CLIENT_SECRET');
  });
});

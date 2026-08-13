import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dockerfile = readFileSync('Dockerfile', 'utf8');
const dockerignore = readFileSync('.dockerignore', 'utf8');

describe('production container hygiene', () => {
  it('uses reproducible installs and a slim runtime image', () => {
    expect(dockerfile).toContain('FROM node:22-trixie-slim AS production');
    expect(dockerfile).toContain('RUN npm ci');
    expect(dockerfile).not.toContain('RUN npm install');
  });

  it('copies only the generated Prisma client payload after production install', () => {
    expect(dockerfile).toContain(
      'COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma'
    );
    expect(dockerfile).not.toContain(
      'COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client'
    );
  });

  it('never sends local secrets or generated reports in the build context', () => {
    expect(dockerignore).toMatch(/^\.env\*$/m);
    expect(dockerignore).toMatch(/^\.codex-artifacts$/m);
    expect(dockerignore).toMatch(/^tmp$/m);
    expect(dockerignore).toMatch(/^vitest-report$/m);
    expect(dockerignore).toMatch(/^playwright-report$/m);
  });
});

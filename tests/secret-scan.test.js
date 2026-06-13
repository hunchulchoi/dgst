import { describe, expect, test } from 'vitest';
import { scanTextForSecrets } from '../scripts/check-secrets.js';

describe('secret scanner', () => {
  test('detects private key blocks', () => {
    const findings = scanTextForSecrets(
      'conf/server/pem/example.key',
      ['-----BEGIN ', 'PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----\n'].join('')
    );

    expect(findings).toEqual([
      expect.objectContaining({
        filePath: 'conf/server/pem/example.key',
        rule: 'private-key'
      })
    ]);
  });

  test('detects credentialed database URLs with real passwords', () => {
    const findings = scanTextForSecrets(
      'reset_slot_balance.js',
      [
        "const uri = 'mongodb://",
        'root:',
        'not-a-real-secret-12345',
        "@127.0.0.1:27017/dgstdb?authSource=admin';"
      ].join('')
    );

    expect(findings).toEqual([
      expect.objectContaining({
        filePath: 'reset_slot_balance.js',
        rule: 'credentialed-db-url'
      })
    ]);
  });

  test('allows documented placeholders and env interpolation', () => {
    const findings = scanTextForSecrets(
      '.env.example',
      [
        'DATABASE_URL="postgresql://postgres:password@localhost:5432/dgstdb"',
        'POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"',
        'MONGO_INITDB_ROOT_PASSWORD=""'
      ].join('\n')
    );

    expect(findings).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  DISPLAY_TIME_ZONE,
  formatAbsoluteTime,
  formatIso9075Safe,
  isValidTimeZone,
  normalizeToIsoString,
  resolveDisplayTimeZone,
  serializeTimeZoneCookie
} from '../src/lib/util/formatRelativeTime.js';

describe('time format contract', () => {
  const utcInstant = '2026-07-14T03:04:05.678Z';

  it('keeps API timestamps in UTC ISO 8601', () => {
    expect(normalizeToIsoString(utcInstant)).toBe(utcInstant);
  });

  it('formats absolute timestamps in the explicit display timezone', () => {
    expect(DISPLAY_TIME_ZONE).toBe('Asia/Seoul');
    expect(formatAbsoluteTime(utcInstant, 'M/d HH:mm')).toBe('7/14 12:04');
    expect(formatAbsoluteTime(utcInstant, 'HH:mm')).toBe('12:04');
  });

  it('uses a detected browser timezone and falls back to Seoul when unavailable', () => {
    expect(resolveDisplayTimeZone(undefined, 'America/New_York')).toBe('America/New_York');
    expect(resolveDisplayTimeZone(undefined, '')).toBe('Asia/Seoul');
    expect(resolveDisplayTimeZone('not/a-timezone', '')).toBe('Asia/Seoul');
  });

  it('accepts IANA timezones only', () => {
    expect(isValidTimeZone('Asia/Seoul')).toBe(true);
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('not/a-timezone')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });

  it('serializes a persistent timezone cookie for SSR requests', () => {
    expect(serializeTimeZoneCookie('America/New_York', true)).toBe(
      'timezone=America%2FNew_York; Path=/; Max-Age=31536000; SameSite=Lax; Secure'
    );
    expect(serializeTimeZoneCookie('not/a-timezone')).toBe('');
  });

  it('formats board timestamps in Seoul time regardless of process timezone', () => {
    expect(formatIso9075Safe(utcInstant)).toBe('2026-07-14 12:04:05');
  });

  it('allows an explicit timezone override', () => {
    expect(formatAbsoluteTime(utcInstant, 'yyyy-MM-dd HH:mm:ss', { timeZone: 'UTC' })).toBe(
      '2026-07-14 03:04:05'
    );
  });
});

describe('database time contract', () => {
  it('maps every Prisma DateTime field to PostgreSQL timestamptz', () => {
    const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
    const dateTimeFields = schema.split('\n').filter((line) => /\bDateTime\??\b/.test(line));

    expect(dateTimeFields.length).toBeGreaterThan(0);
    expect(dateTimeFields.every((line) => line.includes('@db.Timestamptz(3)'))).toBe(true);
  });

  it('documents the legacy UTC conversion that required a KST repair', () => {
    const migration = readFileSync(
      new URL(
        '../prisma/migrations/20260714093000_use_utc_timestamptz/migration.sql',
        import.meta.url
      ),
      'utf8'
    );
    const conversions = migration
      .split('\n')
      .filter((line) => line.includes('TYPE TIMESTAMPTZ(3)'));

    expect(conversions.length).toBeGreaterThan(0);
    expect(conversions.every((line) => line.includes("AT TIME ZONE 'UTC'"))).toBe(true);
  });

  it('repairs only impossible future board timestamps shifted by the legacy KST conversion', () => {
    const migration = readFileSync(
      new URL(
        '../prisma/migrations/20260714154500_force_future_board_timestamp_repair/migration.sql',
        import.meta.url
      ),
      'utf8'
    );

    expect(migration).toContain('UPDATE "articles"');
    expect(migration).toContain('UPDATE "article_reads"');
    expect(migration).toContain('UPDATE "comments"');
    expect(migration.match(/- INTERVAL '9 hours'/g)).toHaveLength(5);
    expect(migration.match(/> CURRENT_TIMESTAMP/g)).toHaveLength(10);
    expect(migration).toContain("RAISE EXCEPTION 'future board timestamps remain after KST repair'");
    expect(migration).not.toContain('UPDATE "sessions"');
    expect(migration).not.toContain('UPDATE "verification_tokens"');
  });
});

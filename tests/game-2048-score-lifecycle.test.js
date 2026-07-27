import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('2048 score lifecycle', () => {
	it('does not submit an unfinished saved game when the page unloads', () => {
		const source = readFileSync('src/routes/games/2048/+page.svelte', 'utf8');

		expect(source).not.toContain('submitScoreOnLeave');
		expect(source).not.toContain('keepalive: true');
	});

	it('deduplicates existing rows before adding the score uniqueness constraint', () => {
		const migration = readFileSync(
			'prisma/migrations/20260727000000_dedupe_2048_scores/migration.sql',
			'utf8'
		);

		expect(migration).toContain('PARTITION BY email, score');
		expect(migration).toContain('ORDER BY created_at ASC, id ASC');
		expect(migration).toContain('duplicate_number > 1');
		expect(migration).toContain('CREATE UNIQUE INDEX "game_score_2048_email_score_key"');
	});
});

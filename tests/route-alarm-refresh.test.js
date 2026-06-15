import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const layout = readFileSync('src/routes/+layout.svelte', 'utf8');
const articlePage = readFileSync(
  'src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.svelte',
  'utf8'
);

describe('route alarm refresh', () => {
  it('refreshes unread alarm count after every route navigation', () => {
    expect(layout).toContain('alarmCount, boardListReloadKey, boardListReloading');
    expect(layout).toContain('async function refreshUnreadAlarmCount()');
    expect(layout).toContain("fetch('/api/alarm/unread-count'");
    expect(layout).toContain('alarmCount.set(body.count ?? 0)');
    expect(layout).toContain('void refreshUnreadAlarmCount();');
  });

  it('refreshes unread alarm count after a successful comment write', () => {
    expect(articlePage).toContain('async function refreshUnreadAlarmCount()');
    expect(articlePage).toContain("fetch('/api/alarm/unread-count'");
    expect(articlePage).toContain('alarmCount.set(body.count ?? 0)');
    expect(articlePage).toContain('await refreshUnreadAlarmCount();');
    expect(articlePage.indexOf('await refreshUnreadAlarmCount();')).toBeGreaterThan(
      articlePage.indexOf('await comments();')
    );
  });
});

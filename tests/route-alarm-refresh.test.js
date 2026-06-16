import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const layout = readFileSync('src/routes/+layout.svelte', 'utf8');
const articlePage = readFileSync(
  'src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.svelte',
  'utf8'
);
const alarmPage = readFileSync('src/routes/board/alarm/+page.svelte', 'utf8');
const header = readFileSync('src/lib/components/header.svelte', 'utf8');

describe('route alarm refresh', () => {
  it('refreshes unread alarm count after every route navigation', () => {
    expect(layout).toContain('alarmCount, boardListReloadKey, boardListReloading');
    expect(layout).toContain('async function refreshUnreadAlarmCount()');
    expect(layout).toContain("fetch('/api/alarm/unread-count'");
    expect(layout).toContain('alarmCount.set(body.count ?? 0)');
    expect(layout).toContain('void refreshUnreadAlarmCount();');
  });

  it('refreshes unread alarm count when the free-board tab reloads without route navigation', () => {
    expect(header).toContain('async function refreshUnreadAlarmCount()');
    expect(header).toContain("fetch('/api/alarm/unread-count'");
    expect(header).toContain('alarmCount.set(body.count ?? 0)');
    expect(header).toContain('await refreshUnreadAlarmCount();');
    expect(header.indexOf('await refreshUnreadAlarmCount();')).toBeGreaterThan(
      header.indexOf("await invalidate('board-list');")
    );
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

  it('counts unread alarm rows on the alarm page instead of summing comment counts', () => {
    expect(alarmPage).toContain('return sum + 1');
    expect(alarmPage).not.toContain('Math.max(count, 1)');
  });
});

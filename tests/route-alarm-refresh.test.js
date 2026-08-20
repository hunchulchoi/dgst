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
  it('reloads the free-board list when the header logo is clicked', () => {
    expect(header).toMatch(
      /<NavbarBrand\s+href="\/"\s+onclick=\{handleFreeBoardTabClick\}\s+class="p-0">/
    );
  });

  it('does not remount the current alarm/article page before navigating home', () => {
    const handler = header.slice(
      header.indexOf('async function handleFreeBoardTabClick'),
      header.indexOf('</script>')
    );
    const gotoBranch = handler.slice(handler.indexOf('if (!onHome)'), handler.indexOf('} else {'));

    expect(gotoBranch).toContain("await goto(resolve('/'),");
    expect(gotoBranch).not.toContain('boardListReloadKey.update');
    expect(gotoBranch).not.toContain("invalidate('board-list')");
    expect(handler).toContain('if (freeBoardNavigationInFlight) return');
  });

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

  it('polls unread alarms while a signed-in tab remains open', () => {
    expect(header).toContain('const ALARM_POLL_INTERVAL_MS = 30_000;');
    expect(header).toContain('window.setInterval(refreshIfVisible, ALARM_POLL_INTERVAL_MS)');
    expect(header).toContain("window.addEventListener('focus', refreshIfVisible)");
    expect(header).toContain("document.addEventListener('visibilitychange', refreshIfVisible)");
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

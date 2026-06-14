import { describe, expect, it } from 'vitest';

import { repairOgCardHtmlEntities } from '../src/lib/util/ogCardHtmlRepair.js';

describe('repairOgCardHtmlEntities', () => {
  it('decodes stored OG card text fields without touching URLs', () => {
    const html = `
      <div class="og-card-blot">
        <a href="https://example.com?q=a&amp;b=1">
          <div data-og-title>美정부, &amp;apos;미토스&amp;apos; 해외접속 금지</div>
          <div data-og-description>연합뉴스 &amp;amp; YNA</div>
          <div data-og-site>Foo &amp;#39; Bar</div>
          <div>https://example.com?q=a&amp;b=1</div>
        </a>
      </div>
    `;

    const repaired = repairOgCardHtmlEntities(html);

    expect(repaired).toContain("data-og-title>美정부, '미토스' 해외접속 금지</div>");
    expect(repaired).toContain('data-og-description>연합뉴스 & YNA</div>');
    expect(repaired).toContain("data-og-site>Foo ' Bar</div>");
    expect(repaired).toContain('https://example.com?q=a&amp;b=1');
  });

  it('decodes sanitized OG card text after data attributes are stripped', () => {
    const html = `
      <div class="og-card-blot">
        <a href="https://example.com?q=a&amp;b=1">
          <img src="https://example.com/cover.jpg" alt="">
          <div>美정부, &amp;apos;미토스&amp;apos; 해외접속 금지</div>
          <div>연합뉴스 &amp;amp; YNA</div>
          <div>Foo &amp;#39; Bar</div>
          <div>https://example.com?q=a&amp;b=1</div>
        </a>
      </div>
    `;

    const repaired = repairOgCardHtmlEntities(html);

    expect(repaired).toContain("<div>美정부, '미토스' 해외접속 금지</div>");
    expect(repaired).toContain('<div>연합뉴스 & YNA</div>');
    expect(repaired).toContain("<div>Foo ' Bar</div>");
    expect(repaired).toContain('<div>https://example.com?q=a&amp;b=1</div>');
  });
});

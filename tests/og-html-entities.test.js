import { describe, expect, it } from 'vitest';

import { decodeOgTextFields, parseOpenGraphData } from '../src/routes/api/og/+server.js';

describe('parseOpenGraphData', () => {
  it('decodes HTML entities in OG title and description', () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="美정부, &apos;미토스&apos; 해외접속 금지 &amp; 서비스 중단" />
          <meta property="og:description" content="권영전 특파원 = 미국 행정부가 &#39;미토스&#39;를 비공개 처리" />
          <meta property="og:site_name" content="연합뉴스 &amp; YNA" />
        </head>
      </html>
    `;

    const ogData = decodeOgTextFields(parseOpenGraphData(html, 'https://www.yna.co.kr'));

    expect(ogData.title).toBe("美정부, '미토스' 해외접속 금지 & 서비스 중단");
    expect(ogData.description).toBe("권영전 특파원 = 미국 행정부가 '미토스'를 비공개 처리");
    expect(ogData.siteName).toBe('연합뉴스 & YNA');
  });
});

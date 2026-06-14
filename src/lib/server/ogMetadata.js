/**
 * @param {string} html
 * @param {string} baseUrl
 * @returns {{ title: string; description: string; image: string; url: string; siteName: string; favicon: string }}
 */
export function parseOpenGraphData(html, baseUrl) {
  const ogData = {
    title: '',
    description: '',
    image: '',
    url: baseUrl,
    siteName: '',
    favicon: ''
  };

  const metaRegex = /<meta[^>]+>/gi;
  const metaTags = html.match(metaRegex) || [];

  for (const tag of metaTags) {
    const propertyMatch = tag.match(/property=["']([^"']+)["']/i);
    const contentMatch = tag.match(/content=["']([^"']+)["']/i);
    const nameMatch = tag.match(/name=["']([^"']+)["']/i);

    if (!contentMatch) continue;

    const content = contentMatch[1];
    const property = propertyMatch ? propertyMatch[1] : '';
    const name = nameMatch ? nameMatch[1] : '';

    if (property.startsWith('og:')) {
      switch (property) {
        case 'og:title':
          ogData.title = content;
          break;
        case 'og:description':
          ogData.description = content;
          break;
        case 'og:image':
          ogData.image = resolveUrl(content, baseUrl);
          break;
        case 'og:url':
          ogData.url = content;
          break;
        case 'og:site_name':
          ogData.siteName = content;
          break;
      }
    }

    if (name === 'title' && !ogData.title) {
      ogData.title = content;
    }
    if (name === 'description' && !ogData.description) {
      ogData.description = content;
    }
  }

  if (!ogData.title) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      ogData.title = titleMatch[1].trim();
    }
  }

  if (!ogData.description) {
    ogData.description = '링크를 클릭하여 내용을 확인하세요.';
  }

  ogData.description = ogData.description.substring(0, 50);

  if (!ogData.title) {
    try {
      const urlObj = new URL(baseUrl);
      ogData.title = urlObj.hostname;
    } catch {
      ogData.title = baseUrl;
    }
  }

  const favicon = html.match(/<link[^>]+rel=["']icon["'][^>]+>/i);
  if (favicon) {
    const hrefMatch = favicon[0].match(/href=["']([^"']+)["']/i);
    if (hrefMatch) {
      ogData.favicon = resolveUrl(hrefMatch[1], baseUrl);
    }
  }

  if (!ogData.siteName) {
    ogData.siteName = new URL(baseUrl).hostname;
  }

  return ogData;
}

/**
 * @param {{ title?: string; description?: string; image?: string; url?: string; siteName?: string; favicon?: string }} ogData
 * @returns {{ title: string; description: string; image: string; url: string; siteName: string; favicon: string }}
 */
export function decodeOgTextFields(ogData) {
  return {
    title: decodeHtmlEntities(ogData.title ?? ''),
    description: decodeHtmlEntities(ogData.description ?? ''),
    image: ogData.image ?? '',
    url: ogData.url ?? '',
    siteName: decodeHtmlEntities(ogData.siteName ?? ''),
    favicon: ogData.favicon ?? ''
  };
}

/**
 * @param {string} value
 * @returns {string}
 */
function decodeHtmlEntities(value) {
  const namedEntities = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' '
  };

  return String(value ?? '').replaceAll(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const isHex = entity[1]?.toLowerCase() === 'x';
      const codePointText = isHex ? entity.slice(2) : entity.slice(1);
      const codePoint = Number.parseInt(codePointText, isHex ? 16 : 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    return namedEntities[entity.toLowerCase()] ?? match;
  });
}

/**
 * @param {string} url
 * @param {string} baseUrl
 * @returns {string}
 */
function resolveUrl(url, baseUrl) {
  if (!url) return '';

  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  if (url.startsWith('//')) {
    return 'https:' + url;
  }

  try {
    const base = new URL(baseUrl);

    if (url.startsWith('/')) {
      return `${base.protocol}//${base.host}${url}`;
    }

    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}

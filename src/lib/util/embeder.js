import sanitizeHtml from 'sanitize-html';

function youtubeEmbeder(url) {

  url = url.replace('https://', '').replace('http://', '').replace('www.', '');

  const youtubeUrls = [
    /^youtube\.com\/shorts\/([\w-]+)(?:\?si=[\w-]+)?/, // Shorts 우선 처리
    /^(?:m\.)?youtube\.com\/watch\?v=([\w-]+)(?:&t=(\d+))?/,
    /^(?:m\.)?youtube\.com\/v\/([\w-]+)(?:\?t=(\d+))?/,
    /^youtube\.com\/embed\/([\w-]+)(?:\?start=(\d+))?/,
    /^youtu\.be\/([\w-]+)(?:\?t=(\d+))?/
  ]

  for (let i = 0; i < youtubeUrls.length; i++) {

    const _match = url.match(youtubeUrls[i]);

    if (_match) {
      const id = _match[1];
      const time = _match[2];

      const paddingBottom = i === 0 ? '176.6%' : '56.25%';
      const width = i === 0 ? '470px' : '560px';

      return (
        `<div style="max-width: 100%; width: ${width}; margin: 0 auto;">
           <div style="position: relative; width: 100%; height: 0; padding-bottom: ${paddingBottom};">
            <iframe src="https://www.youtube.com/embed/${id}${time ? `?start=${time}` : ''}"
              style="position: absolute; width: 100%; height: 100%; top: 0; left: 0;"
              frameborder="0" allow="autoplay; encrypted-media" allowfullscreen>
            </iframe>
          </div>
        </div>`
      );
    }
  }



  return null;

}

export function viewComment(comment) {

  comment = comment.replace(/(?:\r\n|\r|\n)/g, '<br>')

  // 안전 태그 (Instagram 임베드 허용)
  comment = sanitizeHtml(comment, {
    allowedTags: [
      'br', 'strong', 'em', 'u', 's', 'p', 'div',
      'blockquote', 'img', 'iframe', 'a', 'span'
    ],
    allowedAttributes: {
      'blockquote': ['class', 'data-instgrm-permalink', 'style'],
      'iframe': ['src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'style', 'position'],
      'div': ['style', 'class'],
      'a': ['href', 'target', 'rel'],
      'img': ['src', 'alt', 'width', 'height', 'style'],
      'span': ['style']
    }
  });

  const httpRegexG =
    /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/g;

  const matched = comment.match(httpRegexG);

  if (matched) {

    matched.forEach(m => {
      // YouTube 임베드 우선 처리
      const youtubeEmbed = youtubeEmbeder(m);
      if (youtubeEmbed) {
        comment = comment.replace(m, youtubeEmbed);
        return;
      }

      // 일반 링크는 제거 (OG 미리보기로 대체됨)
      comment = comment.replace(m, '');
    })
  }

  return comment;
}

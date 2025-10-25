import sanitizeHtml from 'sanitize-html';

// Open Graph 미리보기 생성 함수
async function createOGPreview(url) {
  try {
    const response = await fetch(`/api/og?url=${encodeURIComponent(url)}`);
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (data.title && data.description) {
      return `
        <div class="og-preview border rounded p-3 my-2" style="max-width: 500px;">
          <div class="d-flex">
            ${data.image ? `<img src="${data.image}" class="me-3" style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px;" alt="미리보기 이미지">` : ''}
            <div class="flex-grow-1">
              <h6 class="mb-1" style="font-size: 14px; font-weight: 600;">${data.title}</h6>
              <p class="mb-1 text-muted" style="font-size: 12px; line-height: 1.4;">${data.description}</p>
              <small class="text-muted" style="font-size: 11px;">${new URL(url).hostname}</small>
            </div>
          </div>
        </div>
      `;
    }
  } catch (error) {
    console.error('OG 미리보기 생성 실패:', error);
  }
  
  return null;
}

function youtubeEmbeder(url){

  url = url.replace('https://', '').replace('http://', '').replace('www.', '');

  const youtubeUrls =[
    /^(?:m\.)?youtube\.com\/watch\?v=([\w-]+)(?:&t=(\d+))?/,
    /^(?:m\.)?youtube\.com\/v\/([\w-]+)(?:\?t=(\d+))?/,
    /^youtube\.com\/embed\/([\w-]+)(?:\?start=(\d+))?/,
    /^youtu\.be\/([\w-]+)(?:\?t=(\d+))?/,
    /^youtube\.com\/shorts\/([\w-]+)(?:\/\?si=([\w-]+))?/
  ]

  for(let i=0; i<youtubeUrls.length; i++) {

    const _match = url.match(youtubeUrls[i]);

    if(_match){
      const id = _match[ 1 ];
      const time = _match[ 2 ];
      
      const paddingBottom = i===4?'177.777%':'56.2493%';
      const maxWidth = i===4?'400px':'480px';

      return (
        `<div style="max-width: ${maxWidth}">
           <div style="position: relative; width: 100%; height: 0; padding-bottom: ${paddingBottom};">
            <iframe src="https://www.youtube.com/embed/${ id }${ time ? `?start=${ time }` : '' }"
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

export async function viewComment(comment){

  comment = comment.replace(/(?:\r\n|\r|\n)/g, '<br>')

  // 안전 태그
  comment = sanitizeHtml(comment);

  const httpRegexG =
    /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/g;

  const matched = comment.match(httpRegexG);

  if(matched){

    for (const m of matched) {
      // YouTube 임베드 우선 처리
      const youtubeEmbed = youtubeEmbeder(m);
      if (youtubeEmbed) {
        comment = comment.replace(m, youtubeEmbed);
        continue;
      }
      
      // Open Graph 미리보기 시도
      const ogPreview = await createOGPreview(m);
      if (ogPreview) {
        comment = comment.replace(m, ogPreview);
      } else {
        // OG 미리보기 실패 시 일반 링크
        const link = `<a href="${m}" target="_blank"><em class="text-success bi bi-arrow-up-right-square-fill me-1"></em>${m}</a>`;
        comment = comment.replace(m, link);
      }
    }
  }

  return comment;
}

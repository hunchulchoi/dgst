<script>

  import {Col, Row} from "sveltestrap";

  const contents = [`안녕하세요
  https://www.youtube.com/shorts/u9cbnfcTF6g
  ㅋㅋㅋㅋㅋ`,
  'ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ',
  `안녕하세요 다음
  https://www.daum.net
  ㅋㅋㅋㅋㅋ`

  ]

  let matched;

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

        return (
          '<div style="position: relative; padding-bottom: 100%; height: 0; padding-bottom: 56.2493%;">' +
          `<iframe src="https://www.youtube.com/embed/${ id }${ time ? `?start=${ time }` : '' }" ` +
          'style="position: absolute; width: 100%; height: 100%; top: 0; left: 0;" ' +
          'frameborder="0" allow="autoplay; encrypted-media" allowfullscreen>' +
          '</iframe>' +
          '</div>'
        );
      }
    }

    return null;

  }

  function viewComment(comment){

    const httpRegexG =
      /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/g;

     const matched = comment.match(httpRegexG);

    if(matched){

      matched.forEach(m=>{
        let link = youtubeEmbeder(m) || `<a href="${m}" target="_blank">${m}</a>`
        comment = comment.replace(m, link);
      })
    }

    return comment;
  }

</script>

<main>
  {#each contents as content}
  <Row>
    <Col>
      content:{content}
    </Col>
  </Row>
  <Row>
    <Col>matched:{matched}</Col>
  </Row>
  <Row>
    <Col>
      {@html viewComment(content)}
    </Col>
  </Row>
    <hr />
    {/each}
</main>

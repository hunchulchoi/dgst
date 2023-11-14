<svelte:head>
  <script async src="https://platform.instagram.com/en_US/embeds.js"></script>
  <script async src="//www.tiktok.com/embed.js"></script>
  <style>

      .image img {
          max-width: 100% !important;
      }

      .card-text img {
          max-width: 100%;
      }

      figure{
        max-width: 100% !important;
      }

  </style>

  <script>
    window.onload = function(){

      /*setTimeout(()=>{
        console.log("document.querySelector('blockquote.instagram-media')", document.querySelector('iframe.instagram-media'))
        if(document.querySelector('iframe.instagram-media')){
          //console.log('data.insta', data.insta)
          instgrm.Embeds.process();
        }
      }, 1000)*/
    }
  </script>
</svelte:head>

<script>
  import {
    Badge,
    Button,
    Card,
    CardBody,
    CardSubtitle,
    CardText,
    Col,
    Icon,
    Image,
    Input,
    InputGroup,
    Pagination, PaginationItem, PaginationLink,
    Row,
    Toast, ToastBody, ToastHeader
  } from 'sveltestrap';
  import {page} from '$app/stores';
  import {goto} from '$app/navigation';
  import {scale} from "svelte/transition";

  import {formatDistanceToNowStrict, formatISO9075, parseISO} from 'date-fns';
  import ko from 'date-fns/locale/ko/index.js';

  import {blobToWebP} from 'webp-converter-browser';

  import Loader from 'svelte-loading-overlay/Loader.svelte';

  import {alarmCount} from "$lib/util/store.js";
  import {viewComment} from "$lib/util/embeder.js";
  import Dialog from "$lib/components/dialog.svelte";
  import {afterUpdate, onMount} from "svelte";

  function gopage(pageNo){
      goto(`/board/${$page.params.boardId}/${pageNo}?v=${new Date().getSeconds()}`
          , {invalidateAll: true});
  }

  function like(){
    fetch(`/board/${$page.params.boardId}/${$page.params.articleId}/like`, {method: 'POST'})
      .then((res) => res.json())
      .then((d) => {
        data.article.read = d.read;
        data.article.like = d.like;
        data.article.liked = d.liked;
      });
  }

  async function likeComment(commentId){

    await fetch(`/board/${$page.params.boardId}/${$page.params.articleId}/like/${commentId}`, {method: 'POST'});
    comments();
  }

  function comments() {
    fetch(`/board/${$page.params.boardId}/${$page.params.articleId}/comment`)
      .then((res) => res.json())
      .then((d) => (data.article.comments = d));
  }

  function list() {
    const pageNo = $page.params.pageNo || 1;

    goto(`/board/${$page.params.boardId}/${pageNo}`, {invalidateAll: true, replaceState: true});
  }

  async function preview(event, el) {

    if(event.type == 'paste'){

        /*console.log('event.clipboardData.files', event.clipboardData.files)
        console.log('event.clipboardData.files[0]', event.clipboardData.files[0])
        console.log('event.clipboardData.files[0].type', event.clipboardData.files[0].type)*/

      if(event.clipboardData.files?.length && event.clipboardData.files[0].type.startsWith('image')){

        commentImage = event.clipboardData.files[0];

        event.preventDefault();
      }else return;

    }else commentImage = event.target.files[0];

    el.src = window.URL.createObjectURL(commentImage);

    el.onload = async (evt) => {
      commentLoading = true;

      //console.log('commentImage.type', commentImage.type)

      if (!commentImage.type.endsWith('gif') && !commentImage.type.endsWith('webp')) {

          const webp = await blobToWebP(commentImage, {width: 1400});
          commentImage = new File([webp], commentImage.name);
      }

      el.style.maxHeight = '50vh';
      el.classList.remove('d-none');

      commentLoading = false;
    };
  }


  let reCommentDiv;
  let reCommentContent;
  let rePreviewEl;
  let reCommentImageEl;

  let commentDiv;
  let commentContent;
  let commentImage;
  let previewEl;
  let commentImageEl;

  let commentLoading = false;

  function writeComment(parentCommentId) {

    //console.log(commentContent, parentCommentId, reCommentContent)

    if ((!parentCommentId && !commentContent) || (parentCommentId && !reCommentContent)) {
      toast('내용을 입력하세요', 'warning');
      return;
    }
    commentLoading = true;

    const formData = new FormData();

    if (!parentCommentId) {
      formData.append('content', commentContent);
      if (commentImage) formData.append('image', commentImage);
    } else {
      formData.append('content', reCommentContent);
      formData.append('parentCommentId', parentCommentId);
      if (commentImage) formData.append('image', commentImage);
    }

    fetch(`/board/${$page.params.boardId}/${$page.params.articleId}/comment`, {
      method: 'POST',
      body: formData
    })
      .then(async (res) => {
        console.debug('res', res);

        if (res.status !== 201) {
          const {message} = await res.json();
          toast(message);
          return;
        }

        commentContent = '';
        commentImage = '';
        commentImageEl.value = '';
        previewEl.src = '';
        previewEl.classList.add('d-none');

        visibleReply = '';
        reCommentContent = '';
        if (parentCommentId) {
          reCommentImageEl.value = '';
          rePreviewEl.src = '';
          rePreviewEl.classList.add('d-none');
        }

        toast('저장 되었습니다.');

        comments();
      })
      .catch((error) => {
        console.error(error);
        toast(error.message ?? '저장 중 오류가 발생했습니다.', 'danger');
      })
      .finally(() => (commentLoading = false));
  }

  function deleteComment(commentId) {

    showModal('삭제 하시겠습니까?', ()=>{

        fetch(`/board/${$page.params.boardId}/${$page.params.articleId}/comment`, {
        method: 'DELETE',
        body: JSON.stringify({commentId})
      })
        .then(async (res) => {
          if (res.status !== 200) {
            const {message} = await res.json();
            toast(message);
            return;
          }

          toast(await res.text());

          comments();
        })
        .catch((err) => {
          console.error(err);
          toast(err.message ?? '삭제 중 오류가 발생했습니다.', 'danger');
        });
    })
  }

  function remove(articleId) {

    showModal('삭제 하시겠습니까?', ()=> {
      fetch(`/board/${$page.params.boardId}/${$page.params.articleId}`, {
      method: 'DELETE',
      body: JSON.stringify({articleId})
    })
      .then(async (res) => {
        if (res.status !== 200) {
          const {message} = await res.json();
          toast(message);
          return;
        }

        list();
      })
      .catch((err) => {
        console.error(err);
        toast(err.message ?? '삭제 중 오류가 발생했습니다.', 'danger');
      });
    })
  }

  function edit(articleId) {
    goto(`/board/${$page.params.boardId}/write/${articleId}`);
  }

  function write() {
    goto(`/board/${$page.params.boardId}/write`);
  }

  function countEmojis(str) {
    var EmojiPattern = /(?:\uD83D(?:\uDD73\uFE0F?|\uDC41(?:(?:\uFE0F(?:\u200D\uD83D\uDDE8\uFE0F?)?|\u200D\uD83D\uDDE8\uFE0F?))?|[\uDDE8\uDDEF]\uFE0F?|\uDC4B(?:\uD83C[\uDFFB-\uDFFF])?|\uDD90(?:(?:\uD83C[\uDFFB-\uDFFF]|\uFE0F))?|[\uDD96\uDC4C\uDC48\uDC49\uDC46\uDD95\uDC47\uDC4D\uDC4E\uDC4A\uDC4F\uDE4C\uDC50\uDE4F\uDC85\uDCAA\uDC42\uDC43\uDC76\uDC66\uDC67](?:\uD83C[\uDFFB-\uDFFF])?|\uDC71(?:(?:\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2640\u2642]\uFE0F?))?)|\u200D(?:[\u2640\u2642]\uFE0F?)))?|\uDC68(?:(?:\uD83C(?:\uDFFB(?:\u200D(?:\uD83E(?:\uDD1D\u200D\uD83D\uDC68\uD83C[\uDFFC-\uDFFF]|[\uDDB0\uDDB1\uDDB3\uDDB2\uDDAF\uDDBC\uDDBD])|\u2695\uFE0F?|\uD83C[\uDF93\uDFEB\uDF3E\uDF73\uDFED\uDFA4\uDFA8]|\u2696\uFE0F?|\uD83D[\uDD27\uDCBC\uDD2C\uDCBB\uDE80\uDE92]|\u2708\uFE0F?))?|\uDFFC(?:\u200D(?:\uD83E(?:\uDD1D\u200D\uD83D\uDC68\uD83C[\uDFFB\uDFFD-\uDFFF]|[\uDDB0\uDDB1\uDDB3\uDDB2\uDDAF\uDDBC\uDDBD])|\u2695\uFE0F?|\uD83C[\uDF93\uDFEB\uDF3E\uDF73\uDFED\uDFA4\uDFA8]|\u2696\uFE0F?|\uD83D[\uDD27\uDCBC\uDD2C\uDCBB\uDE80\uDE92]|\u2708\uFE0F?))?|\uDFFD(?:\u200D(?:\uD83E(?:\uDD1D\u200D\uD83D\uDC68\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF]|[\uDDB0\uDDB1\uDDB3\uDDB2\uDDAF\uDDBC\uDDBD])|\u2695\uFE0F?|\uD83C[\uDF93\uDFEB\uDF3E\uDF73\uDFED\uDFA4\uDFA8]|\u2696\uFE0F?|\uD83D[\uDD27\uDCBC\uDD2C\uDCBB\uDE80\uDE92]|\u2708\uFE0F?))?|\uDFFE(?:\u200D(?:\uD83E(?:\uDD1D\u200D\uD83D\uDC68\uD83C[\uDFFB-\uDFFD\uDFFF]|[\uDDB0\uDDB1\uDDB3\uDDB2\uDDAF\uDDBC\uDDBD])|\u2695\uFE0F?|\uD83C[\uDF93\uDFEB\uDF3E\uDF73\uDFED\uDFA4\uDFA8]|\u2696\uFE0F?|\uD83D[\uDD27\uDCBC\uDD2C\uDCBB\uDE80\uDE92]|\u2708\uFE0F?))?|\uDFFF(?:\u200D(?:\uD83E(?:\uDD1D\u200D\uD83D\uDC68\uD83C[\uDFFB-\uDFFE]|[\uDDB0\uDDB1\uDDB3\uDDB2\uDDAF\uDDBC\uDDBD])|\u2695\uFE0F?|\uD83C[\uDF93\uDFEB\uDF3E\uDF73\uDFED\uDFA4\uDFA8]|\u2696\uFE0F?|\uD83D[\uDD27\uDCBC\uDD2C\uDCBB\uDE80\uDE92]|\u2708\uFE0F?))?)|\u200D(?:\uD83E[\uDDB0\uDDB1\uDDB3\uDDB2\uDDAF\uDDBC\uDDBD]|\u2695\uFE0F?|\uD83C[\uDF93\uDFEB\uDF3E\uDF73\uDFED\uDFA4\uDFA8]|\u2696\uFE0F?|\uD83D(?:\uDC69\u200D\uD83D(?:\uDC66(?:\u200D\uD83D\uDC66)?|\uDC67(?:\u200D\uD83D[\uDC66\uDC67])?)|\uDC68\u200D\uD83D(?:\uDC66(?:\u200D\uD83D\uDC66)?|\uDC67(?:\u200D\uD83D[\uDC66\uDC67])?)|\uDC66(?:\u200D\uD83D\uDC66)?|\uDC67(?:\u200D\uD83D[\uDC66\uDC67])?|[\uDD27\uDCBC\uDD2C\uDCBB\uDE80\uDE92])|\u2708\uFE0F?|\u2764(?:\uFE0F\u200D\uD83D(?:\uDC8B\u200D\uD83D\uDC68|\uDC68)|\u200D\uD83D(?:\uDC8B\u200D\uD83D\uDC68|\uDC68)))))?|\uDC69(?:(?:\uD83C(?:\uDFFB(?:\u200D(?:\uD83E(?:\uDD1D\u200D\uD83D(?:\uDC69\uD83C[\uDFFC-\uDFFF]|\uDC68\uD83C[\uDFFC-\uDFFF])|[\uDDB0\uDDB1\uDDB3\uDDB2\uDDAF\uDDBC\uDDBD])|\u2695\uFE0F?|\uD83C[\uDF93\uDFEB\uDF3E\uDF73\uDFED\uDFA4\uDFA8]|\u2696\uFE0F?|\uD83D[\uDD27\uDCBC\uDD2C\uDCBB\uDE80\uDE92]|\u2708\uFE0F?))?|\uDFFC(?:\u200D(?:\uD83E(?:\uDD1D\u200D\uD83D(?:\uDC69\uD83C[\uDFFB\uDFFD-\uDFFF]|\uDC68\uD83C[\uDFFB\uDFFD-\uDFFF])|[\uDDB0\uDDB1\uDDB3\uDDB2\uDDAF\uDDBC\uDDBD])|\u2695\uFE0F?|\uD83C[\uDF93\uDFEB\uDF3E\uDF73\uDFED\uDFA4\uDFA8]|\u2696\uFE0F?|\uD83D[\uDD27\uDCBC\uDD2C\uDCBB\uDE80\uDE92]|\u2708\uFE0F?))?|\uDFFD(?:\u200D(?:\uD83E(?:\uDD1D\u200D\uD83D(?:\uDC69\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF]|\uDC68\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])|[\uDDB0\uDDB1\uDDB3\uDDB2\uDDAF\uDDBC\uDDBD])|\u2695\uFE0F?|\uD83C[\uDF93\uDFEB\uDF3E\uDF73\uDFED\uDFA4\uDFA8]|\u2696\uFE0F?|\uD83D[\uDD27\uDCBC\uDD2C\uDCBB\uDE80\uDE92]|\u2708\uFE0F?))?|\uDFFE(?:\u200D(?:\uD83E(?:\uDD1D\u200D\uD83D(?:\uDC69\uD83C[\uDFFB-\uDFFD\uDFFF]|\uDC68\uD83C[\uDFFB-\uDFFD\uDFFF])|[\uDDB0\uDDB1\uDDB3\uDDB2\uDDAF\uDDBC\uDDBD])|\u2695\uFE0F?|\uD83C[\uDF93\uDFEB\uDF3E\uDF73\uDFED\uDFA4\uDFA8]|\u2696\uFE0F?|\uD83D[\uDD27\uDCBC\uDD2C\uDCBB\uDE80\uDE92]|\u2708\uFE0F?))?|\uDFFF(?:\u200D(?:\uD83E(?:\uDD1D\u200D\uD83D(?:\uDC69\uD83C[\uDFFB-\uDFFE]|\uDC68\uD83C[\uDFFB-\uDFFE])|[\uDDB0\uDDB1\uDDB3\uDDB2\uDDAF\uDDBC\uDDBD])|\u2695\uFE0F?|\uD83C[\uDF93\uDFEB\uDF3E\uDF73\uDFED\uDFA4\uDFA8]|\u2696\uFE0F?|\uD83D[\uDD27\uDCBC\uDD2C\uDCBB\uDE80\uDE92]|\u2708\uFE0F?))?)|\u200D(?:\uD83E[\uDDB0\uDDB1\uDDB3\uDDB2\uDDAF\uDDBC\uDDBD]|\u2695\uFE0F?|\uD83C[\uDF93\uDFEB\uDF3E\uDF73\uDFED\uDFA4\uDFA8]|\u2696\uFE0F?|\uD83D(?:\uDC69\u200D\uD83D(?:\uDC66(?:\u200D\uD83D\uDC66)?|\uDC67(?:\u200D\uD83D[\uDC66\uDC67])?)|\uDC66(?:\u200D\uD83D\uDC66)?|\uDC67(?:\u200D\uD83D[\uDC66\uDC67])?|[\uDD27\uDCBC\uDD2C\uDCBB\uDE80\uDE92])|\u2708\uFE0F?|\u2764(?:\uFE0F\u200D\uD83D(?:\uDC8B\u200D\uD83D[\uDC68\uDC69]|[\uDC68\uDC69])|\u200D\uD83D(?:\uDC8B\u200D\uD83D[\uDC68\uDC69]|[\uDC68\uDC69])))))?|[\uDC74\uDC75](?:\uD83C[\uDFFB-\uDFFF])?|[\uDE4D\uDE4E\uDE45\uDE46\uDC81\uDE4B\uDE47\uDC6E](?:(?:\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?)|\u200D(?:[\u2642\u2640]\uFE0F?)))?|\uDD75(?:(?:\uFE0F(?:\u200D(?:[\u2642\u2640]\uFE0F?))?|\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?)|\u200D(?:[\u2642\u2640]\uFE0F?)))?|[\uDC82\uDC77](?:(?:\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?)|\u200D(?:[\u2642\u2640]\uFE0F?)))?|\uDC78(?:\uD83C[\uDFFB-\uDFFF])?|\uDC73(?:(?:\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?)|\u200D(?:[\u2642\u2640]\uFE0F?)))?|[\uDC72\uDC70\uDC7C](?:\uD83C[\uDFFB-\uDFFF])?|[\uDC86\uDC87\uDEB6](?:(?:\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?)|\u200D(?:[\u2642\u2640]\uFE0F?)))?|[\uDC83\uDD7A](?:\uD83C[\uDFFB-\uDFFF])?|\uDD74(?:(?:\uD83C[\uDFFB-\uDFFF]|\uFE0F))?|\uDC6F(?:\u200D(?:[\u2642\u2640]\uFE0F?))?|[\uDEA3\uDEB4\uDEB5](?:(?:\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?)|\u200D(?:[\u2642\u2640]\uFE0F?)))?|[\uDEC0\uDECC\uDC6D\uDC6B\uDC6C](?:\uD83C[\uDFFB-\uDFFF])?|\uDDE3\uFE0F?|\uDC15(?:\u200D\uD83E\uDDBA)?|[\uDC3F\uDD4A\uDD77\uDD78\uDDFA\uDEE3\uDEE4\uDEE2\uDEF3\uDEE5\uDEE9\uDEF0\uDECE\uDD70\uDD79\uDDBC\uDD76\uDECD\uDDA5\uDDA8\uDDB1\uDDB2\uDCFD\uDD6F\uDDDE\uDDF3\uDD8B\uDD8A\uDD8C\uDD8D\uDDC2\uDDD2\uDDD3\uDD87\uDDC3\uDDC4\uDDD1\uDDDD\uDEE0\uDDE1\uDEE1\uDDDC\uDECF\uDECB\uDD49]\uFE0F?|[\uDE00\uDE03\uDE04\uDE01\uDE06\uDE05\uDE02\uDE42\uDE43\uDE09\uDE0A\uDE07\uDE0D\uDE18\uDE17\uDE1A\uDE19\uDE0B\uDE1B-\uDE1D\uDE10\uDE11\uDE36\uDE0F\uDE12\uDE44\uDE2C\uDE0C\uDE14\uDE2A\uDE34\uDE37\uDE35\uDE0E\uDE15\uDE1F\uDE41\uDE2E\uDE2F\uDE32\uDE33\uDE26-\uDE28\uDE30\uDE25\uDE22\uDE2D\uDE31\uDE16\uDE23\uDE1E\uDE13\uDE29\uDE2B\uDE24\uDE21\uDE20\uDE08\uDC7F\uDC80\uDCA9\uDC79-\uDC7B\uDC7D\uDC7E\uDE3A\uDE38\uDE39\uDE3B-\uDE3D\uDE40\uDE3F\uDE3E\uDE48-\uDE4A\uDC8B\uDC8C\uDC98\uDC9D\uDC96\uDC97\uDC93\uDC9E\uDC95\uDC9F\uDC94\uDC9B\uDC9A\uDC99\uDC9C\uDDA4\uDCAF\uDCA2\uDCA5\uDCAB\uDCA6\uDCA8\uDCA3\uDCAC\uDCAD\uDCA4\uDC40\uDC45\uDC44\uDC8F\uDC91\uDC6A\uDC64\uDC65\uDC63\uDC35\uDC12\uDC36\uDC29\uDC3A\uDC31\uDC08\uDC2F\uDC05\uDC06\uDC34\uDC0E\uDC2E\uDC02-\uDC04\uDC37\uDC16\uDC17\uDC3D\uDC0F\uDC11\uDC10\uDC2A\uDC2B\uDC18\uDC2D\uDC01\uDC00\uDC39\uDC30\uDC07\uDC3B\uDC28\uDC3C\uDC3E\uDC14\uDC13\uDC23-\uDC27\uDC38\uDC0A\uDC22\uDC0D\uDC32\uDC09\uDC33\uDC0B\uDC2C\uDC1F-\uDC21\uDC19\uDC1A\uDC0C\uDC1B-\uDC1E\uDC90\uDCAE\uDD2A\uDDFE\uDDFB\uDC92\uDDFC\uDDFD\uDD4C\uDED5\uDD4D\uDD4B\uDC88\uDE82-\uDE8A\uDE9D\uDE9E\uDE8B-\uDE8E\uDE90-\uDE9C\uDEF5\uDEFA\uDEB2\uDEF4\uDEF9\uDE8F\uDEA8\uDEA5\uDEA6\uDED1\uDEA7\uDEF6\uDEA4\uDEA2\uDEEB\uDEEC\uDCBA\uDE81\uDE9F-\uDEA1\uDE80\uDEF8\uDD5B\uDD67\uDD50\uDD5C\uDD51\uDD5D\uDD52\uDD5E\uDD53\uDD5F\uDD54\uDD60\uDD55\uDD61\uDD56\uDD62\uDD57\uDD63\uDD58\uDD64\uDD59\uDD65\uDD5A\uDD66\uDD25\uDCA7\uDEF7\uDD2E\uDC53-\uDC62\uDC51\uDC52\uDCFF\uDC84\uDC8D\uDC8E\uDD07-\uDD0A\uDCE2\uDCE3\uDCEF\uDD14\uDD15\uDCFB\uDCF1\uDCF2\uDCDE-\uDCE0\uDD0B\uDD0C\uDCBB\uDCBD-\uDCC0\uDCFA\uDCF7-\uDCF9\uDCFC\uDD0D\uDD0E\uDCA1\uDD26\uDCD4-\uDCDA\uDCD3\uDCD2\uDCC3\uDCDC\uDCC4\uDCF0\uDCD1\uDD16\uDCB0\uDCB4-\uDCB8\uDCB3\uDCB9\uDCB1\uDCB2\uDCE7-\uDCE9\uDCE4-\uDCE6\uDCEB\uDCEA\uDCEC-\uDCEE\uDCDD\uDCBC\uDCC1\uDCC2\uDCC5-\uDCD0\uDD12\uDD13\uDD0F-\uDD11\uDD28\uDD2B\uDD27\uDD29\uDD17\uDD2C\uDD2D\uDCE1\uDC89\uDC8A\uDEAA\uDEBD\uDEBF\uDEC1\uDED2\uDEAC\uDDFF\uDEAE\uDEB0\uDEB9-\uDEBC\uDEBE\uDEC2-\uDEC5\uDEB8\uDEAB\uDEB3\uDEAD\uDEAF\uDEB1\uDEB7\uDCF5\uDD1E\uDD03\uDD04\uDD19-\uDD1D\uDED0\uDD4E\uDD2F\uDD00-\uDD02\uDD3C\uDD3D\uDD05\uDD06\uDCF6\uDCF3\uDCF4\uDD31\uDCDB\uDD30\uDD1F-\uDD24\uDD34\uDFE0-\uDFE2\uDD35\uDFE3-\uDFE5\uDFE7-\uDFE9\uDFE6\uDFEA\uDFEB\uDD36-\uDD3B\uDCA0\uDD18\uDD33\uDD32\uDEA9])|\uD83E(?:[\uDD1A\uDD0F\uDD1E\uDD1F\uDD18\uDD19\uDD1B\uDD1C\uDD32\uDD33\uDDB5\uDDB6\uDDBB\uDDD2](?:\uD83C[\uDFFB-\uDFFF])?|\uDDD1(?:(?:\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:\uD83E(?:\uDD1D\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFF]|[\uDDB0\uDDB1\uDDB3\uDDB2\uDDAF\uDDBC\uDDBD])|\u2695\uFE0F?|\uD83C[\uDF93\uDFEB\uDF3E\uDF73\uDFED\uDFA4\uDFA8]|\u2696\uFE0F?|\uD83D[\uDD27\uDCBC\uDD2C\uDCBB\uDE80\uDE92]|\u2708\uFE0F?))?)|\u200D(?:\uD83E(?:\uDD1D\u200D\uD83E\uDDD1|[\uDDB0\uDDB1\uDDB3\uDDB2\uDDAF\uDDBC\uDDBD])|\u2695\uFE0F?|\uD83C[\uDF93\uDFEB\uDF3E\uDF73\uDFED\uDFA4\uDFA8]|\u2696\uFE0F?|\uD83D[\uDD27\uDCBC\uDD2C\uDCBB\uDE80\uDE92]|\u2708\uFE0F?)))?|[\uDDD4\uDDD3](?:\uD83C[\uDFFB-\uDFFF])?|[\uDDCF\uDD26\uDD37](?:(?:\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?)|\u200D(?:[\u2642\u2640]\uFE0F?)))?|[\uDD34\uDDD5\uDD35\uDD30\uDD31\uDD36](?:\uD83C[\uDFFB-\uDFFF])?|[\uDDB8\uDDB9\uDDD9-\uDDDD](?:(?:\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?)|\u200D(?:[\u2642\u2640]\uFE0F?)))?|[\uDDDE\uDDDF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?|[\uDDCD\uDDCE\uDDD6\uDDD7\uDD38](?:(?:\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?)|\u200D(?:[\u2642\u2640]\uFE0F?)))?|\uDD3C(?:\u200D(?:[\u2642\u2640]\uFE0F?))?|[\uDD3D\uDD3E\uDD39\uDDD8](?:(?:\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?)|\u200D(?:[\u2642\u2640]\uFE0F?)))?|[\uDD23\uDD70\uDD29\uDD2A\uDD11\uDD17\uDD2D\uDD2B\uDD14\uDD10\uDD28\uDD25\uDD24\uDD12\uDD15\uDD22\uDD2E\uDD27\uDD75\uDD76\uDD74\uDD2F\uDD20\uDD73\uDD13\uDDD0\uDD7A\uDD71\uDD2C\uDD21\uDD16\uDDE1\uDD0E\uDD0D\uDD1D\uDDBE\uDDBF\uDDE0\uDDB7\uDDB4\uDD3A\uDDB0\uDDB1\uDDB3\uDDB2\uDD8D\uDDA7\uDDAE\uDD8A\uDD9D\uDD81\uDD84\uDD93\uDD8C\uDD99\uDD92\uDD8F\uDD9B\uDD94\uDD87\uDDA5\uDDA6\uDDA8\uDD98\uDDA1\uDD83\uDD85\uDD86\uDDA2\uDD89\uDDA9\uDD9A\uDD9C\uDD8E\uDD95\uDD96\uDD88\uDD8B\uDD97\uDD82\uDD9F\uDDA0\uDD40\uDD6D\uDD5D\uDD65\uDD51\uDD54\uDD55\uDD52\uDD6C\uDD66\uDDC4\uDDC5\uDD5C\uDD50\uDD56\uDD68\uDD6F\uDD5E\uDDC7\uDDC0\uDD69\uDD53\uDD6A\uDD59\uDDC6\uDD5A\uDD58\uDD63\uDD57\uDDC8\uDDC2\uDD6B\uDD6E\uDD5F-\uDD61\uDD80\uDD9E\uDD90\uDD91\uDDAA\uDDC1\uDD67\uDD5B\uDD42\uDD43\uDD64\uDDC3\uDDC9\uDDCA\uDD62\uDD44\uDDED\uDDF1\uDDBD\uDDBC\uDE82\uDDF3\uDE90\uDDE8\uDDE7\uDD47-\uDD49\uDD4E\uDD4F\uDD4D\uDD4A\uDD4B\uDD45\uDD3F\uDD4C\uDE80\uDE81\uDDFF\uDDE9\uDDF8\uDDF5\uDDF6\uDD7D\uDD7C\uDDBA\uDDE3-\uDDE6\uDD7B\uDE71-\uDE73\uDD7E\uDD7F\uDE70\uDDE2\uDE95\uDD41\uDDEE\uDE94\uDDFE\uDE93\uDDAF\uDDF0\uDDF2\uDDEA-\uDDEC\uDE78-\uDE7A\uDE91\uDE92\uDDF4\uDDF7\uDDF9-\uDDFD\uDDEF])|[\u263A\u2639\u2620\u2763\u2764]\uFE0F?|\u270B(?:\uD83C[\uDFFB-\uDFFF])?|[\u270C\u261D](?:(?:\uD83C[\uDFFB-\uDFFF]|\uFE0F))?|\u270A(?:\uD83C[\uDFFB-\uDFFF])?|\u270D(?:(?:\uD83C[\uDFFB-\uDFFF]|\uFE0F))?|\uD83C(?:\uDF85(?:\uD83C[\uDFFB-\uDFFF])?|\uDFC3(?:(?:\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?)|\u200D(?:[\u2642\u2640]\uFE0F?)))?|[\uDFC7\uDFC2](?:\uD83C[\uDFFB-\uDFFF])?|\uDFCC(?:(?:\uFE0F(?:\u200D(?:[\u2642\u2640]\uFE0F?))?|\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?)|\u200D(?:[\u2642\u2640]\uFE0F?)))?|[\uDFC4\uDFCA](?:(?:\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?)|\u200D(?:[\u2642\u2640]\uFE0F?)))?|\uDFCB(?:(?:\uFE0F(?:\u200D(?:[\u2642\u2640]\uFE0F?))?|\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?)|\u200D(?:[\u2642\u2640]\uFE0F?)))?|[\uDFF5\uDF36\uDF7D\uDFD4-\uDFD6\uDFDC-\uDFDF\uDFDB\uDFD7\uDFD8\uDFDA\uDFD9\uDFCE\uDFCD\uDF21\uDF24-\uDF2C\uDF97\uDF9F\uDF96\uDF99-\uDF9B\uDF9E\uDFF7\uDD70\uDD71\uDD7E\uDD7F\uDE02\uDE37]\uFE0F?|\uDFF4(?:(?:\u200D\u2620\uFE0F?|\uDB40\uDC67\uDB40\uDC62\uDB40(?:\uDC65\uDB40\uDC6E\uDB40\uDC67\uDB40\uDC7F|\uDC73\uDB40\uDC63\uDB40\uDC74\uDB40\uDC7F|\uDC77\uDB40\uDC6C\uDB40\uDC73\uDB40\uDC7F)))?|\uDFF3(?:(?:\uFE0F(?:\u200D\uD83C\uDF08)?|\u200D\uD83C\uDF08))?|\uDDE6\uD83C[\uDDE8-\uDDEC\uDDEE\uDDF1\uDDF2\uDDF4\uDDF6-\uDDFA\uDDFC\uDDFD\uDDFF]|\uDDE7\uD83C[\uDDE6\uDDE7\uDDE9-\uDDEF\uDDF1-\uDDF4\uDDF6-\uDDF9\uDDFB\uDDFC\uDDFE\uDDFF]|\uDDE8\uD83C[\uDDE6\uDDE8\uDDE9\uDDEB-\uDDEE\uDDF0-\uDDF5\uDDF7\uDDFA-\uDDFF]|\uDDE9\uD83C[\uDDEA\uDDEC\uDDEF\uDDF0\uDDF2\uDDF4\uDDFF]|\uDDEA\uD83C[\uDDE6\uDDE8\uDDEA\uDDEC\uDDED\uDDF7-\uDDFA]|\uDDEB\uD83C[\uDDEE-\uDDF0\uDDF2\uDDF4\uDDF7]|\uDDEC\uD83C[\uDDE6\uDDE7\uDDE9-\uDDEE\uDDF1-\uDDF3\uDDF5-\uDDFA\uDDFC\uDDFE]|\uDDED\uD83C[\uDDF0\uDDF2\uDDF3\uDDF7\uDDF9\uDDFA]|\uDDEE\uD83C[\uDDE8-\uDDEA\uDDF1-\uDDF4\uDDF6-\uDDF9]|\uDDEF\uD83C[\uDDEA\uDDF2\uDDF4\uDDF5]|\uDDF0\uD83C[\uDDEA\uDDEC-\uDDEE\uDDF2\uDDF3\uDDF5\uDDF7\uDDFC\uDDFE\uDDFF]|\uDDF1\uD83C[\uDDE6-\uDDE8\uDDEE\uDDF0\uDDF7-\uDDFB\uDDFE]|\uDDF2\uD83C[\uDDE6\uDDE8-\uDDED\uDDF0-\uDDFF]|\uDDF3\uD83C[\uDDE6\uDDE8\uDDEA-\uDDEC\uDDEE\uDDF1\uDDF4\uDDF5\uDDF7\uDDFA\uDDFF]|\uDDF4\uD83C\uDDF2|\uDDF5\uD83C[\uDDE6\uDDEA-\uDDED\uDDF0-\uDDF3\uDDF7-\uDDF9\uDDFC\uDDFE]|\uDDF6\uD83C\uDDE6|\uDDF7\uD83C[\uDDEA\uDDF4\uDDF8\uDDFA\uDDFC]|\uDDF8\uD83C[\uDDE6-\uDDEA\uDDEC-\uDDF4\uDDF7-\uDDF9\uDDFB\uDDFD-\uDDFF]|\uDDF9\uD83C[\uDDE6\uDDE8\uDDE9\uDDEB-\uDDED\uDDEF-\uDDF4\uDDF7\uDDF9\uDDFB\uDDFC\uDDFF]|\uDDFA\uD83C[\uDDE6\uDDEC\uDDF2\uDDF3\uDDF8\uDDFE\uDDFF]|\uDDFB\uD83C[\uDDE6\uDDE8\uDDEA\uDDEC\uDDEE\uDDF3\uDDFA]|\uDDFC\uD83C[\uDDEB\uDDF8]|\uDDFD\uD83C\uDDF0|\uDDFE\uD83C[\uDDEA\uDDF9]|\uDDFF\uD83C[\uDDE6\uDDF2\uDDFC]|[\uDFFB-\uDFFF\uDF38-\uDF3C\uDF37\uDF31-\uDF35\uDF3E-\uDF43\uDF47-\uDF53\uDF45\uDF46\uDF3D\uDF44\uDF30\uDF5E\uDF56\uDF57\uDF54\uDF5F\uDF55\uDF2D-\uDF2F\uDF73\uDF72\uDF7F\uDF71\uDF58-\uDF5D\uDF60\uDF62-\uDF65\uDF61\uDF66-\uDF6A\uDF82\uDF70\uDF6B-\uDF6F\uDF7C\uDF75\uDF76\uDF7E\uDF77-\uDF7B\uDF74\uDFFA\uDF0D-\uDF10\uDF0B\uDFE0-\uDFE6\uDFE8-\uDFED\uDFEF\uDFF0\uDF01\uDF03-\uDF07\uDF09\uDFA0-\uDFA2\uDFAA\uDF11-\uDF20\uDF0C\uDF00\uDF08\uDF02\uDF0A\uDF83\uDF84\uDF86-\uDF8B\uDF8D-\uDF91\uDF80\uDF81\uDFAB\uDFC6\uDFC5\uDFC0\uDFD0\uDFC8\uDFC9\uDFBE\uDFB3\uDFCF\uDFD1-\uDFD3\uDFF8\uDFA3\uDFBD\uDFBF\uDFAF\uDFB1\uDFAE\uDFB0\uDFB2\uDCCF\uDC04\uDFB4\uDFAD\uDFA8\uDF92\uDFA9\uDF93\uDFBC\uDFB5\uDFB6\uDFA4\uDFA7\uDFB7-\uDFBB\uDFA5\uDFAC\uDFEE\uDFF9\uDFE7\uDFA6\uDD8E\uDD91-\uDD9A\uDE01\uDE36\uDE2F\uDE50\uDE39\uDE1A\uDE32\uDE51\uDE38\uDE34\uDE33\uDE3A\uDE35\uDFC1\uDF8C])|\u26F7\uFE0F?|\u26F9(?:(?:\uFE0F(?:\u200D(?:[\u2642\u2640]\uFE0F?))?|\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?)|\u200D(?:[\u2642\u2640]\uFE0F?)))?|[\u2618\u26F0\u26E9\u2668\u26F4\u2708\u23F1\u23F2\u2600\u2601\u26C8\u2602\u26F1\u2744\u2603\u2604\u26F8\u2660\u2665\u2666\u2663\u265F\u26D1\u260E\u2328\u2709\u270F\u2712\u2702\u26CF\u2692\u2694\u2699\u2696\u26D3\u2697\u26B0\u26B1\u26A0\u2622\u2623\u2B06\u2197\u27A1\u2198\u2B07\u2199\u2B05\u2196\u2195\u2194\u21A9\u21AA\u2934\u2935\u269B\u2721\u2638\u262F\u271D\u2626\u262A\u262E\u25B6\u23ED\u23EF\u25C0\u23EE\u23F8-\u23FA\u23CF\u2640\u2642\u2695\u267E\u267B\u269C\u2611\u2714\u2716\u303D\u2733\u2734\u2747\u203C\u2049\u3030\u00A9\u00AE\u2122]\uFE0F?|[\u0023\u002A\u0030-\u0039](?:\uFE0F\u20E3|\u20E3)|[\u2139\u24C2\u3297\u3299\u25FC\u25FB\u25AA\u25AB]\uFE0F?|[\u2615\u26EA\u26F2\u26FA\u26FD\u2693\u26F5\u231B\u23F3\u231A\u23F0\u2B50\u26C5\u2614\u26A1\u26C4\u2728\u26BD\u26BE\u26F3\u267F\u26D4\u2648-\u2653\u26CE\u23E9-\u23EC\u2B55\u2705\u274C\u274E\u2795-\u2797\u27B0\u27BF\u2753-\u2755\u2757\u26AB\u26AA\u2B1B\u2B1C\u25FE\u25FD])/g;
    return ((str || '').match(EmojiPattern) || []).length;
  }

  let toastColor = 'primary';
  let toastMessage = '';
  let toastPosition;
  let toastIsOpen = false;

  function toast(message, color = 'primary') {

    toastMessage = message;
    toastColor = color;
    toggle()

  }

  const toggle = () => (toastIsOpen = !toastIsOpen);

  let dialog;
  let dialogText;

  function showModal(message, callback){

    dialogText = message

    const callbakckFn = function(evt){
      if (dialog.returnValue === 'true') {
        callback();
      }

      dialog.removeEventListener('close', callbakckFn)
    }

    dialog.addEventListener('close', callbakckFn)

    dialog.showModal();
  }

  export let data;

  alarmCount.update(alarmCount => data.alarmCount);

  let visibleReply;

  $: commentData = data.article.comments;

  onMount(()=>{

    const hash = $page.url.searchParams.get('a');

    if(hash){
      const el = document.querySelector(`#${hash}`);
      setTimeout(()=> el.scrollIntoView({behavior: 'smooth', block: 'center', inline: 'center'}) , 500)
    }

    if(data.insta){
      setTimeout(()=>  instgrm.Embeds.process(), 1000)
    }
  })

</script>

<main class="container my-md-5">

  <Dialog bind:dialog>
    {dialogText}
  </Dialog>

  <div class="d-flex justify-content-{toastColor==='primary'?'end':'center'} w-100 p-0 m-0">
    <Toast
      autohide
      isOpen={toastIsOpen}
      delay={toastColor==='primary'?1200:2500}
      on:close={() => (toastIsOpen = false)}
      class="position-fixed {toastColor==='primary'?'top-0':'bottom-50'} z-3 mt-5"
    >
      <ToastHeader icon={toastColor} {toggle}>dgst.site</ToastHeader>
      <ToastBody class="bg-light bg-opacity-50 text-dark">{toastMessage}</ToastBody>
    </Toast>
  </div>

  <Row class="mt-4 shadow rounded-bottom-4 p-1 m-0">
    <Row class="border-bottom border-secondary-subtle pt-2 p-0 m-0">

    <h5 class="ps-2">{data.article.title}</h5>
      <Col md="6" xs="8" class="px-2"
      >{data.article.nickname}
        <span class="text-muted ps-1"
              style="font-size: small">{formatISO9075(parseISO(data.article.createdAt))}</span></Col
      >
      <Col class="text-end text-muted" md="6" xs="4" style="font-size: small">
        <Icon class="pe-1" name="eye"/>{data.article.read}
        <Icon class="text-success pe-1" name="hand-thumbs-up"/>{data.article.like}</Col
      >
    </Row>
    <Row class="py-3 px-2 mx-0">
      <CardText style="max-width: 100%;" class="text-break px-2">
        {@html data.article.content}
      </CardText>
    </Row>
    <Row class="p-md-3 p-xs-1 mb-3 mx-0">
      <!--프로필-->
      <Card class="p-2">
        <Row class="g-1 d-flex align-items-center">
          <Col xs="auto">
            <Image
              alt="프로필 사진"
              class="card-img-left rounded-start"
              src={data.photo}
              fluid
              style="max-height: 100px;max-width:100px"
            />
          </Col>
          <Col>
            <CardBody class="px-2">
              <CardSubtitle>{data.article.nickname}</CardSubtitle>
              <CardText class="text-muted pt-2">
                <pre style="white-space: pre-line">{data.introduction}</pre>
              </CardText>
            </CardBody>
          </Col>
        </Row>
      </Card>
    </Row>
    <Row class="mx-0">
      <!--버튼-->
      <Col class="text-end pe-md-3 p-xs-0 m-xs-0">
        {#if data.article.email === $page.data.session?.user.email}
          <Button color="danger" on:click={() => remove(data.article._id)} class="ps-1 pe-2">
            <Icon name="trash"/>
            삭제
          </Button>
          <Button color="success" on:click={() => edit(data.article._id)} class="ps-1 pe-2">
            <Icon name="pencil"/>
            수정
          </Button>
        {/if}
        <Button color="primary" on:click|once={like} class="px-3" disabled={data.article.liked}>
          <Icon name={data.article.liked?"hand-thumbs-up-fill":"hand-thumbs-up"}/>
          {data.article.like}
        </Button>
        <Button color="secondary" on:click={list} class="ps-1 pe-2">
          <Icon name="list"/>
          목록
        </Button>
      </Col>
    </Row>
    <Row class="my-3 bg-warning-subtle p-2 rounded-3 mb-1 mx-0">
      <!--리플-->
      <Col>
        <Icon name="chat"/>
        의견남기기
        <Badge color="primary">{commentData.length}</Badge>
      </Col>
      <Col class="text-end">
        <Button class="fw-bolder py-0" on:click={comments} outline>
          <Icon name="arrow-repeat"/>
        </Button>
      </Col>
    </Row>

    <Row class="mb-5 mx-0">

      {#each commentData as comment}
        <Row class="pt-3 pb-2 px-0 border-bottom border-gray-subtle mx-0" id='cmt{comment.id}'>
          {#if comment.parentCommentNickname}
            <Col xs="auto" class="m-0 pe-1">
              <Icon name="arrow-return-right" class="text-success"></Icon>
            </Col>
          {/if}

            <Col class="p-0 m-0">
              <Row class="mx-0">

          {#if comment.photo}

            <Col xs="auto m-0 p-0">
              <Card class="p-0 border-0">
                <Row class="g-1 mx-0">
                  <Col xs="auto">
                    <Image
                      alt="프로필 사진"
                      class="card-img-left rounded-start"
                      style="max-height: 40px"
                      src={comment.photo}
                      fluid
                    />
                  </Col>
                  <Col xs="auto">
                    <CardBody class="px-1 py-1 border-0">
                      <CardSubtitle>{comment.nickname}</CardSubtitle>
                      <CardText class="text-muted text-break" style="font-size:smaller">
                        {formatDistanceToNowStrict(parseISO(comment.createdAt), {
                          locale: ko,
                          addSuffix: true
                        })}
                      </CardText>
                    </CardBody>
                  </Col>
                </Row>
              </Card>
            </Col>
          {:else}
            <Col xs="auto" clsss="border-end p-0">
              {comment.nickname}
              <span class="text-muted ps-2" style="font-size: smaller"
              >{formatDistanceToNowStrict(parseISO(comment.createdAt), {
                locale: ko,
                addSuffix: true
              })}</span
              >
            </Col>
          {/if}

          <Col xs="12" md="*" class="mt-2 mt-md-0 p-0">
            <Row class="mx-0">
              <Col class="text-break p-0 m-0" style="max-width: 98%">
                {#if comment.image}
                  <Row class="pb-3 mx-0">
                    <Col class="p-0 ps-1 m-0">
                      <Image src={comment.image} alt="리플 짤" style="max-width: 100%;"/>
                    </Col>
                  </Row>
                {/if}

                {#if !/[0-9a-zA-Z가-힣_-]/.test(comment.content) && countEmojis(comment.content) === 1}
                  {#if comment.parentCommentNickname}
                    <span class="text-bg-secondary p-1 rounded-2 align-top"
                          style="font-size: small"><span
                      class="text-warning">@</span>{comment.parentCommentNickname}</span>
                  {/if}
                  <span class="display-1">{comment.content}</span>
                {:else}
                  {#if comment.state !== 'write'}
                    <div class="px-2 text-muted"><em>{comment.content}</em></div>
                  {:else}
                    <div class="px-2">
                      {#if comment.parentCommentNickname}
                      <span class="text-bg-secondary p-1 rounded-2"
                            style="font-size: small"><span
                        class="text-warning">@</span>{comment.parentCommentNickname}</span>
                      {/if}{@html viewComment(comment.content)}</div>
                  {/if}
                {/if}
              </Col>

                </Row>

              </Col>
            </Row>

              {#if $page.data.session?.user.nickname && comment.state === 'write'}
                <Row class="mt-2">
                  <Col class="text-end pe-2 m-0">
                    {#if comment.email === $page.data.session?.user.email}
                      <Button
                        on:click={() => deleteComment(comment._id)}
                        size="sm"
                        outline
                        color="danger px-2 py-0"
                      >
                        <Icon name="trash"/>
                        삭제
                      </Button>
                      <Button size="sm" outline color="primary" class="d-none p-0">
                        <Icon name="pencil"/>
                        수정
                      </Button>
                    {/if}
                    <Button
                      on:click|once={() => likeComment(comment.id)}
                      size="sm"
                      outline
                      color="success"
                      disabled={comment.liked}
                      class="px-3 py-0"
                    >
                      <Icon name={comment.liked?"hand-thumbs-up-fill":"hand-thumbs-up"}/>
                      {comment.like}
                    </Button>
                    <Button
                      on:click={() => visibleReply = comment._id}
                      size="sm"
                      outline
                      color="info px-2 py-0"
                    >
                      <Icon name="chat-square-dots"/>
                      답글
                    </Button>
                  </Col>
                </Row>
              {/if}

          </Col>
        </Row>

        <!-- 대댓글 -->
        {#if visibleReply === comment._id}
          <div transition:scale
               class="mt-2 mx-0 border-bottom border-secondary-subtle bg-secondary bg-opacity-25">
            <div class="border p-3 mb-2 rounded-4 shadow-sm" bind:this={reCommentDiv}>
              <Loader
                bind:active={commentLoading}
                container={reCommentDiv}
                component="Dot"
                opacity="0.7"
              />
              <InputGroup class="mb-2">

                <input
                  type="file"
                  bind:this={reCommentImageEl}
                  on:change={(evt)=>preview(evt, rePreviewEl)}
                  muliple="false"
                  accept="image/*"
                  class="form-control m-2"
                />
              </InputGroup>

              <div>
                <img
                  src=""
                  class="d-none"
                  bind:this={rePreviewEl}
                  alt="리플 이미지 첨부 미리보기"
                  style="max-width: 100%"
                />
              </div>

              <InputGroup>
                <textarea
                  bind:value={reCommentContent}
                  on:paste={(evt)=>preview(evt, rePreviewEl)}
                  class="form-control border border-gray rounded-start-3"
                  rows="3"
                />
                <Button color="primary" outline on:click={()=>writeComment(comment._id)}>
                  <Icon name="pencil-fill"/>
                  등록
                </Button>
              </InputGroup>
            </div>
          </div>
        {/if}
      {/each}

      {#if $page.data.session?.user.nickname}
        <div class="border p-3 rounded-4 shadow-sm mt-3" bind:this={commentDiv}>
          <Loader
            bind:active={commentLoading}
            container={commentDiv}
            component="Dot"
            opacity="0.7"
          />
          <InputGroup class="mb-2">

            <input
              type="file"
              bind:this={commentImageEl}
              on:change={(evt)=>preview(evt, previewEl)}
              muliple="false"
              accept="image/*"
              class="form-control m-2"
            />
          </InputGroup>
          <div>
            <img
              src=""
              class="img-thumbnail d-none me-2"
              bind:this={previewEl}
              alt="리플 이미지 첨부 미리보기"
              style="max-width: 100%"
            />
          </div>
          <InputGroup>

            <textarea
              bind:value={commentContent}
              on:paste={(evt)=>preview(evt, previewEl)}
              class="form-control border border-gray rounded-start-3"
              rows="3"
            />
            <Button color="primary" outline on:click={()=>writeComment()} class="z-2">
              <Icon name="pencil-fill"/>
              등록
            </Button>
          </InputGroup>
        </div>
      {/if}

    </Row>
    <Row class="mx-0 mb-3">
      <!--버튼-->
      <Col class="text-end pe-1">
        {#if data.article.email === $page.data.session?.user.email}
          <Button class="ps-1 pe-2" color="danger" on:click={() => remove(data.article._id)}>
            <Icon name="trash"/>
            삭제
          </Button>
          <Button class="ps-1 pe-2" color="success" on:click={() => edit(data.article._id)}>
            <Icon name="pencil"/>
            수정
          </Button>
        {/if}
        <Button class="ps-1 pe-2" color="primary" on:click={write}>
          <Icon name="pencil-fill"/>
          글쓰기
        </Button>
        <Button class="ps-1 pe-2 " color="secondary" on:click={list}>
          <Icon name="list"/>
          목록
        </Button>
      </Col>
    </Row>

  </Row>

  <!-- 목록-->
  <Row class="mt-4 shadow rounded-4 p-1 m-0">

    {#each data.articles as article}

      {#if article._id === $page.params.articleId}
        <Row class="p-2 border-bottom border-secondary-subtle m-0 bg-secondary bg-opacity-25">
          <Col lg="7" md="5" xs="12"
               class="text-break link-opacity-hover-50 pb-1 position-relative">
            <Icon name="arrow-right-circle-fill" class="text-info"/>
            {article.title}
            {@html article.content}
            {#if article.comment}
              {#if article.isNewComment}
                <Badge color="warning" class="bg-opacity-50">{article.comment}</Badge>
              {:else}
                <Badge color="primary" class="bg-opacity-50">{article.comment}</Badge>
              {/if}
            {/if}
          </Col>
          <Col lg="2" md="2" xs="5" class="text-muted" style="font-size: small">{article.nickname}</Col>
          <Col lg="1" md="1" xs="1" class="text-muted text-end" style="font-size: small">{article.read}</Col>
          <Col lg="1" md="1" xs="2" class="text-muted text-end" style="font-size: small"
          ><Icon name="hand-thumbs-up" class="text-success pe-" />{article.like}</Col
          >
          <Col lg="1" md="2" xs="4" class="text-muted text-end" style="font-size: small"
          >{formatDistanceToNowStrict(parseISO(article.createdAt), {
            locale: ko,
            addSuffix: true
          })}</Col
          >
        </Row>

      {:else}

      <Row class="p-2 border-bottom border-secondary-subtle m-0">
        <Col lg="7" md="5" xs="12"
        class="text-break link-opacity-hover-50 pb-1 position-relative">

          <a data-sveltekit-preload-data="tap" data-sveltekit-invalidate="all"
             href={`/board/${$page.params.boardId}/${$page.params.pageNo || 1}/${article._id}`}
             style="cursor: pointer; font-size: 1.1em"
             class="link-underline link-underline-opacity-0 link-offset-2 link-underline-opacity-50-hover stretched-link">
            {article.title}
            {@html article.content}
            {#if article.comment}
              {#if article.isNewComment}
                <Badge color="warning" class="bg-opacity-50">{article.comment}</Badge>
              {:else}
                <Badge color="primary" class="bg-opacity-50">{article.comment}</Badge>
              {/if}
            {/if}
          </a>
        </Col>
        <Col lg="2" md="2" xs="5" class="text-muted" style="font-size: small">{article.nickname}</Col>
        <Col lg="1" md="1" xs="1" class="text-muted text-end" style="font-size: small">{article.read}</Col>
        <Col lg="1" md="1" xs="2" class="text-muted text-end" style="font-size: small"
        ><Icon name="hand-thumbs-up" class="text-success pe-" />{article.like}</Col
        >
        <Col lg="1" md="2" xs="4" class="text-muted text-end" style="font-size: small"
        >{formatDistanceToNowStrict(parseISO(article.createdAt), {
            locale: ko,
            addSuffix: true
        })}</Col
        >
      </Row>
      {/if}
    {/each}
    {#if data.maxPage>1}
        <Row class="mt-3 mx-0">
            <Col xs="12">
                <Pagination size="md" arialabel="페이지 네이션" class="d-flex justify-content-center">
                    <PaginationItem
                    ><PaginationLink first href="#top" on:click={()=>gopage(1)} /></PaginationItem
                    >
                    {#each Array((data.endNo - data.startNo +1)) as _, i}
                        <PaginationItem
                                active={(!data.pageNo && (data.startNo -i) === 1) || (i + data.startNo) == data.pageNo}
                        >
                            <PaginationLink href="#top" on:click={()=>gopage(i + data.startNo)}>
                                {i + data.startNo}
                            </PaginationLink>
                        </PaginationItem>
                    {/each}
                    <PaginationItem
                    ><PaginationLink href="#top"
                                     last
                                     on:click={()=>gopage(data.maxPage)}
                    /></PaginationItem
                    >
                </Pagination>
            </Col>
        </Row>
    {/if}
    {#if $page.data.session?.user.nickname}
      <Row class="px-0 mx-0 pe-3 pb-4 mt-2">
        <Col class="d-flex justify-content-end p-0">
          <Button class="px-2" color="primary" on:click={write}>
            <Icon name="pencil-fill" class="pe-2 " />글쓰기
          </Button>
        </Col>
      </Row>
    {/if}
    </Row>

</main>

<style>
    a:visited{
        color: var(--bs-gray);
    }
</style>


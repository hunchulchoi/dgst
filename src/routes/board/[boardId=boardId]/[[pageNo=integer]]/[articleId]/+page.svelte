<svelte:head>
  <!-- Open Graph 메타 태그 -->
  <title>{data.article.title} - dgst.me</title>
  <meta name="description" content={`${data.article.nickname} - ${data.article.content.replace(/<[^>]*>/g, '').substring(0, 20)}`} />
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="article" />
  <meta property="og:url" content="https://www.dgst.me/board/{boardId}/{data.article._id}" />
  <meta property="og:title" content={`${data.article.title} - ${data.article.nickname}`} />
  <meta property="og:description" content={`${data.article.content.replace(/<[^>]*>/g, '').substring(0, 20)}`} />
  <meta property="og:image" content="https://www.dgst.me/logo/twitter_header_photo_2.png" />
  <meta property="og:site_name" content="dgst.me" />
  
  <!-- Twitter -->
  <meta property="twitter:card" content="summary_large_image" />
  <meta property="twitter:url" content="https://www.dgst.me/board/{boardId}/{data.article._id}" />
  <meta property="twitter:title" content={`${data.article.title} - ${data.article.nickname}`} />
  <meta property="twitter:description" content={`${data.article.content.replace(/<[^>]*>/g, '').substring(0, 20)}`} />
  <meta property="twitter:image" content="https://www.dgst.me/logo/twitter_header_photo_2.png" />
  
  <script defer src="https://platform.instagram.com/en_US/embeds.js"></script>
  <script defer src="//www.tiktok.com/embed.js"></script>
  <style>

      .image img {
          max-width: 100% !important;
          max-height: 50vh !important;
      }

      .card-text img {
          max-width: 100%;  
      }

      .card-text a {
          pointer-events: auto !important;
          cursor: pointer !important;
      }

      figure{
        max-width: 100% !important;
      }

      @keyframes likeBounce {
        0%, 100% {
          transform: scale(1);
        }
        25% {
          transform: scale(1.3);
        }
        50% {
          transform: scale(0.9);
        }
      }

      .like-animation {
        animation: likeBounce 0.6s ease;
      }

  </style>

  <script>
    window.onload = function(){

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
    InputGroup,
    Row,
    Toast,
    ToastBody,
    ToastHeader
  } from '@sveltestrap/sveltestrap';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { scale } from 'svelte/transition';

  import { formatDistanceToNowStrict, formatISO9075, parseISO } from 'date-fns';
  import { ko } from 'date-fns/locale';

  import { blobToWebP } from 'webp-converter-browser';
  import Swal from 'sweetalert2';

  import { alarmCount } from '$lib/util/store.js';
  import { viewComment } from '$lib/util/embeder.js';
  import Dialog from '$lib/components/dialog.svelte';
  import { onMount } from 'svelte';
  import BoardList from '$lib/components/board_list.svelte';
  import OGPreview from '$lib/components/OGPreview.svelte';
  import sanitizeHtml from 'sanitize-html';

  // Svelte 5 Runes - Props
  let { data } = $props();
  
  const { boardId, articleId, pageNo } = $page.params;

  // 애니메이션 관련 상태
  let likeAnimation = $state(false);
  let commentLikeAnimations = $state(new Set());

  // 댓글 좋아요 애니메이션 함수
  function triggerLikeAnimation(commentId) {
    commentLikeAnimations.add(commentId);
    setTimeout(() => {
      commentLikeAnimations.delete(commentId);
    }, 1000);
  }

  function like(){
    likeAnimation = true;
    fetch(`/board/${boardId}/${articleId}/like`, {method: 'POST'})
      .then((res) => res.json())
      .then((d) => {
        articleLike = d.like;
        articleLiked = d.liked;
        setTimeout(() => {
          likeAnimation = false;
        }, 600);
      });
  }

  async function likeComment(commentId){
    try {
      const response = await fetch(`/board/${boardId}/${articleId}/like/${commentId}`, {method: 'POST'});
      const updatedComment = await response.json();
      
      // 개별 댓글만 업데이트
      commentData = commentData.map(comment => {
        if (comment._id === commentId) {
          return {
            ...comment,
            like: updatedComment.like,
            liked: updatedComment.liked
          };
        }
        return comment;
      });
      
      // 좋아요 애니메이션 트리거
      triggerLikeAnimation(commentId);
    } catch (error) {
      console.error('댓글 좋아요 실패:', error);
    }
  }

  function comments() {
    console.log('🔄 댓글 새로고침 시작:', `/board/${boardId}/${articleId}/comment`);
    fetch(`/board/${boardId}/${articleId}/comment`)
      .then((res) => {
        console.log('✅ 댓글 응답:', res.status);
        return res.json();
      })
      .then((d) => {
        console.log('📝 댓글 데이터:', d.length, '개');
        // $state 직접 업데이트
        commentData = d;
      })
      .catch((err) => {
        console.error('❌ 댓글 새로고침 실패:', err);
      });
  }

  function list() {
    const currentPageNo = pageNo || 1;

    goto(`/board/${boardId}/${currentPageNo}`, {invalidateAll: true, replaceState: true});
  }

  async function preview(event, el) {

    if(event.type === 'paste'){

        /*console.log('event.clipboardData.files', event.clipboardData.files)
        console.log('event.clipboardData.files[0]', event.clipboardData.files[0])
        console.log('event.clipboardData.files[0].type', event.clipboardData.files[0].type)*/

      if(event.clipboardData.files?.length && event.clipboardData.files[0].type.startsWith('image')){

        commentImage = event.clipboardData.files[0];

        event.preventDefault();
      }else return;

    }else commentImage = event.target.files[0];

    if (commentImage) {
      el.src = window.URL.createObjectURL(commentImage);
    }

    el.onload = async (evt) => {
      commentLoading = true;

      //console.log('commentImage.type', commentImage.type)

      if (commentImage && !commentImage.type.endsWith('gif') && !commentImage.type.endsWith('webp')) {
          const webp = await convertToWebPWithOrientation(commentImage, {width: 1400});
          commentImage = new File([webp], commentImage.name);
      }

      // WebP 변환 시 이미 회전이 적용됨

      el.style.maxHeight = getImageMaxHeight(el);
      el.classList.remove('d-none');

      commentLoading = false;
    };
  }


  let reCommentDiv;
  let reCommentContent = $state('');
  let rePreviewEl;
  let reCommentImageEl;

  let commentDiv;
  let commentContent = $state('');
  let commentImage = $state(null);
  let previewEl;
  let commentImageEl;

  let commentLoading = $state(false);

  // 댓글 수정 관련 상태
  let editingCommentId = $state('');
  let editCommentContent = $state('');
  let editCommentImage = $state(null);
  let editPreviewEl;
  let editCommentImageEl;

  async function writeComment(parentCommentId) {

    //console.log(commentContent, parentCommentId, reCommentContent)

    if ((!parentCommentId && !commentContent) || (parentCommentId && !reCommentContent)) {
      toast('내용을 입력하세요', 'warning');
      return;
    }
    
    // 댓글 저장 시작 시 즉시 오버레이 표시
    console.log('🔄 댓글 저장 시작 - commentLoading:', commentLoading);
    commentLoading = true;
    console.log('✅ commentLoading = true로 설정');

    const formData = new FormData();

    if (!parentCommentId) {
      formData.append('content', commentContent);
      if (commentImage) formData.append('image', commentImage);
    } else {
      formData.append('content', reCommentContent);
      formData.append('parentCommentId', parentCommentId);
      if (commentImage) formData.append('image', commentImage);
    }

    fetch(`/board/${boardId}/${articleId}/comment`, {
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
        commentImage = null;
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
        console.error('❌ 댓글 저장 실패:', error);
        toast(error.message ?? '저장 중 오류가 발생했습니다.', 'danger');
      })
      .finally(() => {
        console.log('🏁 댓글 저장 완료 - commentLoading을 false로 설정');
        commentLoading = false;
      });
  }

  function deleteComment(commentId) {

    Swal.fire({
      title: '삭제 하시겠습니까?',
      text: '삭제 하시겠습니까?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: '삭제'
    }).then((result) => {
      if (result.isConfirmed) {
        fetch(`/board/${boardId}/${articleId}/comment`, {
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

          Swal.fire({
            title: '삭제 중 오류가 발생했습니다.',
            text: err.message ?? '삭제 중 오류가 발생했습니다.',
            icon: 'error',
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: '확인'
          });
        });
      }
    })

  }

  // 댓글 수정 시작
  function startEditComment(comment) {
    editingCommentId = comment._id;
    editCommentContent = comment.content;
    editCommentImage = null;
    
    // DOM이 업데이트된 후 미리보기 설정
    setTimeout(() => {
      if (editPreviewEl) {
        if (comment.image) {
          editPreviewEl.src = comment.image;
          editPreviewEl.classList.remove('d-none');
        } else {
          editPreviewEl.src = '';
          editPreviewEl.classList.add('d-none');
        }
      }
    }, 0);
  }

  // 댓글 수정 취소
  function cancelEditComment() {
    editingCommentId = '';
    editCommentContent = '';
    editCommentImage = null;
    if (editCommentImageEl) editCommentImageEl.value = '';
    if (editPreviewEl) {
      editPreviewEl.src = '';
      editPreviewEl.classList.add('d-none');
    }
  }

  // 댓글 수정 저장
  async function saveEditComment() {
    if (!editCommentContent.trim()) {
      toast('내용을 입력하세요', 'warning');
      return;
    }

    commentLoading = true;

    const formData = new FormData();
    formData.append('content', editCommentContent);
    formData.append('commentId', editingCommentId);
    
    // 새 이미지가 있으면 추가, 없으면 기존 이미지 유지
    if (editCommentImage) {
      formData.append('image', editCommentImage);
    }

    try {
      const response = await fetch(`/board/${boardId}/${articleId}/comment`, {
        method: 'PUT',
        body: formData
      });

      if (response.status !== 200) {
        const {message} = await response.json();
        toast(message, 'danger');
        return;
      }

      toast('댓글이 수정되었습니다.');
      cancelEditComment();
      comments();
    } catch (error) {
      console.error('댓글 수정 실패:', error);
      toast('댓글 수정 중 오류가 발생했습니다.', 'danger');
    } finally {
      commentLoading = false;
    }
  }

  // 댓글 이미지 삭제
  function removeEditCommentImage() {
    editCommentImage = null;
    if (editCommentImageEl) editCommentImageEl.value = '';
    if (editPreviewEl) {
      editPreviewEl.src = '';
      editPreviewEl.classList.add('d-none');
    }
  }

  // 댓글 이미지 미리보기
  function previewEditImage(event, el) {
    if (event.type === 'paste') {
      if (event.clipboardData.files?.length && event.clipboardData.files[0].type.startsWith('image')) {
        editCommentImage = event.clipboardData.files[0];
        event.preventDefault();
      } else return;
    } else {
      editCommentImage = event.target.files[0];
    }

    if (editCommentImage) {
      el.src = window.URL.createObjectURL(editCommentImage);
    }

    el.onload = async (evt) => {
      if (editCommentImage && !editCommentImage.type.endsWith('gif') && !editCommentImage.type.endsWith('webp')) {
        const webp = await convertToWebPWithOrientation(editCommentImage, {width: 1400});
        editCommentImage = new File([webp], editCommentImage.name);
      }

      // WebP 변환 시 이미 회전이 적용됨

      el.style.maxHeight = getImageMaxHeight(el);
      el.classList.remove('d-none');
    };
  }

  function remove(articleId) {

    Swal.fire({
      icon: 'warning',
      title: '삭제 하시겠습니까?',
      text: '삭제 하시겠습니까?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: '삭제'
    }).then((result) => {
      if (result.isConfirmed) {
        fetch(`/board/${boardId}/${articleId}`, {
          method: 'DELETE',
          body: JSON.stringify({articleId})
        })
        .then(async (res) => {
          if (res.status !== 200) {
            const {message} = await res.json();

            Swal.fire({
              icon: 'error',
              toast: true,
              title: message,
              confirmButtonColor: '#3085d6',
              confirmButtonText: '확인'
            })
            return;
          }

          Swal.fire({
            title: '삭제 완료',
            text: '삭제 완료되었습니다.',
            icon: 'success',
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: '확인'
          }).then(() => {
            list();
          });

          
        })
        .catch((err) => {
          console.error(err);
          Swal.fire({
            title: '삭제 중 오류가 발생했습니다.',
            text: err.message ?? '삭제 중 오류가 발생했습니다.',
            icon: 'error',
            toast: true
          });
        }); 
      }
    })
  }

  function edit(articleId) {
    goto(`/board/${boardId}/write/${articleId}`);
  }

  function write() {
    goto(`/board/${boardId}/write`);
  }

  /**
   * page 이동
   * @param pageNo {number}
   */
  function gopage(pageNo){
    goto(`/board/${boardId}/${pageNo}?v=${new Date().getSeconds()}`
      , {invalidateAll: true});
  }


  function countEmojis(str) {
    var EmojiPattern = /(?:\uD83D(?:\uDD73\uFE0F?|\uDC41(?:(?:\uFE0F(?:\u200D\uD83D\uDDE8\uFE0F?)?|\u200D\uD83D\uDDE8\uFE0F?))?|[\uDDE8\uDDEF]\uFE0F?|\uDC4B(?:\uD83C[\uDFFB-\uDFFF])?|\uDD90(?:(?:\uD83C[\uDFFB-\uDFFF]|\uFE0F))?|[\uDD96\uDC4C\uDC48\uDC49\uDC46\uDD95\uDC47\uDC4D\uDC4E\uDC4A\uDC4F\uDE4C\uDC50\uDE4F\uDC85\uDCAA\uDC42\uDC43\uDC76\uDC66\uDC67](?:\uD83C[\uDFFB-\uDFFF])?|\uDC71(?:(?:\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2640\u2642]\uFE0F?))?)|\u200D(?:[\u2640\u2642]\uFE0F?)))?|\uDC68(?:(?:\uD83C(?:\uDFFB(?:\u200D(?:\uD83E(?:\uDD1D\u200D\uD83D\uDC68\uD83C[\uDFFC-\uDFFF]|[\uDDB0\uDDB1\uDDB3\uDDB2\uDDAF\uDDBC\uDDBD])|\u2695\uFE0F?|\uD83C[\uDF93\uDFEB\uDF3E\uDF73\uDFED\uDFA4\uDFA8]|\u2696\uFE0F?|\uD83D[\uDD27\uDCBC\uDD2C\uDCBB\uDE80\uDE92]|\u2708\uFE0F?))?|\uDFFC(?:\u200D(?:\uD83E(?:\uDD1D\u200D\uD83D\uDC68\uD83C[\uDFFB\uDFFD-\uDFFF]|[\uDDB0\uDDB1\uDDB3\uDDB2\uDDAF\uDDBC\uDDBD])|\u2695\uFE0F?|\uD83C[\uDF93\uDFEB\uDF3E\uDF73\uDFED\uDFA4\uDFA8]|\u2696\uFE0F?|\uD83D[\uDD27\uDCBC\uDD2C\uDCBB\uDE80\uDE92]|\u2708\uFE0F?))?|\uDFFD(?:\u200D(?:\uD83E(?:\uDD1D\u200D\uD83D\uDC68\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF]|[\uDDB0\uDDB1\uDDB3\uDDB2\uDDAF\uDDBC\uDDBD])|\u2695\uFE0F?|\uD83C[\uDF93\uDFEB\uDF3E\uDF73\uDFED\uDFA4\uDFA8]|\u2696\uFE0F?|\uD83D[\uDD27\uDCBC\uDD2C\uDCBB\uDE80\uDE92]|\u2708\uFE0F?))?|\uDFFE(?:\u200D(?:\uD83E(?:\uDD1D\u200D\uD83D\uDC68\uD83C[\uDFFB-\uDFFD\uDFFF]|[\uDDB0\uDDB1\uDDB3\uDDB2\uDDAF\uDDBC\uDDBD])|\u2695\uFE0F?|\uD83C[\uDF93\uDFEB\uDF3E\uDF73\uDFED\uDFA4\uDFA8]|\u2696\uFE0F?|\uD83D[\uDD27\uDCBC\uDD2C\uDCBB\uDE80\uDE92]|\u2708\uFE0F?))?|\uDFFF(?:\u200D(?:\uD83E(?:\uDD1D\u200D\uD83D\uDC68\uD83C[\uDFFB-\uDFFE]|[\uDDB0\uDDB1\uDDB3\uDDB2\uDDAF\uDDBC\uDDBD])|\u2695\uFE0F?|\uD83C[\uDF93\uDFEB\uDF3E\uDF73\uDFED\uDFA4\uDFA8]|\u2696\uFE0F?|\uD83D[\uDD27\uDCBC\uDD2C\uDCBB\uDE80\uDE92]|\u2708\uFE0F?))?)|\u200D(?:\uD83E[\uDDB0\uDDB1\uDDB3\uDDB2\uDDAF\uDDBC\uDDBD]|\u2695\uFE0F?|\uD83C[\uDF93\uDFEB\uDF3E\uDF73\uDFED\uDFA4\uDFA8]|\u2696\uFE0F?|\uD83D(?:\uDC69\u200D\uD83D(?:\uDC66(?:\u200D\uD83D\uDC66)?|\uDC67(?:\u200D\uD83D[\uDC66\uDC67])?)|\uDC68\u200D\uD83D(?:\uDC66(?:\u200D\uD83D\uDC66)?|\uDC67(?:\u200D\uD83D[\uDC66\uDC67])?)|\uDC66(?:\u200D\uD83D\uDC66)?|\uDC67(?:\u200D\uD83D[\uDC66\uDC67])?|[\uDD27\uDCBC\uDD2C\uDCBB\uDE80\uDE92])|\u2708\uFE0F?|\u2764(?:\uFE0F\u200D\uD83D(?:\uDC8B\u200D\uD83D\uDC68|\uDC68)|\u200D\uD83D(?:\uDC8B\u200D\uD83D\uDC68|\uDC68)))))?|\uDC69(?:(?:\uD83C(?:\uDFFB(?:\u200D(?:\uD83E(?:\uDD1D\u200D\uD83D(?:\uDC69\uD83C[\uDFFC-\uDFFF]|\uDC68\uD83C[\uDFFC-\uDFFF])|[\uDDB0\uDDB1\uDDB3\uDDB2\uDDAF\uDDBC\uDDBD])|\u2695\uFE0F?|\uD83C[\uDF93\uDFEB\uDF3E\uDF73\uDFED\uDFA4\uDFA8]|\u2696\uFE0F?|\uD83D[\uDD27\uDCBC\uDD2C\uDCBB\uDE80\uDE92]|\u2708\uFE0F?))?|\uDFFC(?:\u200D(?:\uD83E(?:\uDD1D\u200D\uD83D(?:\uDC69\uD83C[\uDFFB\uDFFD-\uDFFF]|\uDC68\uD83C[\uDFFB\uDFFD-\uDFFF])|[\uDDB0\uDDB1\uDDB3\uDDB2\uDDAF\uDDBC\uDDBD])|\u2695\uFE0F?|\uD83C[\uDF93\uDFEB\uDF3E\uDF73\uDFED\uDFA4\uDFA8]|\u2696\uFE0F?|\uD83D[\uDD27\uDCBC\uDD2C\uDCBB\uDE80\uDE92]|\u2708\uFE0F?))?|\uDFFD(?:\u200D(?:\uD83E(?:\uDD1D\u200D\uD83D(?:\uDC69\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF]|\uDC68\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])|[\uDDB0\uDDB1\uDDB3\uDDB2\uDDAF\uDDBC\uDDBD])|\u2695\uFE0F?|\uD83C[\uDF93\uDFEB\uDF3E\uDF73\uDFED\uDFA4\uDFA8]|\u2696\uFE0F?|\uD83D[\uDD27\uDCBC\uDD2C\uDCBB\uDE80\uDE92]|\u2708\uFE0F?))?|\uDFFE(?:\u200D(?:\uD83E(?:\uDD1D\u200D\uD83D(?:\uDC69\uD83C[\uDFFB-\uDFFD\uDFFF]|\uDC68\uD83C[\uDFFB-\uDFFD\uDFFF])|[\uDDB0\uDDB1\uDDB3\uDDB2\uDDAF\uDDBC\uDDBD])|\u2695\uFE0F?|\uD83C[\uDF93\uDFEB\uDF3E\uDF73\uDFED\uDFA4\uDFA8]|\u2696\uFE0F?|\uD83D[\uDD27\uDCBC\uDD2C\uDCBB\uDE80\uDE92]|\u2708\uFE0F?))?|\uDFFF(?:\u200D(?:\uD83E(?:\uDD1D\u200D\uD83D(?:\uDC69\uD83C[\uDFFB-\uDFFE]|\uDC68\uD83C[\uDFFB-\uDFFE])|[\uDDB0\uDDB1\uDDB3\uDDB2\uDDAF\uDDBC\uDDBD])|\u2695\uFE0F?|\uD83C[\uDF93\uDFEB\uDF3E\uDF73\uDFED\uDFA4\uDFA8]|\u2696\uFE0F?|\uD83D[\uDD27\uDCBC\uDD2C\uDCBB\uDE80\uDE92]|\u2708\uFE0F?))?)|\u200D(?:\uD83E[\uDDB0\uDDB1\uDDB3\uDDB2\uDDAF\uDDBC\uDDBD]|\u2695\uFE0F?|\uD83C[\uDF93\uDFEB\uDF3E\uDF73\uDFED\uDFA4\uDFA8]|\u2696\uFE0F?|\uD83D(?:\uDC69\u200D\uD83D(?:\uDC66(?:\u200D\uD83D\uDC66)?|\uDC67(?:\u200D\uD83D[\uDC66\uDC67])?)|\uDC66(?:\u200D\uD83D\uDC66)?|\uDC67(?:\u200D\uD83D[\uDC66\uDC67])?|[\uDD27\uDCBC\uDD2C\uDCBB\uDE80\uDE92])|\u2708\uFE0F?|\u2764(?:\uFE0F\u200D\uD83D(?:\uDC8B\u200D\uD83D[\uDC68\uDC69]|[\uDC68\uDC69])|\u200D\uD83D(?:\uDC8B\u200D\uD83D[\uDC68\uDC69]|[\uDC68\uDC69])))))?|[\uDC74\uDC75](?:\uD83C[\uDFFB-\uDFFF])?|[\uDE4D\uDE4E\uDE45\uDE46\uDC81\uDE4B\uDE47\uDC6E](?:(?:\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?)|\u200D(?:[\u2642\u2640]\uFE0F?)))?|\uDD75(?:(?:\uFE0F(?:\u200D(?:[\u2642\u2640]\uFE0F?))?|\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?)|\u200D(?:[\u2642\u2640]\uFE0F?)))?|[\uDC82\uDC77](?:(?:\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?)|\u200D(?:[\u2642\u2640]\uFE0F?)))?|\uDC78(?:\uD83C[\uDFFB-\uDFFF])?|\uDC73(?:(?:\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?)|\u200D(?:[\u2642\u2640]\uFE0F?)))?|[\uDC72\uDC70\uDC7C](?:\uD83C[\uDFFB-\uDFFF])?|[\uDC86\uDC87\uDEB6](?:(?:\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?)|\u200D(?:[\u2642\u2640]\uFE0F?)))?|[\uDC83\uDD7A](?:\uD83C[\uDFFB-\uDFFF])?|\uDD74(?:(?:\uD83C[\uDFFB-\uDFFF]|\uFE0F))?|\uDC6F(?:\u200D(?:[\u2642\u2640]\uFE0F?))?|[\uDEA3\uDEB4\uDEB5](?:(?:\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?)|\u200D(?:[\u2642\u2640]\uFE0F?)))?|[\uDEC0\uDECC\uDC6D\uDC6B\uDC6C](?:\uD83C[\uDFFB-\uDFFF])?|\uDDE3\uFE0F?|\uDC15(?:\u200D\uD83E\uDDBA)?|[\uDC3F\uDD4A\uDD77\uDD78\uDDFA\uDEE3\uDEE4\uDEE2\uDEF3\uDEE5\uDEE9\uDEF0\uDECE\uDD70\uDD79\uDDBC\uDD76\uDECD\uDDA5\uDDA8\uDDB1\uDDB2\uDCFD\uDD6F\uDDDE\uDDF3\uDD8B\uDD8A\uDD8C\uDD8D\uDDC2\uDDD2\uDDD3\uDD87\uDDC3\uDDC4\uDDD1\uDDDD\uDEE0\uDDE1\uDEE1\uDDDC\uDECF\uDECB\uDD49]\uFE0F?|[\uDE00\uDE03\uDE04\uDE01\uDE06\uDE05\uDE02\uDE42\uDE43\uDE09\uDE0A\uDE07\uDE0D\uDE18\uDE17\uDE1A\uDE19\uDE0B\uDE1B-\uDE1D\uDE10\uDE11\uDE36\uDE0F\uDE12\uDE44\uDE2C\uDE0C\uDE14\uDE2A\uDE34\uDE37\uDE35\uDE0E\uDE15\uDE1F\uDE41\uDE2E\uDE2F\uDE32\uDE33\uDE26-\uDE28\uDE30\uDE25\uDE22\uDE2D\uDE31\uDE16\uDE23\uDE1E\uDE13\uDE29\uDE2B\uDE24\uDE21\uDE20\uDE08\uDC7F\uDC80\uDCA9\uDC79-\uDC7B\uDC7D\uDC7E\uDE3A\uDE38\uDE39\uDE3B-\uDE3D\uDE40\uDE3F\uDE3E\uDE48-\uDE4A\uDC8B\uDC8C\uDC98\uDC9D\uDC96\uDC97\uDC93\uDC9E\uDC95\uDC9F\uDC94\uDC9B\uDC9A\uDC99\uDC9C\uDDA4\uDCAF\uDCA2\uDCA5\uDCAB\uDCA6\uDCA8\uDCA3\uDCAC\uDCAD\uDCA4\uDC40\uDC45\uDC44\uDC8F\uDC91\uDC6A\uDC64\uDC65\uDC63\uDC35\uDC12\uDC36\uDC29\uDC3A\uDC31\uDC08\uDC2F\uDC05\uDC06\uDC34\uDC0E\uDC2E\uDC02-\uDC04\uDC37\uDC16\uDC17\uDC3D\uDC0F\uDC11\uDC10\uDC2A\uDC2B\uDC18\uDC2D\uDC01\uDC00\uDC39\uDC30\uDC07\uDC3B\uDC28\uDC3C\uDC3E\uDC14\uDC13\uDC23-\uDC27\uDC38\uDC0A\uDC22\uDC0D\uDC32\uDC09\uDC33\uDC0B\uDC2C\uDC1F-\uDC21\uDC19\uDC1A\uDC0C\uDC1B-\uDC1E\uDC90\uDCAE\uDD2A\uDDFE\uDDFB\uDC92\uDDFC\uDDFD\uDD4C\uDED5\uDD4D\uDD4B\uDC88\uDE82-\uDE8A\uDE9D\uDE9E\uDE8B-\uDE8E\uDE90-\uDE9C\uDEF5\uDEFA\uDEB2\uDEF4\uDEF9\uDE8F\uDEA8\uDEA5\uDEA6\uDED1\uDEA7\uDEF6\uDEA4\uDEA2\uDEEB\uDEEC\uDCBA\uDE81\uDE9F-\uDEA1\uDE80\uDEF8\uDD5B\uDD67\uDD50\uDD5C\uDD51\uDD5D\uDD52\uDD5E\uDD53\uDD5F\uDD54\uDD60\uDD55\uDD61\uDD56\uDD62\uDD57\uDD63\uDD58\uDD64\uDD59\uDD65\uDD5A\uDD66\uDD25\uDCA7\uDEF7\uDD2E\uDC53-\uDC62\uDC51\uDC52\uDCFF\uDC84\uDC8D\uDC8E\uDD07-\uDD0A\uDCE2\uDCE3\uDCEF\uDD14\uDD15\uDCFB\uDCF1\uDCF2\uDCDE-\uDCE0\uDD0B\uDD0C\uDCBB\uDCBD-\uDCC0\uDCFA\uDCF7-\uDCF9\uDCFC\uDD0D\uDD0E\uDCA1\uDD26\uDCD4-\uDCDA\uDCD3\uDCD2\uDCC3\uDCDC\uDCC4\uDCF0\uDCD1\uDD16\uDCB0\uDCB4-\uDCB8\uDCB3\uDCB9\uDCB1\uDCB2\uDCE7-\uDCE9\uDCE4-\uDCE6\uDCEB\uDCEA\uDCEC-\uDCEE\uDCDD\uDCBC\uDCC1\uDCC2\uDCC5-\uDCD0\uDD12\uDD13\uDD0F-\uDD11\uDD28\uDD2B\uDD27\uDD29\uDD17\uDD2C\uDD2D\uDCE1\uDC89\uDC8A\uDEAA\uDEBD\uDEBF\uDEC1\uDED2\uDEAC\uDDFF\uDEAE\uDEB0\uDEB9-\uDEBC\uDEBE\uDEC2-\uDEC5\uDEB8\uDEAB\uDEB3\uDEAD\uDEAF\uDEB1\uDEB7\uDCF5\uDD1E\uDD03\uDD04\uDD19-\uDD1D\uDED0\uDD4E\uDD2F\uDD00-\uDD02\uDD3C\uDD3D\uDD05\uDD06\uDCF6\uDCF3\uDCF4\uDD31\uDCDB\uDD30\uDD1F-\uDD24\uDD34\uDFE0-\uDFE2\uDD35\uDFE3-\uDFE5\uDFE7-\uDFE9\uDFE6\uDFEA\uDFEB\uDD36-\uDD3B\uDCA0\uDD18\uDD33\uDD32\uDEA9])|\uD83E(?:[\uDD1A\uDD0F\uDD1E\uDD1F\uDD18\uDD19\uDD1B\uDD1C\uDD32\uDD33\uDDB5\uDDB6\uDDBB\uDDD2](?:\uD83C[\uDFFB-\uDFFF])?|\uDDD1(?:(?:\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:\uD83E(?:\uDD1D\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFF]|[\uDDB0\uDDB1\uDDB3\uDDB2\uDDAF\uDDBC\uDDBD])|\u2695\uFE0F?|\uD83C[\uDF93\uDFEB\uDF3E\uDF73\uDFED\uDFA4\uDFA8]|\u2696\uFE0F?|\uD83D[\uDD27\uDCBC\uDD2C\uDCBB\uDE80\uDE92]|\u2708\uFE0F?))?)|\u200D(?:\uD83E(?:\uDD1D\u200D\uD83E\uDDD1|[\uDDB0\uDDB1\uDDB3\uDDB2\uDDAF\uDDBC\uDDBD])|\u2695\uFE0F?|\uD83C[\uDF93\uDFEB\uDF3E\uDF73\uDFED\uDFA4\uDFA8]|\u2696\uFE0F?|\uD83D[\uDD27\uDCBC\uDD2C\uDCBB\uDE80\uDE92]|\u2708\uFE0F?)))?|[\uDDD4\uDDD3](?:\uD83C[\uDFFB-\uDFFF])?|[\uDDCF\uDD26\uDD37](?:(?:\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?)|\u200D(?:[\u2642\u2640]\uFE0F?)))?|[\uDD34\uDDD5\uDD35\uDD30\uDD31\uDD36](?:\uD83C[\uDFFB-\uDFFF])?|[\uDDB8\uDDB9\uDDD9-\uDDDD](?:(?:\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?)|\u200D(?:[\u2642\u2640]\uFE0F?)))?|[\uDDDE\uDDDF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?|[\uDDCD\uDDCE\uDDD6\uDDD7\uDD38](?:(?:\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?)|\u200D(?:[\u2642\u2640]\uFE0F?)))?|\uDD3C(?:\u200D(?:[\u2642\u2640]\uFE0F?))?|[\uDD3D\uDD3E\uDD39\uDDD8](?:(?:\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?)|\u200D(?:[\u2642\u2640]\uFE0F?)))?|[\uDD23\uDD70\uDD29\uDD2A\uDD11\uDD17\uDD2D\uDD2B\uDD14\uDD10\uDD28\uDD25\uDD24\uDD12\uDD15\uDD22\uDD2E\uDD27\uDD75\uDD76\uDD74\uDD2F\uDD20\uDD73\uDD13\uDDD0\uDD7A\uDD71\uDD2C\uDD21\uDD16\uDDE1\uDD0E\uDD0D\uDD1D\uDDBE\uDDBF\uDDE0\uDDB7\uDDB4\uDD3A\uDDB0\uDDB1\uDDB3\uDDB2\uDD8D\uDDA7\uDDAE\uDD8A\uDD9D\uDD81\uDD84\uDD93\uDD8C\uDD99\uDD92\uDD8F\uDD9B\uDD94\uDD87\uDDA5\uDDA6\uDDA8\uDD98\uDDA1\uDD83\uDD85\uDD86\uDDA2\uDD89\uDDA9\uDD9A\uDD9C\uDD8E\uDD95\uDD96\uDD88\uDD8B\uDD97\uDD82\uDD9F\uDDA0\uDD40\uDD6D\uDD5D\uDD65\uDD51\uDD54\uDD55\uDD52\uDD6C\uDD66\uDDC4\uDDC5\uDD5C\uDD50\uDD56\uDD68\uDD6F\uDD5E\uDDC7\uDDC0\uDD69\uDD53\uDD6A\uDD59\uDDC6\uDD5A\uDD58\uDD63\uDD57\uDDC8\uDDC2\uDD6B\uDD6E\uDD5F-\uDD61\uDD80\uDD9E\uDD90\uDD91\uDDAA\uDDC1\uDD67\uDD5B\uDD42\uDD43\uDD64\uDDC3\uDDC9\uDDCA\uDD62\uDD44\uDDED\uDDF1\uDDBD\uDDBC\uDE82\uDDF3\uDE90\uDDE8\uDDE7\uDD47-\uDD49\uDD4E\uDD4F\uDD4D\uDD4A\uDD4B\uDD45\uDD3F\uDD4C\uDE80\uDE81\uDDFF\uDDE9\uDDF8\uDDF5\uDDF6\uDD7D\uDD7C\uDDBA\uDDE3-\uDDE6\uDD7B\uDE71-\uDE73\uDD7E\uDD7F\uDE70\uDDE2\uDE95\uDD41\uDDEE\uDE94\uDDFE\uDE93\uDDAF\uDDF0\uDDF2\uDDEA-\uDDEC\uDE78-\uDE7A\uDE91\uDE92\uDDF4\uDDF7\uDDF9-\uDDFD\uDDEF])|[\u263A\u2639\u2620\u2763\u2764]\uFE0F?|\u270B(?:\uD83C[\uDFFB-\uDFFF])?|[\u270C\u261D](?:(?:\uD83C[\uDFFB-\uDFFF]|\uFE0F))?|\u270A(?:\uD83C[\uDFFB-\uDFFF])?|\u270D(?:(?:\uD83C[\uDFFB-\uDFFF]|\uFE0F))?|\uD83C(?:\uDF85(?:\uD83C[\uDFFB-\uDFFF])?|\uDFC3(?:(?:\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?)|\u200D(?:[\u2642\u2640]\uFE0F?)))?|[\uDFC7\uDFC2](?:\uD83C[\uDFFB-\uDFFF])?|\uDFCC(?:(?:\uFE0F(?:\u200D(?:[\u2642\u2640]\uFE0F?))?|\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?)|\u200D(?:[\u2642\u2640]\uFE0F?)))?|[\uDFC4\uDFCA](?:(?:\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?)|\u200D(?:[\u2642\u2640]\uFE0F?)))?|\uDFCB(?:(?:\uFE0F(?:\u200D(?:[\u2642\u2640]\uFE0F?))?|\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?)|\u200D(?:[\u2642\u2640]\uFE0F?)))?|[\uDFF5\uDF36\uDF7D\uDFD4-\uDFD6\uDFDC-\uDFDF\uDFDB\uDFD7\uDFD8\uDFDA\uDFD9\uDFCE\uDFCD\uDF21\uDF24-\uDF2C\uDF97\uDF9F\uDF96\uDF99-\uDF9B\uDF9E\uDFF7\uDD70\uDD71\uDD7E\uDD7F\uDE02\uDE37]\uFE0F?|\uDFF4(?:(?:\u200D\u2620\uFE0F?|\uDB40\uDC67\uDB40\uDC62\uDB40(?:\uDC65\uDB40\uDC6E\uDB40\uDC67\uDB40\uDC7F|\uDC73\uDB40\uDC63\uDB40\uDC74\uDB40\uDC7F|\uDC77\uDB40\uDC6C\uDB40\uDC73\uDB40\uDC7F)))?|\uDFF3(?:(?:\uFE0F(?:\u200D\uD83C\uDF08)?|\u200D\uD83C\uDF08))?|\uDDE6\uD83C[\uDDE8-\uDDEC\uDDEE\uDDF1\uDDF2\uDDF4\uDDF6-\uDDFA\uDDFC\uDDFD\uDDFF]|\uDDE7\uD83C[\uDDE6\uDDE7\uDDE9-\uDDEF\uDDF1-\uDDF4\uDDF6-\uDDF9\uDDFB\uDDFC\uDDFE\uDDFF]|\uDDE8\uD83C[\uDDE6\uDDE8\uDDE9\uDDEB-\uDDEE\uDDF0-\uDDF5\uDDF7\uDDFA-\uDDFF]|\uDDE9\uD83C[\uDDEA\uDDEC\uDDEF\uDDF0\uDDF2\uDDF4\uDDFF]|\uDDEA\uD83C[\uDDE6\uDDE8\uDDEA\uDDEC\uDDED\uDDF7-\uDDFA]|\uDDEB\uD83C[\uDDEE-\uDDF0\uDDF2\uDDF4\uDDF7]|\uDDEC\uD83C[\uDDE6\uDDE7\uDDE9-\uDDEE\uDDF1-\uDDF3\uDDF5-\uDDFA\uDDFC\uDDFE]|\uDDED\uD83C[\uDDF0\uDDF2\uDDF3\uDDF7\uDDF9\uDDFA]|\uDDEE\uD83C[\uDDE8-\uDDEA\uDDF1-\uDDF4\uDDF6-\uDDF9]|\uDDEF\uD83C[\uDDEA\uDDF2\uDDF4\uDDF5]|\uDDF0\uD83C[\uDDEA\uDDEC-\uDDEE\uDDF2\uDDF3\uDDF5\uDDF7\uDDFC\uDDFE\uDDFF]|\uDDF1\uD83C[\uDDE6-\uDDE8\uDDEE\uDDF0\uDDF7-\uDDFB\uDDFE]|\uDDF2\uD83C[\uDDE6\uDDE8-\uDDED\uDDF0-\uDDFF]|\uDDF3\uD83C[\uDDE6\uDDE8\uDDEA-\uDDEC\uDDEE\uDDF1\uDDF4\uDDF5\uDDF7\uDDFA\uDDFF]|\uDDF4\uD83C\uDDF2|\uDDF5\uD83C[\uDDE6\uDDEA-\uDDED\uDDF0-\uDDF3\uDDF7-\uDDF9\uDDFC\uDDFE]|\uDDF6\uD83C\uDDE6|\uDDF7\uD83C[\uDDEA\uDDF4\uDDF8\uDDFA\uDDFC]|\uDDF8\uD83C[\uDDE6-\uDDEA\uDDEC-\uDDF4\uDDF7-\uDDF9\uDDFB\uDDFD-\uDDFF]|\uDDF9\uD83C[\uDDE6\uDDE8\uDDE9\uDDEB-\uDDED\uDDEF-\uDDF4\uDDF7\uDDF9\uDDFB\uDDFC\uDDFF]|\uDDFA\uD83C[\uDDE6\uDDEC\uDDF2\uDDF3\uDDF8\uDDFE\uDDFF]|\uDDFB\uD83C[\uDDE6\uDDE8\uDDEA\uDDEC\uDDEE\uDDF3\uDDFA]|\uDDFC\uD83C[\uDDEB\uDDF8]|\uDDFD\uD83C\uDDF0|\uDDFE\uD83C[\uDDEA\uDDF9]|\uDDFF\uD83C[\uDDE6\uDDF2\uDDFC]|[\uDFFB-\uDFFF\uDF38-\uDF3C\uDF37\uDF31-\uDF35\uDF3E-\uDF43\uDF47-\uDF53\uDF45\uDF46\uDF3D\uDF44\uDF30\uDF5E\uDF56\uDF57\uDF54\uDF5F\uDF55\uDF2D-\uDF2F\uDF73\uDF72\uDF7F\uDF71\uDF58-\uDF5D\uDF60\uDF62-\uDF65\uDF61\uDF66-\uDF6A\uDF82\uDF70\uDF6B-\uDF6F\uDF7C\uDF75\uDF76\uDF7E\uDF77-\uDF7B\uDF74\uDFFA\uDF0D-\uDF10\uDF0B\uDFE0-\uDFE6\uDFE8-\uDFED\uDFEF\uDFF0\uDF01\uDF03-\uDF07\uDF09\uDFA0-\uDFA2\uDFAA\uDF11-\uDF20\uDF0C\uDF00\uDF08\uDF02\uDF0A\uDF83\uDF84\uDF86-\uDF8B\uDF8D-\uDF91\uDF80\uDF81\uDFAB\uDFC6\uDFC5\uDFC0\uDFD0\uDFC8\uDFC9\uDFBE\uDFB3\uDFCF\uDFD1-\uDFD3\uDFF8\uDFA3\uDFBD\uDFBF\uDFAF\uDFB1\uDFAE\uDFB0\uDFB2\uDCCF\uDC04\uDFB4\uDFAD\uDFA8\uDF92\uDFA9\uDF93\uDFBC\uDFB5\uDFB6\uDFA4\uDFA7\uDFB7-\uDFBB\uDFA5\uDFAC\uDFEE\uDFF9\uDFE7\uDFA6\uDD8E\uDD91-\uDD9A\uDE01\uDE36\uDE2F\uDE50\uDE39\uDE1A\uDE32\uDE51\uDE38\uDE34\uDE33\uDE3A\uDE35\uDFC1\uDF8C])|\u26F7\uFE0F?|\u26F9(?:(?:\uFE0F(?:\u200D(?:[\u2642\u2640]\uFE0F?))?|\uD83C(?:[\uDFFB-\uDFFF](?:\u200D(?:[\u2642\u2640]\uFE0F?))?)|\u200D(?:[\u2642\u2640]\uFE0F?)))?|[\u2618\u26F0\u26E9\u2668\u26F4\u2708\u23F1\u23F2\u2600\u2601\u26C8\u2602\u26F1\u2744\u2603\u2604\u26F8\u2660\u2665\u2666\u2663\u265F\u26D1\u260E\u2328\u2709\u270F\u2712\u2702\u26CF\u2692\u2694\u2699\u2696\u26D3\u2697\u26B0\u26B1\u26A0\u2622\u2623\u2B06\u2197\u27A1\u2198\u2B07\u2199\u2B05\u2196\u2195\u2194\u21A9\u21AA\u2934\u2935\u269B\u2721\u2638\u262F\u271D\u2626\u262A\u262E\u25B6\u23ED\u23EF\u25C0\u23EE\u23F8-\u23FA\u23CF\u2640\u2642\u2695\u267E\u267B\u269C\u2611\u2714\u2716\u303D\u2733\u2734\u2747\u203C\u2049\u3030\u00A9\u00AE\u2122]\uFE0F?|[\u0023\u002A\u0030-\u0039](?:\uFE0F\u20E3|\u20E3)|[\u2139\u24C2\u3297\u3299\u25FC\u25FB\u25AA\u25AB]\uFE0F?|[\u2615\u26EA\u26F2\u26FA\u26FD\u2693\u26F5\u231B\u23F3\u231A\u23F0\u2B50\u26C5\u2614\u26A1\u26C4\u2728\u26BD\u26BE\u26F3\u267F\u26D4\u2648-\u2653\u26CE\u23E9-\u23EC\u2B55\u2705\u274C\u274E\u2795-\u2797\u27B0\u27BF\u2753-\u2755\u2757\u26AB\u26AA\u2B1B\u2B1C\u25FE\u25FD])/g;
    return ((str || '').match(EmojiPattern) || []).length;
  }

  // 이미지 비율 확인 함수
  function isLongImage(img) {
    if (!img) return false;
    return img.naturalHeight > img.naturalWidth * 2;
  }

  // 이미지가 세로로 긴지 확인하는 함수
  function isPortraitImage(img) {
    if (!img) return false;
    return img.naturalHeight > img.naturalWidth;
  }

  // 이미지 높이 계산 함수
  function getImageMaxHeight(img) {
    if (!img) return '500px';
    if (isLongImage(img)) {
      return '80vh'; // 긴짤인 경우 화면 높이의 80%
    }
    return '500px'; // 일반 이미지는 기존 제한 유지
  }


  // 이미지 EXIF Orientation 읽기 함수
  function getImageOrientation(fileOrBlob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = function(e) {
        const view = new DataView(e.target.result);
        if (view.getUint16(0, false) !== 0xFFD8) {
          resolve(1); // JPEG가 아니면 기본값
          return;
        }
        
        const length = view.byteLength;
        let offset = 2;
        
        while (offset < length) {
          if (view.getUint16(offset, false) !== 0xFFE1) {
            offset += 2;
            continue;
          }
          
          const exifLength = view.getUint16(offset + 2, false);
          offset += 4;
          
          if (view.getUint32(offset, false) !== 0x45786966) {
            offset += exifLength - 4;
            continue;
          }
          
          offset += 6;
          const tiffOffset = offset;
          const littleEndian = view.getUint16(tiffOffset, false) === 0x4949;
          
          if (view.getUint16(tiffOffset + 2, littleEndian) !== 0x002A) {
            resolve(1);
            return;
          }
          
          const firstIFDOffset = view.getUint32(tiffOffset + 4, littleEndian);
          const ifdOffset = tiffOffset + firstIFDOffset;
          const numEntries = view.getUint16(ifdOffset, littleEndian);
          
          for (let i = 0; i < numEntries; i++) {
            const entryOffset = ifdOffset + 2 + (i * 12);
            const tag = view.getUint16(entryOffset, littleEndian);
            
            if (tag === 0x0112) { // Orientation tag
              const orientation = view.getUint16(entryOffset + 8, littleEndian);
              resolve(orientation);
              return;
            }
          }
          
          resolve(1);
          return;
        }
        
        resolve(1);
      };
      reader.readAsArrayBuffer(fileOrBlob);
    });
  }

  // EXIF Orientation을 적용한 WebP 변환 함수
  async function convertToWebPWithOrientation(file, options = {}) {
    const orientation = await getImageOrientation(file);
    console.log('EXIF Orientation:', orientation);
    
    // 1단계: 먼저 WebP로 변환
    const webpBlob = await blobToWebP(file, options);
    console.log('WebP 변환 완료, 크기:', webpBlob.size);

    // Orientation이 1이면 그대로 반환 (회전 불필요)
    if (orientation === 1) {
      console.log('Orientation 1 - 회전 불필요');
      return webpBlob;
    }
    
    console.log('EXIF Orientation 적용을 위한 Canvas 회전, Orientation:', orientation);
    
    // 2단계: Canvas를 사용한 회전
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // 원본 이미지 크기
        const originalWidth = img.width;
        const originalHeight = img.height;
        console.log('원본 이미지 크기:', originalWidth, 'x', originalHeight);
        
        // 이미지 비율 계산
        const aspectRatio = originalWidth / originalHeight;
        const isPortrait = originalHeight > originalWidth;
        const isLandscape = originalWidth > originalHeight;
        const isSquare = Math.abs(aspectRatio - 1) < 0.1;
        
        console.log('이미지 비율 정보:', {
          aspectRatio: aspectRatio.toFixed(2),
          isPortrait,
          isLandscape,
          isSquare
        });
        
        // Orientation과 이미지 비율을 고려한 회전 결정
        let shouldRotate = false;
        let rotationAngle = 0;
        let needsFlip = false;
        
        // Orientation이 1이 아니고 null이 아니고 landscape 비율일 때만 회전
        if (orientation !== 1 && orientation !== null && isLandscape) {
          shouldRotate = true;
          
          switch (orientation) {
            case 2: // 좌우 반전
              needsFlip = true;
              break;
            case 3: // 180도 회전
              rotationAngle = 180;
              break;
            case 4: // 상하 반전
              rotationAngle = 180;
              needsFlip = true;
              break;
            case 5: // 90도 회전 + 좌우 반전
              rotationAngle = 90;
              needsFlip = true;
              break;
            case 6: // 90도 회전
              rotationAngle = 90;
              console.log('Landscape 이미지 90도 회전 적용');
              break;
            case 7: // 270도 회전 + 좌우 반전
              rotationAngle = 270;
              needsFlip = true;
              break;
            case 8: // 270도 회전
              rotationAngle = 270;
              console.log('Landscape 이미지 270도 회전 적용');
              break;
          }
        } else if (orientation !== 1 && orientation !== null && isPortrait) {
          console.log('Portrait 이미지는 회전하지 않음');
        } else if (orientation !== 1 && orientation !== null && isSquare) {
          console.log('Square 이미지는 회전하지 않음');
        } else if (orientation === null) {
          console.log('Orientation이 null - 회전하지 않음');
        }
        
        if (!shouldRotate) {
          console.log('회전 불필요 - 원본 WebP 반환');
          resolve(webpBlob);
          return;
        }
        
        // Orientation에 따른 캔버스 크기 설정
        let canvasWidth, canvasHeight;
        
        if (rotationAngle === 90 || rotationAngle === 270) {
          // 90도 또는 270도 회전 시 가로세로 바뀜
          canvasWidth = originalHeight;
          canvasHeight = originalWidth;
        } else {
          // 180도 회전 시 크기 유지
          canvasWidth = originalWidth;
          canvasHeight = originalHeight;
        }
        
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        console.log('Canvas 크기 설정:', canvasWidth, 'x', canvasHeight);
        
        // Canvas 변환 적용
        if (rotationAngle === 90) {
          ctx.translate(canvasWidth, 0);
          ctx.rotate(Math.PI / 2);
          if (needsFlip) {
            ctx.scale(-1, 1);
          }
        } else if (rotationAngle === 180) {
          ctx.translate(canvasWidth, canvasHeight);
          ctx.rotate(Math.PI);
          if (needsFlip) {
            ctx.scale(-1, 1);
          }
        } else if (rotationAngle === 270) {
          ctx.translate(0, canvasHeight);
          ctx.rotate(-Math.PI / 2);
          if (needsFlip) {
            ctx.scale(-1, 1);
          }
        }
        
        // 이미지 그리기
        ctx.drawImage(img, 0, 0, originalWidth, originalHeight);
        
        console.log('Canvas 회전 적용 완료:', {
          orientation,
          rotationAngle,
          needsFlip,
          finalSize: `${canvasWidth}x${canvasHeight}`
        });
        
        // Canvas를 WebP Blob으로 변환
        canvas.toBlob((blob) => {
          if (blob) {
            console.log('회전된 WebP 생성 완료:', orientation, '크기:', blob.size);
            resolve(blob);
          } else {
            reject(new Error('Canvas to WebP 변환 실패'));
          }
        }, 'image/webp', options.quality || 0.9);
      };
      
      img.onerror = () => {
        reject(new Error('이미지 로드 실패'));
      };
      
      img.src = URL.createObjectURL(webpBlob);
    });
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

  let commentModalOpen = false;
  const commentModalToggle = () =>{

    (commentModalOpen = !commentModalOpen);
  }

  alarmCount.update(alarmCount => data.alarmCount);

  let visibleReply = $state('');

  // 댓글 데이터를 $state로 관리
  let commentData = $state(data.article.comments);

  // 게시물 좋아요 데이터를 $state로 관리
  let articleLike = $state(data.article.like);
  let articleLiked = $state(data.article.liked);
  

  $effect(() => {
    console.log('🔄 게시글 상세 페이지 - articleId:', articleId);
    console.log('📝 게시글:', data.article.title);
    console.log('💬 댓글 수:', data.article.comments?.length);
  });

  // 댓글 내용에서 URL 추출하는 함수
  function extractUrls(text) {
    const urlRegex = /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/g;
    return text.match(urlRegex) || [];
  }

  // 게시물 내용에서 URL 추출하는 함수
  function extractUrlsFromArticle(htmlContent) {
    // HTML 태그를 제거하고 텍스트만 추출
    const textContent = htmlContent.replace(/<[^>]*>/g, '');
    const urls = extractUrls(textContent);
    console.log('게시물에서 추출된 URLs:', urls);
    return urls;
  }

  // 게시물 내용을 처리하는 함수 (URL 제거하고 HTML 정리)
  function processArticleContent(htmlContent) {
    // sanitize-html 설정에서 인스타그램 임베드 허용
    return sanitizeHtml(htmlContent, {
      allowedTags: [
        'p', 'br', 'strong', 'em', 'u', 's', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'video', 'iframe', 'div', 'span'
      ],
      allowedAttributes: {
        'blockquote': ['class', 'data-instgrm-permalink', 'style'],
        'iframe': ['src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'style', 'position'],
        'video': ['src', 'controls', 'style', 'width', 'height'],
        'a': ['href', 'target', 'rel'],
        'img': ['src', 'alt', 'width', 'height', 'style'],
        'div': ['class', 'style', 'position'],
        'span': ['style']
      }
    });
  }

  onMount(()=>{
    // 인스타그램 임베드 처리
    setTimeout(() => {
      console.log('인스타그램 임베드 확인:', document.querySelector('blockquote.instagram-media'));
      if (document.querySelector('blockquote.instagram-media')) {
        console.log('인스타그램 임베드 처리 시작');
        if (typeof instgrm !== 'undefined' && instgrm.Embeds) {
          instgrm.Embeds.process();
          console.log('인스타그램 임베드 처리 완료');
        } else {
          console.log('instgrm 객체를 찾을 수 없음');
        }
      }
    }, 1000);
    
    // 추가로 3초 후에도 다시 시도
    setTimeout(() => {
      if (document.querySelector('blockquote.instagram-media')) {
        console.log('인스타그램 임베드 재처리 시도');
        if (typeof instgrm !== 'undefined' && instgrm.Embeds) {
          instgrm.Embeds.process();
        }
      }
    }, 3000);
 
    console.log('url', $page.url)

    const hash = $page.url.searchParams.get('a');

    if(hash){
      const el = document.querySelector(`#${hash}`);
      setTimeout(()=> el.scrollIntoView({behavior: 'smooth', block: 'center', inline: 'center'}) , 500)
    }

  })

</script>

<main class="container my-md-5">

  <!-- 댓글 수정 modal -->
 <!-- <div class="d-flex justify-content-center align-item-center w-100 p-0 m-0">
    <Button color="danger" onclick={commentModalToggle}>Open Modal</Button>
    <Modal body header="Modal title" isOpen={commentModalOpen} fullscreen={true}
       class="d-flex justify-content-center align-item-start w-100 p-0 m-0 border-danger" style="height: 500px">
      Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod
      tempor incididunt ut labore et dolore magna aliqua.
    </Modal>
  </div>-->


  <Dialog bind:dialog>
    {dialogText}
  </Dialog>

  <div class="d-flex justify-content-{toastColor==='primary'?'end':'center'} w-100 p-0 m-0">
    <Toast
      autohide
      isOpen={toastIsOpen}
      delay={toastColor==='primary'?1000:2500}
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
        {@html processArticleContent(data.article.content.replace(/<p>\s*<br\s*\/?>(\s|\u00A0)*<\/p>/g, '<br>'))}
      </CardText>
      
    </Row>
    <Row class="p-md-3 p-xs-1 mb-3 mx-0">
      <!--프로필-->
      <Card class="p-2">
        <Row class="g-1 d-flex align-items-center">
          <Col xs="auto">
            <img
              alt="프로필 사진"
              class="card-img-left rounded-start"
              src={data.photo}
              style="max-height: 100px;max-width:100px; width: 100%; height: auto;"
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
        {#if data.session?.user?.email && data.article.email === data.session.user.email}
          <Button color="danger" onclick={() => remove(data.article._id)} class="ps-1 pe-2">
            <Icon name="trash"/>
            삭제
          </Button>
          <Button color="success" onclick={() => edit(data.article._id)} class="ps-1 pe-2">
            <Icon name="pencil"/>
            수정
          </Button>
        {/if}
        <Button color="primary" onclick={like} class="px-3 {likeAnimation ? 'like-animation' : ''}" disabled={articleLiked}>
          <Icon name={articleLiked?"hand-thumbs-up-fill":"hand-thumbs-up"}/>
          {articleLike || ''}
        </Button>
        <Button color="secondary" onclick={list} class="ps-1 pe-2">
          <Icon name="list"/>
          목록
        </Button>
      </Col>
      <Row class="my-3 bg-warning-subtle p-2 rounded-3 mb-1 mx-0">
        <!--리플-->
        <Col>
          <Icon name="chat"/>
          의견남기기
          <Badge color="primary">{commentData.length}</Badge>
        </Col>
        <Col class="text-end">
          <Button class="fw-bolder py-0" onclick={comments} outline>
            <Icon name="arrow-repeat"/>
          </Button>
        </Col>
      </Row>
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
                    <img
                      alt="프로필 사진"
                      class="card-img-left rounded-start"
                      style="max-height: 40px; width: 100%; height: auto;"
                      src={comment.photo}
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
            <Col xs="auto" class="border-end p-0">
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
                {#if editingCommentId === comment._id}
                  <!-- 댓글 수정 모드 -->
                  <div class="border p-3 rounded-4 shadow-sm bg-light position-relative">
                    {#if commentLoading}
                      <div class="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center rounded-4" style="z-index: 1000; background-color: rgba(255, 255, 255, 0.75);">
                        <div class="text-center">
                          <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Loading...</span>
                          </div>
                          <div class="mt-2 fw-bold">댓글 저장 중...</div>
                        </div>
                      </div>
                    {/if}
                    
                    <!-- 이미지 업로드 -->
                    <InputGroup class="mb-2">
                      <input
                        type="file"
                        bind:this={editCommentImageEl}
                        onchange={(evt) => previewEditImage(evt, editPreviewEl)}
                        accept="image/*"
                        class="form-control m-2"
                      />
                      {#if editPreviewEl && editPreviewEl.src}
                        <Button 
                          color="danger" 
                          size="sm" 
                          outline 
                          onclick={removeEditCommentImage}
                          class="ms-2"
                        >
                          <Icon name="trash"/>
                          이미지 삭제
                        </Button>
                      {/if}
                    </InputGroup>

                    <!-- 이미지 미리보기 -->
                    <div class="mb-2">
                      <img
                        src=""
                        class="d-none"
                        bind:this={editPreviewEl}
                        alt="댓글 이미지 미리보기"
                        style="max-width: 100%"
                      />
                    </div>

                    <!-- 댓글 내용 입력 -->
                    <InputGroup>
                      <textarea
                        bind:value={editCommentContent}
                        onpaste={(evt) => previewEditImage(evt, editPreviewEl)}
                        class="form-control border border-gray rounded-start-3"
                        rows="3"
                        placeholder="댓글 내용을 입력하세요"
                      ></textarea>
                      <Button color="success" onclick={saveEditComment} class="z-2">
                        <Icon name="check"/>
                        저장
                      </Button>
                      <Button color="secondary" onclick={cancelEditComment} class="z-2">
                        <Icon name="x"/>
                        취소
                      </Button>
                    </InputGroup>
                  </div>
                {:else}
                  <!-- 일반 댓글 표시 모드 -->
                  {#if comment.state === 'write' && comment.image}
                    <Row class="pb-3 mx-0">
                      <Col class="p-0 ps-1 m-0">
                        <img 
                          src={comment.image} 
                          alt="리플 짤" 
                          style="max-width: 100%;max-height: {browser ? (getImageMaxHeight(document.querySelector(`img[src='${comment.image}']`)) || '500px') : '500px'};"
                          onload={async (e) => {
                            const img = e.target;
                            
                            // 서버에 저장된 이미지는 이미 올바른 방향으로 회전됨
                            
                            img.style.maxHeight = getImageMaxHeight(img);
                          }}
                        />
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
                        {/if}
                        <div bind:this={commentDiv} data-comment-id={comment._id}>
                          {@html viewComment(comment.content)}
                        </div>
                        
                        <!-- OG 미리보기 처리 -->
                        {#each extractUrls(comment.content) as url}
                          {#if !url.includes('youtube.com') && !url.includes('youtu.be')}
                            <OGPreview {url} />
                          {/if}
                        {/each}
                      </div>
                    {/if}
                  {/if}
                {/if}
              </Col>

                </Row>

              </Col>
            </Row>

              {#if data.session?.user.nickname && comment.state === 'write'}
                <Row class="mt-2">
                  <Col class="text-end pe-2 m-0">
                    {#if comment.email === data.session?.user.email}
                      <Button
                        onclick={() => deleteComment(comment._id)}
                        size="sm"
                        outline
                        color="danger px-2 py-0"
                      >
                        <Icon name="trash"/>
                        삭제
                      </Button>
                      <Button 
                        onclick={() => startEditComment(comment)}
                        size="sm" 
                        outline 
                        color="primary px-2 py-0"
                        disabled={editingCommentId !== ''}
                      >
                        <Icon name="pencil"/>
                        수정
                      </Button>
                    {/if}
                    <Button
                      on:click|once={() => likeComment(comment._id)}
                      size="sm"
                      outline
                      color="primary"
                      disabled={comment.liked}
                      class="px-3 py-0 comment-like-btn {commentLikeAnimations.has(comment._id) ? 'like-animation' : ''}"
                      data-comment-id={comment._id}
                    >
                      <Icon name={comment.liked?"hand-thumbs-up-fill":"hand-thumbs-up"}/>
                      {comment.like || ''}
                    </Button>
                    <Button
                      onclick={() => visibleReply = comment._id}
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
            <div class="border p-3 mb-2 rounded-4 shadow-sm position-relative" bind:this={reCommentDiv}>
              {#if commentLoading}
                <div class="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center rounded-4" style="z-index: 1000; background-color: rgba(255, 255, 255, 0.75);">
                  <div class="text-center">
                    <div class="spinner-border text-primary" role="status">
                      <span class="visually-hidden">Loading...</span>
                    </div>
                    <div class="mt-2 fw-bold">댓글 저장 중...</div>
                  </div>
                </div>
              {/if}
              <InputGroup class="mb-2">

                <input
                  type="file"
                  bind:this={reCommentImageEl}
                  onchange={(evt)=>preview(evt, rePreviewEl)}
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
                  onpaste={(evt)=>preview(evt, rePreviewEl)}
                  class="form-control border border-gray rounded-start-3"
                  rows="3"
                ></textarea>
                <Button color="primary" outline onclick={()=>writeComment(comment._id)}>
                  <Icon name="pencil-fill"/>
                  등록
                </Button>
              </InputGroup>
            </div>
          </div>
        {/if}
      {/each}

      <!--목록 끝-->

      {#if commentData?.length}

      <Row class="my-3 bg-warning-subtle p-2 rounded-3 mb-1 mx-0">
        <!--리플-->
        <Col>
          <Icon name="chat"/>
          의견남기기
          <Badge color="primary">{commentData.length}</Badge>
        </Col>
        <Col class="text-end">
          <Button class="fw-bolder py-0" onclick={comments} outline>
            <Icon name="arrow-repeat"/>
          </Button>
        </Col>
      </Row>

      {/if}


      <!-- 댓글 입력 -->
      {#if data.session?.user.nickname}
        <div class="border p-3 rounded-4 shadow-sm mt-3 position-relative" bind:this={commentDiv}>
          {#if commentLoading}
            <div class="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center rounded-4" style="z-index: 1000; background-color: rgba(255, 255, 255, 0.75); left: 0; right: 0; top: 0; bottom: 0;">
              <div class="text-center">
                <div class="spinner-border text-primary" role="status">
                  <span class="visually-hidden">Loading...</span>
                </div>
                <div class="mt-2 fw-bold">댓글 저장 중...</div>
              </div>
            </div>
          {/if}
          <InputGroup class="mb-2">

            <input
              type="file"
              bind:this={commentImageEl}
              onchange={(evt)=>preview(evt, previewEl)}
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
              onpaste={(evt)=>preview(evt, previewEl)}
              class="form-control border border-gray rounded-start-3"
              rows="3"
            ></textarea>
            <Button color="primary" outline onclick={()=>writeComment()} class="z-2">
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
        {#if data.article.email === data.session?.user.email}
          <Button class="ps-1 pe-2" color="danger" onclick={() => remove(data.article._id)}>
            <Icon name="trash"/>
            삭제
          </Button>
          <Button class="ps-1 pe-2" color="success" onclick={() => edit(data.article._id)}>
            <Icon name="pencil"/>
            수정
          </Button>
        {/if}
        <Button class="ps-1 pe-2" color="primary" onclick={write}>
          <Icon name="pencil-fill"/>
          글쓰기
        </Button>
        <Button class="ps-1 pe-2 " color="secondary" onclick={list}>
          <Icon name="list"/>
          목록
        </Button>
      </Col>
    </Row>

  </Row>


  <!-- 목록-->
  <Row class="mt-4 shadow rounded-4 p-1 m-0">

    <BoardList {data} {write} {boardId} {pageNo} session={data.session}/>

  </Row>

</main>

<style>
  /* 댓글 좋아요 애니메이션 */
  .comment-like-btn {
    position: relative;
    transition: all 0.3s ease;
    overflow: hidden;
  }

  .comment-like-btn.like-animation {
    animation: likePulse 0.6s ease-in-out;
    transform: scale(1.2);
    background-color: #ff6b6b !important;
    color: white !important;
    border-color: #ff6b6b !important;
  }

  @keyframes likePulse {
    0% {
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(255, 107, 107, 0.7);
    }
    50% {
      transform: scale(1.3);
      box-shadow: 0 0 0 10px rgba(255, 107, 107, 0);
    }
    100% {
      transform: scale(1.2);
      box-shadow: 0 0 0 0 rgba(255, 107, 107, 0);
    }
  }

  /* 하트 파티클 효과 */
  .comment-like-btn.like-animation::before {
    content: '❤️';
    position: absolute;
    top: -20px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 20px;
    animation: heartFloat 1s ease-out forwards;
    pointer-events: none;
    z-index: 1000;
  }

  .comment-like-btn.like-animation::after {
    content: '✨';
    position: absolute;
    top: -15px;
    left: 30%;
    transform: translateX(-50%);
    font-size: 16px;
    animation: sparkleFloat 1s ease-out 0.2s forwards;
    pointer-events: none;
    z-index: 1000;
  }

  @keyframes heartFloat {
    0% {
      opacity: 1;
      transform: translateX(-50%) translateY(0) scale(0.5);
    }
    50% {
      opacity: 1;
      transform: translateX(-50%) translateY(-30px) scale(1.2);
    }
    100% {
      opacity: 0;
      transform: translateX(-50%) translateY(-60px) scale(1);
    }
  }

  @keyframes sparkleFloat {
    0% {
      opacity: 1;
      transform: translateX(-50%) translateY(0) scale(0.3);
    }
    50% {
      opacity: 1;
      transform: translateX(-50%) translateY(-25px) scale(1);
    }
    100% {
      opacity: 0;
      transform: translateX(-50%) translateY(-50px) scale(0.8);
    }
  }

  /* 호버 효과 */
  .comment-like-btn:hover:not(:disabled) {
    transform: scale(1.05);
    box-shadow: 0 4px 8px rgba(0, 123, 255, 0.3);
  }

  .comment-like-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* 좋아요 버튼 아이콘 애니메이션 */
  .comment-like-btn.like-animation svg {
    animation: iconBounce 0.6s ease-in-out;
  }

  @keyframes iconBounce {
    0%, 100% {
      transform: rotate(0deg);
    }
    25% {
      transform: rotate(-10deg);
    }
    75% {
      transform: rotate(10deg);
    }
  }
</style>

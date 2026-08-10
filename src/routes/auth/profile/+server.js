import { error, json } from '@sveltejs/kit';
import { getPrisma } from '$lib/database/prisma.js';
import { verifyRecaptchaToken } from '$lib/server/recaptcha.js';
import { write } from '$lib/util/fileUpload.js';
import { invalidateUser } from '$lib/server/auth/userCache.js';
import { isNicknameAllowed } from '$lib/util/nickname.js';
import logger from '$lib/util/logger.js';
import { serializeError } from '$lib/util/formatErrorTrace.js';

import { invalidateSession } from '$lib/server/auth/sessionCache.js';

const loggedProfileSaveErrors = new WeakSet();

/**
 * @param {unknown} err
 * @returns {number | undefined}
 */
function getErrorStatus(err) {
  if (!err || typeof err !== 'object' || !('status' in err)) return undefined;
  const status = /** @type {{ status?: unknown }} */ (err).status;
  return typeof status === 'number' ? status : undefined;
}

/**
 * @param {unknown} err
 * @returns {string | undefined}
 */
function getErrorMessage(err) {
  if (err instanceof Error) return err.message;
  if (!err || typeof err !== 'object') return undefined;

  const parsed = /** @type {{ body?: { message?: unknown }; message?: unknown }} */ (err);
  if (typeof parsed.body?.message === 'string') return parsed.body.message;
  if (typeof parsed.message === 'string') return parsed.message;
  return undefined;
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function wasProfileSaveErrorLogged(err) {
  return Boolean(err && typeof err === 'object' && loggedProfileSaveErrors.has(err));
}

/**
 * @param {unknown} err
 */
function markProfileSaveErrorLogged(err) {
  if (err && typeof err === 'object') loggedProfileSaveErrors.add(err);
}

/**
 * @param {unknown} err
 * @param {Record<string, unknown>} metadata
 */
function logProfileSaveFailure(err, metadata) {
  const status = getErrorStatus(err);
  const level = status && status < 500 ? 'warn' : 'error';
  logger[level]({
    message: '프로필 저장 실패',
    event: 'profile.save.failed',
    status,
    errorMessage: getErrorMessage(err),
    error: serializeError(err),
    ...metadata
  });
  markProfileSaveErrorLogged(err);
}

/**
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
function getRequestMeta(event) {
  return {
    pathname: event.url.pathname,
    method: event.request.method
  };
}

export async function PATCH(event) {
  const { request, locals, cookies } = event;
  let stage = 'session';
  let email = '';
  let nicknameLength;
  let introductionLength;
  let hasPhotoUpload = false;
  let profileFailureLogged = false;
  /** @type {{ type?: string; size?: number } | undefined} */
  let photo;

  try {
    const session = await locals.auth();
    email = typeof session?.user?.email === 'string' ? session.user.email : '';

    if (!email) {
      throw error(401, { message: '로그인 해 주세요' });
    }

    stage = 'parse-form';
    const formData = await request.formData();

    stage = 'recaptcha';
    const captcha = await verifyRecaptchaToken(
      formData.get('recaptchaToken')?.toString(),
      'register'
    );
    if (!captcha.ok) {
      throw error(400, { message: captcha.message });
    }

    //파일 저장
    let storeFileName;

    const photoFile = formData.get('photo');
    if (photoFile && photoFile instanceof File && photoFile.size > 0) {
      hasPhotoUpload = true;
      photo = { type: photoFile.type, size: photoFile.size };
      // 파일 크기 제한 (10MB)
      const maxSize = 10 * 1024 * 1024;
      if (photoFile.size > maxSize) {
        throw error(400, { message: '파일 크기는 10MB 이하여야 합니다.' });
      }

      try {
        stage = 'file-upload';
        let fileToUpload = photoFile;
        // 움짤 등 서버 크롭 파라미터가 있는지 확인
        const cropX = formData.get('cropX');
        const cropY = formData.get('cropY');
        const cropW = formData.get('cropW');
        const cropH = formData.get('cropH');
        if (
          typeof cropX === 'string' &&
          typeof cropY === 'string' &&
          typeof cropW === 'string' &&
          typeof cropH === 'string'
        ) {
          const x = parseInt(cropX);
          const y = parseInt(cropY);
          const w = parseInt(cropW);
          const h = parseInt(cropH);

          if (!isNaN(x) && !isNaN(y) && !isNaN(w) && !isNaN(h)) {
            const sharp = (await import('sharp')).default;
            const buffer = Buffer.from(await photoFile.arrayBuffer());
            const croppedBuffer = await sharp(buffer, { animated: true })
              .extract({ left: x, top: y, width: w, height: h })
              .toBuffer();

            fileToUpload = new File([new Uint8Array(croppedBuffer)], photoFile.name, {
              type: photoFile.type
            });
          }
        }

        // 타임아웃 처리 (30초)
        const uploadPromise = write(fileToUpload, email, 'profiles');
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('파일 업로드 타임아웃')), 30000)
        );

        storeFileName = await Promise.race([uploadPromise, timeoutPromise]);

        if (!storeFileName) {
          throw error(500, { message: '파일 저장에 실패 하였습니다.' });
        }
      } catch (uploadErr) {
        console.error('파일 업로드 오류:', uploadErr);
        logProfileSaveFailure(uploadErr, {
          stage,
          hasPhotoUpload,
          photo
        });
        profileFailureLogged = true;

        if (uploadErr instanceof Error && uploadErr.message === '파일 업로드 타임아웃') {
          throw error(408, {
            message: '파일 업로드 시간이 초과되었습니다. 파일 크기를 줄여주세요.'
          });
        }

        // SvelteKit error는 그대로 throw
        if (uploadErr && typeof uploadErr === 'object' && 'status' in uploadErr) {
          throw uploadErr;
        }

        throw error(500, { message: '파일 저장 중 오류가 발생했습니다.' });
      }
    }

    stage = 'validate-nickname';
    const nicknameRaw = String(formData.get('nickname') || '');
    nicknameLength = nicknameRaw.length;
    if (!isNicknameAllowed(nicknameRaw)) {
      throw error(400, { message: '닉네임에 사용할 수 없는 문자가 포함되어 있습니다.' });
    }

    introductionLength = String(formData.get('introduction') || '').length;

    /** @type {import('@prisma/client').Prisma.UserUpdateInput} */
    const updateData = {
      nickname: nicknameRaw,
      introduction: String(formData.get('introduction') || ''),
      state: 'registered'
    };

    if (storeFileName) {
      updateData.photo = storeFileName;
    }

    try {
      stage = 'database-update';
      const existing = await getPrisma().user.findFirst({
        where: { email, state: { not: 'banned' } }
      });

      if (!existing) {
        throw error(404, { message: '사용자를 찾을 수 없습니다.' });
      }

      const registeredUser = await getPrisma().user.update({
        where: { id: existing.id },
        data: updateData
      });

      await invalidateUser(registeredUser.id, registeredUser.email ?? email);

      const sessionToken =
        cookies.get('__Secure-authjs.session-token') || cookies.get('authjs.session-token');
      if (sessionToken) {
        await invalidateSession(sessionToken);
      }

      // session은 직접 수정하지 않고 응답만 반환
      // 클라이언트에서 다시 로그인하도록 안내
      return json({
        success: true,
        nickname: registeredUser.nickname,
        photo: registeredUser.photo,
        message: '프로필이 업데이트되었습니다.'
      });
    } catch (err) {
      console.error('프로필 업데이트 실패:', err);
      logProfileSaveFailure(err, {
        stage,
        nicknameLength,
        introductionLength,
        hasPhotoUpload,
        photo,
        storedPhoto: Boolean(storeFileName)
      });
      profileFailureLogged = true;

      // SvelteKit error는 그대로 throw
      if (err && typeof err === 'object' && 'status' in err) {
        throw err;
      }

      throw error(500, { message: '저장에 실패했습니다.' });
    }
  } catch (topLevelErr) {
    console.error('프로필 업데이트 전체 프로세스 실패:', topLevelErr);
    if (!profileFailureLogged && !wasProfileSaveErrorLogged(topLevelErr)) {
      logProfileSaveFailure(topLevelErr, {
        stage,
        nicknameLength,
        introductionLength,
        hasPhotoUpload,
        photo,
        ...getRequestMeta(event)
      });
    }

    // SvelteKit error는 그대로 throw
    if (topLevelErr && typeof topLevelErr === 'object' && 'status' in topLevelErr) {
      throw topLevelErr;
    }

    throw error(500, { message: '프로필 업데이트 중 오류가 발생했습니다.' });
  }
}

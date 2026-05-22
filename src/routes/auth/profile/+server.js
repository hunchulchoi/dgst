import { error, json } from '@sveltejs/kit';
import connectDB from '$lib/database/mongoosePriomise.js';
import { verifyRecaptchaToken } from '$lib/server/recaptcha.js';
import { write } from '$lib/util/fileUpload.js';
import { invalidateUser } from '$lib/server/auth/userCache.js';
import { User } from '$lib/models/user.js';
import { isNicknameAllowed } from '$lib/util/nickname.js';

import { invalidateSession } from '$lib/server/auth/sessionCache.js';

connectDB();

export async function PATCH({ request, locals, cookies }) {
  try {
    const session = await locals.auth();

    if (!session || !session.user?.email) {
      throw error(401, { message: '로그인 해 주세요' });
    }

    const formData = await request.formData();

    const captcha = await verifyRecaptchaToken(
      formData.get('recaptchaToken')?.toString(),
      'register'
    );
    if (!captcha.ok) {
      throw error(400, { message: captcha.message });
    }

    console.debug('formData', formData, 'session', session);

    console.debug(
      'photo222',
      formData.get('photo'),
      formData.get('photo') === 'undefined',
      formData.get('photo') === undefined
    );

    //파일 저장
    let storeFileName;

    const photoFile = formData.get('photo');
    if (photoFile && photoFile instanceof File && photoFile.size > 0) {
      // 파일 크기 제한 (10MB)
      const maxSize = 10 * 1024 * 1024;
      if (photoFile.size > maxSize) {
        throw error(400, { message: '파일 크기는 10MB 이하여야 합니다.' });
      }

      try {
        let fileToUpload = photoFile;
        // 움짤 등 서버 크롭 파라미터가 있는지 확인
        const cropX = formData.get('cropX');
        if (cropX !== null) {
          const x = parseInt(cropX);
          const y = parseInt(formData.get('cropY'));
          const w = parseInt(formData.get('cropW'));
          const h = parseInt(formData.get('cropH'));

          if (!isNaN(x) && !isNaN(y) && !isNaN(w) && !isNaN(h)) {
            const sharp = (await import('sharp')).default;
            const buffer = Buffer.from(await photoFile.arrayBuffer());
            const croppedBuffer = await sharp(buffer, { animated: true })
              .extract({ left: x, top: y, width: w, height: h })
              .toBuffer();

            fileToUpload = new File([croppedBuffer], photoFile.name, { type: photoFile.type });
          }
        }

        // 타임아웃 처리 (30초)
        const uploadPromise = write(fileToUpload, session.user.email, 'profiles');
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('파일 업로드 타임아웃')), 30000)
        );

        storeFileName = await Promise.race([uploadPromise, timeoutPromise]);

        if (!storeFileName) {
          throw error(500, { message: '파일 저장에 실패 하였습니다.' });
        }
      } catch (uploadErr) {
        console.error('파일 업로드 오류:', uploadErr);

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

    const filter = {
      email: session.user.email,
      state: { $ne: 'banned' }
    };

    const nicknameRaw = String(formData.get('nickname') || '');
    if (!isNicknameAllowed(nicknameRaw)) {
      throw error(400, { message: '닉네임에 사용할 수 없는 문자가 포함되어 있습니다.' });
    }

    /**
     * @type {{ nickname: string; introduction: string; state: string; last_modified: Date; photo?: string }}
     */
    const update = {
      nickname: nicknameRaw,
      introduction: String(formData.get('introduction') || ''),
      state: 'registered',
      last_modified: new Date()
    };

    if (storeFileName) {
      update.photo = storeFileName;
    }

    console.debug('filter', filter, 'update', update);

    try {
      const registeredUser = await User.findOneAndUpdate(filter, update, { new: true });

      console.debug('registeredUser', registeredUser);

      if (!registeredUser) {
        throw error(404, { message: '사용자를 찾을 수 없습니다.' });
      }

      await invalidateUser(registeredUser._id?.toString?.() ?? String(registeredUser._id));

      const sessionToken = cookies.get('__Secure-authjs.session-token') || cookies.get('authjs.session-token');
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

      // SvelteKit error는 그대로 throw
      if (err && typeof err === 'object' && 'status' in err) {
        throw err;
      }

      throw error(500, { message: '저장에 실패했습니다.' });
    }
  } catch (topLevelErr) {
    console.error('프로필 업데이트 전체 프로세스 실패:', topLevelErr);

    // SvelteKit error는 그대로 throw
    if (topLevelErr && typeof topLevelErr === 'object' && 'status' in topLevelErr) {
      throw topLevelErr;
    }

    throw error(500, { message: '프로필 업데이트 중 오류가 발생했습니다.' });
  }
}

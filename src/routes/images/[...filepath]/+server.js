import { error } from '@sveltejs/kit';
import * as fs from 'fs';
import { UPLOAD_PATH } from '$env/static/private';
import path from 'path';

/**
 * 정적 이미지/비디오 파일 서빙
 * @param {Object} params - 요청 파라미터
 * @returns {Response} 파일 응답
 */
export async function GET({ params }) {
  try {
    const { filepath } = params;
    const filePath = path.join(UPLOAD_PATH, filepath);

    console.log('Serving file:', filePath);

    // 경로 안전성 체크
    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(UPLOAD_PATH)) {
      console.error('Path traversal attempt:', filePath);
      throw error(403, '접근이 거부되었습니다.');
    }

    // 파일 존재 확인
    if (!fs.existsSync(filePath)) {
      console.error('File not found:', filePath);
      throw error(404, '파일을 찾을 수 없습니다.');
    }

    // 파일 읽기
    const fileBuffer = fs.readFileSync(filePath);
    const ext = path.extname(filepath).toLowerCase();

    // MIME 타입 결정
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.webm': 'video/webm'
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';

    return new Response(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000',
        'Content-Length': fileBuffer.length.toString()
      }
    });
  } catch (err) {
    console.error('Error serving file:', err);
    throw err;
  }
}


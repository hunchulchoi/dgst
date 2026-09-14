export const BOARD_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;
export const BOARD_UPLOAD_MAX_MB = BOARD_UPLOAD_MAX_BYTES / (1024 * 1024);
// 원본은 브라우저/서버에서 압축한 뒤 최종 저장 제한을 적용한다. 다만 압축 작업의
// 메모리·디스크 사용량을 제한하기 위해 원본 수신에는 별도 안전 상한을 둔다.
export const BOARD_UPLOAD_SOURCE_MAX_BYTES = 300 * 1024 * 1024;
export const BOARD_UPLOAD_SOURCE_MAX_MB = BOARD_UPLOAD_SOURCE_MAX_BYTES / (1024 * 1024);
export const BOARD_UPLOAD_BODY_SIZE_LIMIT = `${BOARD_UPLOAD_SOURCE_MAX_MB}M`;

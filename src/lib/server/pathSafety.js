import path from 'path';

/**
 * resolved 경로가 root 디렉터리 안에 있는지 검사 (path traversal 방지).
 * @param {string} candidatePath - 검사할 파일 경로
 * @param {string} rootDir - 허용 루트 (UPLOAD_PATH 등)
 * @returns {boolean}
 */
export function isPathUnderRoot(candidatePath, rootDir) {
  if (!rootDir) return false;
  const resolvedRoot = path.resolve(rootDir);
  const resolvedCandidate = path.resolve(candidatePath);
  return (
    resolvedCandidate === resolvedRoot ||
    resolvedCandidate.startsWith(resolvedRoot + path.sep)
  );
}

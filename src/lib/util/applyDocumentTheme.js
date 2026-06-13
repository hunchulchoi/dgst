/**
 * html/body 배경·Bootstrap CSS 변수를 테마에 맞게 즉시 적용한다.
 * app.html 인라인 스크립트와 동일한 로직 — bootstrap/app.css 로드 전 FOUC 방지.
 * @param {'light' | 'dark'} resolved
 */
export function applyDocumentTheme(resolved) {
  if (typeof document === 'undefined') return;

  const isLight = resolved === 'light';
  const bg = isLight ? '#ffffff' : '#212529';
  const color = isLight ? '#37352f' : '#dee2e6';
  const bgRgb = isLight ? '255, 255, 255' : '33, 37, 41';
  const root = document.documentElement;

  root.setAttribute('data-bs-theme', resolved);
  root.style.setProperty('--bs-body-bg', bg, 'important');
  root.style.setProperty('--bs-body-bg-rgb', bgRgb, 'important');
  root.style.setProperty('--bs-body-color', color, 'important');
  root.style.backgroundColor = bg;
  root.style.color = color;

  if (document.body) {
    document.body.style.backgroundColor = bg;
    document.body.style.color = color;
  }
}

/**
 * @param {string} value
 * @returns {'light' | 'dark'}
 */
export function resolveTheme(value) {
  if (value === 'dark' || value === 'light') return value;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** @param {string} value */
function escapeDispositionValue(value) {
  return String(value).replace(/[\r\n"]/g, (character) => {
    if (character === '"') return '%22';
    return '';
  });
}

function createMultipartBoundary() {
  const suffix =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `----dgst-upload-${suffix}`;
}

/**
 * Build multipart explicitly because Safari can omit FormData's boundary.
 *
 * @param {FormData} formData
 * @param {string} [boundary]
 */
export function encodeMultipartFormData(formData, boundary = createMultipartBoundary()) {
  /** @type {(string | Blob)[]} */
  const parts = [];

  for (const [name, value] of formData.entries()) {
    const escapedName = escapeDispositionValue(name);
    parts.push(`--${boundary}\r\n`);

    if (value instanceof File) {
      const escapedFilename = escapeDispositionValue(value.name);
      parts.push(
        `Content-Disposition: form-data; name="${escapedName}"; filename="${escapedFilename}"\r\n`
      );
      parts.push(`Content-Type: ${value.type || 'application/octet-stream'}\r\n\r\n`);
      parts.push(value, '\r\n');
      continue;
    }

    parts.push(`Content-Disposition: form-data; name="${escapedName}"\r\n\r\n${String(value)}\r\n`);
  }

  parts.push(`--${boundary}--\r\n`);
  const contentType = `multipart/form-data; boundary=${boundary}`;

  return {
    body: new Blob(parts, { type: contentType }),
    contentType
  };
}

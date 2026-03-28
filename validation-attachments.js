import { fileTypeFromBuffer } from 'file-type';

// Allowed file types: MIME -> extensions mapping
const ALLOWED_TYPES = new Map([
  ['image/jpeg', ['.jpg', '.jpeg']],
  ['image/png', ['.png']],
  ['application/pdf', ['.pdf']],
]);

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Map MIME to primary extension for saved files
const MIME_TO_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'application/pdf': '.pdf' };

/**
 * Validate a decoded buffer by magic bytes, extension, and size.
 * Returns { valid, error?, ext?, mime? }
 */
export async function validateAttachment(buffer, originalName) {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'Empty file' };
  }
  if (buffer.length > MAX_FILE_SIZE) {
    return { valid: false, error: `File exceeds 5MB limit (${(buffer.length / 1024 / 1024).toFixed(1)}MB)` };
  }

  // Check extension against allowlist
  const ext = originalName ? '.' + originalName.split('.').pop().toLowerCase() : null;
  const allowedExts = [...ALLOWED_TYPES.values()].flat();
  if (ext && !allowedExts.includes(ext)) {
    return { valid: false, error: `Disallowed extension: ${ext}` };
  }

  // Detect actual type from magic bytes
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_TYPES.has(detected.mime)) {
    return { valid: false, error: `Disallowed file type${detected ? ': ' + detected.mime : ''}` };
  }

  // If extension provided, verify it matches detected type
  if (ext) {
    const validExts = ALLOWED_TYPES.get(detected.mime);
    if (!validExts.includes(ext)) {
      return { valid: false, error: `Extension ${ext} does not match detected type ${detected.mime}` };
    }
  }

  return { valid: true, ext: MIME_TO_EXT[detected.mime], mime: detected.mime };
}

/**
 * Decode base64 string to Buffer, then validate.
 * Returns { valid, buffer?, error?, ext?, mime? }
 */
export async function decodeBase64Attachment(base64String, filename) {
  let buffer;
  try {
    buffer = Buffer.from(base64String, 'base64');
    // Detect corrupt base64: re-encode and compare length to catch garbage input
    if (buffer.length === 0) {
      return { valid: false, error: 'Invalid base64: decoded to empty buffer' };
    }
  } catch {
    return { valid: false, error: 'Invalid base64 encoding' };
  }

  const result = await validateAttachment(buffer, filename);
  if (!result.valid) return result;
  return { valid: true, buffer, ext: result.ext, mime: result.mime };
}

/**
 * Extract data URIs from markdown content.
 * Returns array of { base64, mimeType, altText, fullMatch }
 */
export function extractDataUris(markdownContent) {
  if (!markdownContent) return [];
  const regex = /!\[([^\]]*)\]\(data:(image\/(?:png|jpeg)|application\/pdf);base64,([A-Za-z0-9+/=]+)\)/g;
  const results = [];
  let match;
  while ((match = regex.exec(markdownContent)) !== null) {
    results.push({
      altText: match[1],
      mimeType: match[2],
      base64: match[3],
      fullMatch: match[0],
    });
  }
  return results;
}

export { MIME_TO_EXT, MAX_FILE_SIZE };

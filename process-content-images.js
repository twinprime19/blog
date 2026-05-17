import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { extractDataUris, decodeBase64Attachment, MIME_TO_EXT } from './validation-attachments.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, 'uploads');

export async function processContentImages(content, slug, createdBy, env = null) {
  if (!content) return { cleanContent: content, attachments: [] };

  const dataUris = extractDataUris(content);
  if (dataUris.length === 0) return { cleanContent: content, attachments: [] };
  if (dataUris.length > 20) throw new Error('Too many images (max 20 per content field)');

  if (!env?.BLOG_UPLOADS) {
    const slugDir = join(UPLOADS_DIR, slug);
    await mkdir(slugDir, { recursive: true });
  }

  const attachments = [];
  let cleanContent = content;

  for (const { base64, mimeType, altText, fullMatch } of dataUris) {
    const ext = MIME_TO_EXT[mimeType];
    const filename = `${crypto.randomUUID()}${ext}`;
    const originalName = altText ? `${altText}${ext}` : filename;

    const result = await decodeBase64Attachment(base64, originalName);
    if (!result.valid) {
      throw new Error(`Invalid attachment "${altText || 'unnamed'}": ${result.error}`);
    }

    if (env?.BLOG_UPLOADS) {
      await env.BLOG_UPLOADS.put(`${slug}/${filename}`, result.buffer, {
        httpMetadata: { contentType: result.mime },
      });
    } else {
      await writeFile(join(UPLOADS_DIR, slug, filename), result.buffer);
    }

    const url = `/uploads/${slug}/${filename}`;
    cleanContent = cleanContent.split(fullMatch).join(`![${altText}](${url})`);

    attachments.push({
      filename,
      originalName,
      mimeType: result.mime,
      sizeBytes: result.buffer.length,
      url,
      alt: altText,
      createdBy,
    });
  }

  return { cleanContent, attachments };
}

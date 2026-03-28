import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { extractDataUris, decodeBase64Attachment, MIME_TO_EXT } from './validation-attachments.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, 'uploads');

/**
 * Extract data URIs from markdown, validate, save to disk, rewrite URLs.
 * @param {string} content - Markdown content potentially containing data URIs
 * @param {string} slug - Post slug (used as subdirectory name)
 * @param {string} createdBy - Agent/user name for attachment records
 * @returns {{ cleanContent: string, attachments: Array }}
 */
export async function processContentImages(content, slug, createdBy) {
  if (!content) return { cleanContent: content, attachments: [] };

  const dataUris = extractDataUris(content);
  if (dataUris.length === 0) return { cleanContent: content, attachments: [] };
  if (dataUris.length > 20) throw new Error('Too many images (max 20 per content field)');

  const slugDir = join(UPLOADS_DIR, slug);
  await mkdir(slugDir, { recursive: true });

  const attachments = [];
  let cleanContent = content;

  for (const { base64, mimeType, altText, fullMatch } of dataUris) {
    const ext = MIME_TO_EXT[mimeType];
    const filename = `${randomUUID()}${ext}`;
    const originalName = altText ? `${altText}${ext}` : filename;

    const result = await decodeBase64Attachment(base64, originalName);
    if (!result.valid) {
      throw new Error(`Invalid attachment "${altText || 'unnamed'}": ${result.error}`);
    }

    await writeFile(join(slugDir, filename), result.buffer);

    const url = `/uploads/${slug}/${filename}`;
    // split+join avoids $ replacement patterns and handles duplicate data URIs
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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm, readFile, access, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { clearPosts, apiRequest, app } from './setup.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, '..', 'uploads');

/**
 * Minimal valid file buffers with correct magic bytes.
 */
const VALID_JPEG = Buffer.from([
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
  0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
  0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
  0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
  0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
  0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
  0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
  0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
  0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
  0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45,
  0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
  0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
  0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3,
  0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6,
  0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9,
  0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
  0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4,
  0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01,
  0x00, 0x00, 0x3F, 0x00, 0x7B, 0x94, 0x11, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xD9,
]);

const VALID_PNG = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
  0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
  0x00, 0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC, 0x33, 0x00, 0x00, 0x00,
  0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
]);

const VALID_PDF = Buffer.from(
  '%PDF-1.0\n1 0 obj<</Pages 2 0 R>>endobj 2 0 obj<</Kids[3 0 R]/Count 1>>endobj 3 0 obj<</MediaBox[0 0 3 3]>>endobj\ntrailer<</Root 1 0 R>>'
);

function makeDataUri(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

beforeEach(() => clearPosts());

afterEach(async () => {
  try {
    await rm(UPLOADS_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

describe('POST /api/posts with images', () => {
  it('creates post with multi-format data URIs — all extracted, saved, content rewritten', async () => {
    const uri1 = makeDataUri(VALID_PNG, 'image/png');
    const uri2 = makeDataUri(VALID_JPEG, 'image/jpeg');
    const uri3 = makeDataUri(VALID_PDF, 'application/pdf');
    const content = `# Test Post
![my-image](${uri1})

Regular URL unchanged: ![regular](https://example.com/image.png)

![second-img](${uri2})

Some text

![document](${uri3})`;

    const res = await apiRequest('POST', '/api/posts', {
      title: 'Image Post',
      content,
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    const slug = body.slug;

    // Verify response includes all three images
    expect(body.images).toBeDefined();
    expect(body.images).toHaveLength(3);
    expect(body.images[0].alt).toBe('my-image');
    expect(body.images[0].mime_type).toBe('image/png');
    expect(body.images[0].size).toBe(VALID_PNG.length);
    expect(body.images[1].alt).toBe('second-img');
    expect(body.images[1].mime_type).toBe('image/jpeg');
    expect(body.images[2].alt).toBe('document');
    expect(body.images[2].mime_type).toBe('application/pdf');

    // Verify content was rewritten
    const post = await app.request(`/api/posts/${slug}`);
    const postData = await post.json();
    expect(postData.content).not.toMatch(/data:image/);
    expect(postData.content).not.toMatch(/data:application/);
    expect(postData.content).toMatch(/\/uploads\//);
    expect(postData.content).toMatch(/https:\/\/example\.com/);

    // Verify all files exist on disk
    for (const img of body.images) {
      const uploadPath = img.url.replace(/^\/uploads/, UPLOADS_DIR);
      const exists = await fileExists(uploadPath);
      expect(exists).toBe(true);
      const buffer = await readFile(uploadPath);
      expect(buffer.length).toBe(img.size);
    }
  });

  it('creates post with no images — no images key in response', async () => {
    const res = await apiRequest('POST', '/api/posts', {
      title: 'Text Only',
      content: '# No images\n\nJust text https://example.com/pic.png',
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.images).toBeUndefined();
  });
});

describe('PUT /api/posts/:slug with images', () => {
  it('updates post with data URIs — extracted, saved, images in response', async () => {
    // Create initial post
    await apiRequest('POST', '/api/posts', {
      title: 'Original',
      content: '# Original',
    });

    // Update with images
    const uri1 = makeDataUri(VALID_PNG, 'image/png');
    const uri2 = makeDataUri(VALID_JPEG, 'image/jpeg');
    const res = await apiRequest('PUT', '/api/posts/original', {
      content: `# Updated\n![new1](${uri1})\n![new2](${uri2})`,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.images).toHaveLength(2);
    expect(body.images[0].alt).toBe('new1');
    expect(body.images[1].alt).toBe('new2');
  });
});

describe('Static serving', () => {
  it('GET /uploads/{slug}/{file} serves file with correct Content-Type', async () => {
    const uri1 = makeDataUri(VALID_PNG, 'image/png');
    const uri2 = makeDataUri(VALID_JPEG, 'image/jpeg');
    const res = await apiRequest('POST', '/api/posts', {
      title: 'Server Test',
      content: `![p](${uri1})\n![j](${uri2})`,
    });

    const body = await res.json();

    // Test PNG file
    const pngRes = await app.request(body.images[0].url);
    expect(pngRes.status).toBe(200);
    expect(pngRes.headers.get('Content-Type')).toMatch(/image\/png/);
    const pngBuffer = Buffer.from(await pngRes.arrayBuffer());
    expect(pngBuffer).toEqual(VALID_PNG);

    // Test JPEG file
    const jpgRes = await app.request(body.images[1].url);
    expect(jpgRes.status).toBe(200);
    expect(jpgRes.headers.get('Content-Type')).toMatch(/image\/jpeg/);
    const jpgBuffer = Buffer.from(await jpgRes.arrayBuffer());
    expect(jpgBuffer).toEqual(VALID_JPEG);
  });

  it('GET /uploads/{slug}/nonexistent returns 404', async () => {
    const res = await app.request('/uploads/test-slug/nonexistent.png');
    expect(res.status).toBe(404);
  });
});

describe('Cascade cleanup on DELETE', () => {
  it('DELETE post removes upload files and disk directory', async () => {
    const uri1 = makeDataUri(VALID_PNG, 'image/png');
    const uri2 = makeDataUri(VALID_JPEG, 'image/jpeg');
    const createRes = await apiRequest('POST', '/api/posts', {
      title: 'Delete Test',
      content: `![a](${uri1})\n![b](${uri2})`,
    });

    const slug = (await createRes.json()).slug;
    const uploadDir = join(UPLOADS_DIR, slug);

    // Verify files exist on disk
    const before = await readdir(uploadDir);
    expect(before.length).toBe(2);

    // Verify directory exists
    let dirExists = await fileExists(uploadDir);
    expect(dirExists).toBe(true);

    // Delete post
    const deleteRes = await apiRequest('DELETE', `/api/posts/${slug}`);
    expect(deleteRes.status).toBe(200);

    // Verify directory removed
    dirExists = await fileExists(uploadDir);
    expect(dirExists).toBe(false);
  });
});

describe('Bilingual content (content_vi)', () => {
  it('processes images in both content and content_vi', async () => {
    const uri1 = makeDataUri(VALID_PNG, 'image/png');
    const uri2 = makeDataUri(VALID_JPEG, 'image/jpeg');

    const res = await apiRequest('POST', '/api/posts', {
      title: 'Bilingual',
      content: `# English\n![en](${uri1})`,
      content_vi: `# Tiếng Việt\n![vi](${uri2})`,
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.images).toHaveLength(2);

    const post = await app.request(`/api/posts/${body.slug}`);
    const postData = await post.json();
    expect(postData.content).toMatch(/\/uploads\//);
    expect(postData.content_vi).toMatch(/\/uploads\//);
  });
});

describe('Attachment file on disk', () => {
  it('uploaded file has correct extension and response shape', async () => {
    const uri = makeDataUri(VALID_PNG, 'image/png');
    const res = await apiRequest('POST', '/api/posts', {
      title: 'Schema Check',
      content: `![test](${uri})`,
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.images).toHaveLength(1);
    expect(body.images[0].mime_type).toBe('image/png');
    expect(body.images[0].size).toBe(VALID_PNG.length);
    expect(body.images[0].url).toMatch(/\.png$/);
    expect(body.images[0].alt).toBe('test');
  });
});

describe('Edge cases', () => {
  it('post with empty alt, special chars, PDF, various formats', async () => {
    const uri1 = makeDataUri(VALID_PNG, 'image/png');
    const uri2 = makeDataUri(VALID_JPEG, 'image/jpeg');
    const uri3 = makeDataUri(VALID_PDF, 'application/pdf');

    const content = `![Image with "quotes" & special](${uri1})

![](${uri2})

Some whitespace-heavy text


![pdf-doc](${uri3})`;

    const res = await apiRequest('POST', '/api/posts', {
      title: 'Edge Cases',
      content,
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.images).toHaveLength(3);
    expect(body.images[0].alt).toMatch(/quotes/);
    expect(body.images[1].alt).toBe('');
    expect(body.images[2].alt).toBe('pdf-doc');
  });

  it('uploaded file exists on disk after post creation', async () => {
    const uri = makeDataUri(VALID_PNG, 'image/png');
    const res = await apiRequest('POST', '/api/posts', {
      title: 'Index Test',
      content: `![img](${uri})`,
    });

    const slug = (await res.json()).slug;
    const files = await readdir(join(UPLOADS_DIR, slug));
    expect(files).toHaveLength(1);
  });
});

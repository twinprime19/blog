import { describe, it, expect } from 'vitest';
import {
  validateAttachment,
  decodeBase64Attachment,
  extractDataUris,
  MAX_FILE_SIZE,
} from '../validation-attachments.js';

/**
 * Test helper: Generate minimal valid file buffers with correct magic bytes.
 * These are the smallest possible valid files that pass magic byte detection.
 */

// Minimal valid JPEG (smallest valid JPEG file with correct magic bytes)
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

// Minimal valid PNG (1x1 pixel, white)
const VALID_PNG = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
  0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
  0x00, 0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC, 0x33, 0x00, 0x00, 0x00,
  0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
]);

// Minimal valid PDF
const VALID_PDF = Buffer.from(
  '%PDF-1.0\n1 0 obj<</Pages 2 0 R>>endobj 2 0 obj<</Kids[3 0 R]/Count 1>>endobj 3 0 obj<</MediaBox[0 0 3 3]>>endobj\ntrailer<</Root 1 0 R>>'
);

describe('validateAttachment', () => {
  it('accepts valid JPEG with correct magic bytes and extension', async () => {
    const result = await validateAttachment(VALID_JPEG, 'photo.jpg');
    expect(result.valid).toBe(true);
    expect(result.mime).toBe('image/jpeg');
    expect(result.ext).toBe('.jpg');
  });

  it('accepts valid PNG with correct magic bytes and extension', async () => {
    const result = await validateAttachment(VALID_PNG, 'screenshot.png');
    expect(result.valid).toBe(true);
    expect(result.mime).toBe('image/png');
    expect(result.ext).toBe('.png');
  });

  it('accepts valid PDF with correct magic bytes and extension', async () => {
    const result = await validateAttachment(VALID_PDF, 'document.pdf');
    expect(result.valid).toBe(true);
    expect(result.mime).toBe('application/pdf');
    expect(result.ext).toBe('.pdf');
  });

  it('rejects disallowed extension (.html)', async () => {
    const result = await validateAttachment(VALID_PNG, 'malicious.html');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/disallowed extension/i);
  });

  it('rejects disallowed extension (.js)', async () => {
    const result = await validateAttachment(VALID_PNG, 'script.js');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/disallowed extension/i);
  });

  it('rejects mismatched magic bytes (PNG header in .jpg file)', async () => {
    const result = await validateAttachment(VALID_PNG, 'fake.jpg');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/extension|detected type/i);
  });

  it('rejects file over 5MB', async () => {
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);
    // Copy JPEG header to make it appear valid
    VALID_JPEG.copy(oversized, 0);
    const result = await validateAttachment(oversized, 'huge.jpg');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/exceeds.*5MB/i);
  });

  it('rejects empty/zero-byte file', async () => {
    const result = await validateAttachment(Buffer.alloc(0), 'empty.png');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });

  it('rejects null buffer', async () => {
    const result = await validateAttachment(null, 'null.jpg');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });

  it('accepts alternate JPEG extension (.jpeg)', async () => {
    const result = await validateAttachment(VALID_JPEG, 'photo.jpeg');
    expect(result.valid).toBe(true);
    expect(result.mime).toBe('image/jpeg');
  });

  it('rejects disallowed MIME type (even with valid magic bytes)', async () => {
    // Create a buffer with unrecognized magic bytes
    const unrecognized = Buffer.from([0x00, 0x00, 0x00, 0x00]);
    const result = await validateAttachment(unrecognized, 'unknown.xyz');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/disallowed/i);
  });

  it('validates file at exactly 5MB boundary', async () => {
    const maxSize = Buffer.alloc(MAX_FILE_SIZE);
    VALID_JPEG.copy(maxSize, 0);
    const result = await validateAttachment(maxSize, 'max.jpg');
    expect(result.valid).toBe(true);
  });
});

describe('decodeBase64Attachment', () => {
  it('decodes valid base64 and validates successfully', async () => {
    const base64 = VALID_JPEG.toString('base64');
    const result = await decodeBase64Attachment(base64, 'photo.jpg');
    expect(result.valid).toBe(true);
    expect(result.buffer).toEqual(VALID_JPEG);
    expect(result.mime).toBe('image/jpeg');
  });

  it('rejects invalid base64 encoding', async () => {
    const result = await decodeBase64Attachment('not@valid#base64!', 'file.jpg');
    expect(result.valid).toBe(false);
    // Invalid base64 decodes to garbage that fails magic byte validation
    expect(result.error).toBeDefined();
  });

  it('rejects valid base64 that decodes to disallowed type', async () => {
    const badData = Buffer.from('Hello World!');
    const base64 = badData.toString('base64');
    const result = await decodeBase64Attachment(base64, 'text.jpg');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/disallowed/i);
  });

  it('rejects base64 that decodes to empty buffer', async () => {
    const result = await decodeBase64Attachment('', 'empty.jpg');
    expect(result.valid).toBe(false);
  });

  it('passes through validation errors from validateAttachment', async () => {
    const base64 = VALID_PNG.toString('base64');
    const result = await decodeBase64Attachment(base64, 'fake.jpg');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('extractDataUris', () => {
  it('extracts single data URI from markdown', () => {
    const content = `![My Image](data:image/png;base64,${VALID_PNG.toString('base64')})`;
    const results = extractDataUris(content);
    expect(results).toHaveLength(1);
    expect(results[0].altText).toBe('My Image');
    expect(results[0].mimeType).toBe('image/png');
    expect(results[0].base64).toBeDefined();
  });

  it('extracts multiple data URIs from content', () => {
    const base64Png = VALID_PNG.toString('base64');
    const base64Jpg = VALID_JPEG.toString('base64');
    const content = `
      ![first](data:image/png;base64,${base64Png})
      Some text
      ![second](data:image/jpeg;base64,${base64Jpg})
    `;
    const results = extractDataUris(content);
    expect(results).toHaveLength(2);
    expect(results[0].altText).toBe('first');
    expect(results[1].altText).toBe('second');
  });

  it('returns empty array for content with no data URIs', () => {
    const content = '# Hello\n\n![regular](https://example.com/image.png)\n\nNo data URIs here.';
    const results = extractDataUris(content);
    expect(results).toHaveLength(0);
  });

  it('ignores regular URLs (not data URIs)', () => {
    const content = `
      ![ignored](https://example.com/image.png)
      ![another](http://other.com/pic.jpg)
    `;
    const results = extractDataUris(content);
    expect(results).toHaveLength(0);
  });

  it('ignores disallowed MIME types (data:text/html)', () => {
    const htmlData = Buffer.from('<script>alert("xss")</script>');
    const base64 = htmlData.toString('base64');
    const content = `![dangerous](data:text/html;base64,${base64})`;
    const results = extractDataUris(content);
    expect(results).toHaveLength(0);
  });

  it('extracts alt text correctly (including empty alt)', () => {
    const base64 = VALID_PNG.toString('base64');
    const content = `
      ![Alt With Spaces](data:image/png;base64,${base64})
      ![](data:image/png;base64,${base64})
    `;
    const results = extractDataUris(content);
    expect(results).toHaveLength(2);
    expect(results[0].altText).toBe('Alt With Spaces');
    expect(results[1].altText).toBe('');
  });

  it('returns empty for null or undefined content', () => {
    expect(extractDataUris(null)).toEqual([]);
    expect(extractDataUris(undefined)).toEqual([]);
    expect(extractDataUris('')).toEqual([]);
  });

  it('handles PDF data URIs', () => {
    const base64 = VALID_PDF.toString('base64');
    const content = `![document](data:application/pdf;base64,${base64})`;
    const results = extractDataUris(content);
    expect(results).toHaveLength(1);
    expect(results[0].mimeType).toBe('application/pdf');
  });

  it('extracts fullMatch for URL rewriting', () => {
    const base64 = VALID_PNG.toString('base64');
    const original = `![alt](data:image/png;base64,${base64})`;
    const content = `Some text ${original} more text`;
    const results = extractDataUris(content);
    expect(results[0].fullMatch).toBe(original);
  });
});

import { describe, it, expect } from 'vitest';
import { apiRequest } from './setup.js';
import { slugify } from '../helpers.js';

describe('slugify', () => {
  it('transliterates Vietnamese tone marks', () => {
    expect(slugify('Bài viết về trí tuệ nhân tạo')).toBe('bai-viet-ve-tri-tue-nhan-tao');
  });

  it('transliterates đ and Đ', () => {
    expect(slugify('Đường đến thành công')).toBe('duong-den-thanh-cong');
  });

  it('handles plain ASCII', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('preserves numbers', () => {
    expect(slugify('Top 10 Tips')).toBe('top-10-tips');
  });

  it('returns empty string for empty input', () => {
    expect(slugify('')).toBe('');
  });

  it('collapses special characters to single hyphen', () => {
    expect(slugify('Hello!@#World')).toBe('hello-world');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('---test---')).toBe('test');
  });
});

describe('Input validation', () => {
  it('rejects missing title', async () => {
    const res = await apiRequest('POST', '/api/posts', { content: 'body' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/title/i);
  });

  it('rejects missing content', async () => {
    const res = await apiRequest('POST', '/api/posts', { title: 'No body' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/content/i);
  });

  it('rejects title over 200 chars', async () => {
    const res = await apiRequest('POST', '/api/posts', { title: 'x'.repeat(201), content: 'body' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/title/i);
  });

  it('rejects oversized content', async () => {
    // 20MB body limit catches this before validation — either 400 (JSON parse) or 413 (body limit)
    const res = await apiRequest('POST', '/api/posts', { title: 'Big', content: 'x'.repeat(20 * 1024 * 1024 + 1) });
    expect([400, 413]).toContain(res.status);
  });

  it('rejects invalid status value', async () => {
    const res = await apiRequest('POST', '/api/posts', { title: 'Bad Status', content: 'x', status: 'archived' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/status/i);
  });

  it('rejects javascript: in cover_image (C3)', async () => {
    const res = await apiRequest('POST', '/api/posts', { title: 'XSS', content: 'x', cover_image: 'javascript:alert(1)' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cover_image/i);
  });

  it('rejects data: URI in cover_image', async () => {
    const res = await apiRequest('POST', '/api/posts', { title: 'Data', content: 'x', cover_image: 'data:text/html,<script>' });
    expect(res.status).toBe(400);
  });

  it('accepts https:// cover_image', async () => {
    const res = await apiRequest('POST', '/api/posts', { title: 'Valid', content: 'x', cover_image: 'https://img.example.com/photo.jpg' });
    expect(res.status).toBe(201);
  });

  it('accepts relative path / cover_image', async () => {
    const res = await apiRequest('POST', '/api/posts', { title: 'Relative', content: 'x', cover_image: '/uploads/photo.jpg', slug: 'relative-img' });
    expect(res.status).toBe(201);
  });
});

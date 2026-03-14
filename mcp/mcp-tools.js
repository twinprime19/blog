import { z } from 'zod';

const TIMEOUT_MS = 15_000;
const getBaseUrl = () => process.env.THE_WIRE_URL || 'http://localhost:3000';

function getToken() {
  const token = process.env.THE_WIRE_TOKEN;
  if (!token) throw new Error('THE_WIRE_TOKEN env var is not set. Configure it in your MCP server config.');
  return token;
}

// Shared HTTP helper — calls The Wire REST API with auth header
async function apiCall(method, path, body) {
  const url = `${getBaseUrl()}${path}`;
  const headers = { 'Authorization': `Bearer ${getToken()}` };
  if (body) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === 'TimeoutError') throw new Error(`Request to The Wire timed out after ${TIMEOUT_MS / 1000}s`);
    throw new Error(`Cannot connect to The Wire at ${getBaseUrl()}: ${err.message}`);
  }

  // Parse response safely — API may return non-JSON on proxy errors
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { error: text || `HTTP ${res.status}` }; }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// Tool definitions: schema (zod) + description + handler
export const TOOLS = {
  list_posts: {
    description: 'List published blog posts (newest first)',
    schema: {
      page: z.number().optional().describe('Page number (default 1)'),
      limit: z.number().optional().describe('Posts per page (default 20, max 100)'),
    },
    handler: async ({ page, limit }) => {
      const params = new URLSearchParams();
      if (page !== undefined) params.set('page', String(page));
      if (limit !== undefined) params.set('limit', String(limit));
      const qs = params.toString();
      const data = await apiCall('GET', `/api/posts${qs ? `?${qs}` : ''}`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    },
  },

  get_post: {
    description: 'Get a single blog post by its slug (returns full content)',
    schema: {
      slug: z.string().describe('The URL slug of the post'),
    },
    handler: async ({ slug }) => {
      const data = await apiCall('GET', `/api/posts/${encodeURIComponent(slug)}`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    },
  },

  create_post: {
    description: 'Create a new blog post',
    schema: {
      title: z.string().describe('Post title (required)'),
      content: z.string().describe('Markdown body (required)'),
      subtitle: z.string().optional().describe('Subtitle / deck'),
      author: z.string().optional().describe('Author name (defaults to "Anonymous")'),
      slug: z.string().optional().describe('URL slug (auto-generated from title if omitted)'),
      cover_image: z.string().optional().describe('URL to cover image'),
      status: z.enum(['published', 'draft']).optional().describe('Post status (default "published")'),
      title_vi: z.string().optional().describe('Vietnamese title'),
      content_vi: z.string().optional().describe('Vietnamese content (Markdown)'),
      subtitle_vi: z.string().optional().describe('Vietnamese subtitle'),
    },
    handler: async (args) => {
      const data = await apiCall('POST', '/api/posts', args);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    },
  },

  update_post: {
    description: 'Update an existing blog post by slug',
    schema: {
      slug: z.string().describe('Slug of the post to update (required)'),
      title: z.string().optional().describe('New title'),
      content: z.string().optional().describe('New Markdown body'),
      subtitle: z.string().optional().describe('New subtitle'),
      author: z.string().optional().describe('New author name'),
      cover_image: z.string().optional().describe('New cover image URL'),
      status: z.enum(['published', 'draft']).optional().describe('New status'),
      title_vi: z.string().optional().describe('New Vietnamese title'),
      content_vi: z.string().optional().describe('New Vietnamese content (Markdown)'),
      subtitle_vi: z.string().optional().describe('New Vietnamese subtitle'),
    },
    handler: async ({ slug, ...fields }) => {
      if (Object.keys(fields).length === 0) throw new Error('No fields to update. Provide at least one field besides slug.');
      const data = await apiCall('PUT', `/api/posts/${encodeURIComponent(slug)}`, fields);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    },
  },

  delete_post: {
    description: 'Delete a blog post by slug',
    schema: {
      slug: z.string().describe('Slug of the post to delete (required)'),
    },
    handler: async ({ slug }) => {
      const data = await apiCall('DELETE', `/api/posts/${encodeURIComponent(slug)}`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    },
  },
};

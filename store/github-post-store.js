import matter from 'gray-matter';

const API = 'https://api.github.com';
const VI_SEPARATOR = '\n---vi---\n';

function toB64(str) {
  if (typeof Buffer !== 'undefined') return Buffer.from(str, 'utf8').toString('base64');
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromB64(str) {
  if (typeof Buffer !== 'undefined') return Buffer.from(str, 'base64').toString('utf8');
  const bin = atob(str);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function parseBody(content) {
  const parts = (content || '').split(VI_SEPARATOR);
  return { content: (parts[0] || '').trim(), content_vi: parts[1] ? parts[1].trim() : null };
}

function buildBody(content, contentVi) {
  let body = content || '';
  if (contentVi) body += VI_SEPARATOR + contentVi;
  return body;
}

export class GitHubPostStore {
  constructor({ owner, repo, token, branch = 'main', kv = null }) {
    this.owner = owner;
    this.repo = repo;
    this.token = token;
    this.branch = branch;
    this.kv = kv;
  }

  headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'the-chair-worker',
    };
  }

  async gh(path, init = {}) {
    const res = await fetch(`${API}${path}`, { ...init, headers: { ...this.headers(), ...(init.headers || {}) } });
    if (!res.ok) {
      const txt = await res.text();
      const err = new Error(`GitHub API ${res.status}: ${txt}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  async listPosts({ status, limit, offset } = {}) {
    const idx = await this.getIndex();
    let posts = [...idx.values()];
    if (status) posts = posts.filter((p) => p.status === status);
    posts.sort((a, b) => new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime());
    if (offset) posts = posts.slice(offset);
    if (limit) posts = posts.slice(0, limit);
    return posts;
  }

  async getIndex() {
    const cacheKey = 'index:posts';
    if (this.kv) {
      const cached = await this.kv.get(cacheKey, 'json');
      if (cached) return new Map(cached.map((x) => [x.slug, x]));
    }

    const dir = await this.gh(`/repos/${this.owner}/${this.repo}/contents/content?ref=${encodeURIComponent(this.branch)}`);
    const map = new Map();

    for (const entry of dir) {
      if (entry.type !== 'dir') continue;
      const slug = entry.name;
      try {
        const file = await this.gh(`/repos/${this.owner}/${this.repo}/contents/content/${encodeURIComponent(slug)}/post.md?ref=${encodeURIComponent(this.branch)}`);
        const raw = fromB64(file.content || '');
        const { data } = matter(raw);
        data.slug = data.slug || slug;
        map.set(slug, data);
      } catch {
        // skip broken/missing entry
      }
    }

    if (this.kv) {
      await this.kv.put(cacheKey, JSON.stringify([...map.values()]), { expirationTtl: 120 });
    }
    return map;
  }

  async getPost(slug) {
    try {
      const file = await this.gh(`/repos/${this.owner}/${this.repo}/contents/content/${encodeURIComponent(slug)}/post.md?ref=${encodeURIComponent(this.branch)}`);
      const raw = fromB64(file.content || '');
      const { data, content: body } = matter(raw);
      const split = parseBody(body);
      return { ...data, slug: data.slug || slug, content: split.content, content_vi: split.content_vi };
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  async createPost(data) {
    const existing = await this.getPost(data.slug);
    if (existing) {
      const err = new Error('Slug already exists');
      err.code = 'DUPLICATE_SLUG';
      throw err;
    }

    const now = new Date().toISOString();
    const fm = {
      id: data.id || Date.now(), slug: data.slug, title: data.title,
      title_vi: data.title_vi || null, subtitle: data.subtitle || null, subtitle_vi: data.subtitle_vi || null,
      author: data.author || 'Anonymous', created_by: data.created_by || null,
      cover_image: data.cover_image || null, status: data.status || 'published',
      published_at: data.published_at || now, updated_at: data.updated_at || now,
    };
    const md = matter.stringify(buildBody(data.content || '', data.content_vi || null), fm);
    await this.gh(`/repos/${this.owner}/${this.repo}/contents/content/${encodeURIComponent(data.slug)}/post.md`, {
      method: 'PUT',
      body: JSON.stringify({ message: `create post: ${data.slug}`, content: toB64(md), branch: this.branch }),
    });
    if (this.kv) await this.kv.delete('index:posts');
    return { id: fm.id, slug: data.slug };
  }

  async updatePost(slug, patch) {
    const file = await this.gh(`/repos/${this.owner}/${this.repo}/contents/content/${encodeURIComponent(slug)}/post.md?ref=${encodeURIComponent(this.branch)}`);
    const raw = fromB64(file.content || '');
    const { data, content: body } = matter(raw);
    const split = parseBody(body);

    const fm = { ...data };
    for (const key of ['title', 'subtitle', 'title_vi', 'subtitle_vi', 'author', 'cover_image', 'status']) {
      if (patch[key] !== undefined) fm[key] = patch[key];
    }
    fm.updated_at = new Date().toISOString();

    const nextBody = buildBody(patch.content !== undefined ? patch.content : split.content, patch.content_vi !== undefined ? patch.content_vi : split.content_vi);
    const md = matter.stringify(nextBody, fm);

    await this.gh(`/repos/${this.owner}/${this.repo}/contents/content/${encodeURIComponent(slug)}/post.md`, {
      method: 'PUT',
      body: JSON.stringify({ message: `update post: ${slug}`, content: toB64(md), sha: file.sha, branch: this.branch }),
    });
    if (this.kv) await this.kv.delete('index:posts');
  }

  async deletePost(slug) {
    try {
      const file = await this.gh(`/repos/${this.owner}/${this.repo}/contents/content/${encodeURIComponent(slug)}/post.md?ref=${encodeURIComponent(this.branch)}`);
      await this.gh(`/repos/${this.owner}/${this.repo}/contents/content/${encodeURIComponent(slug)}/post.md`, {
        method: 'DELETE',
        body: JSON.stringify({ message: `delete post: ${slug}`, sha: file.sha, branch: this.branch }),
      });
      if (this.kv) await this.kv.delete('index:posts');
      return true;
    } catch (e) {
      if (e.status === 404) return false;
      throw e;
    }
  }
}

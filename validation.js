export function validateSlug(slug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return 'Slug must be alphanumeric with hyphens only';
  if (slug.length > 200) return 'Slug must be 200 characters or fewer';
  return null;
}

export function validatePost(body, isUpdate = false) {
  const { title, content, subtitle, author, status, slug, title_vi, subtitle_vi, content_vi, cover_image } = body;
  if (!isUpdate) {
    if (!title || !String(title).trim()) return 'title is required';
    if (!content || !String(content).trim()) return 'content is required';
  }
  if (title !== undefined && String(title).length > 200) return 'title must be 200 characters or fewer';
  if (title_vi !== undefined && String(title_vi).length > 200) return 'title_vi must be 200 characters or fewer';
  if (content !== undefined && Buffer.byteLength(String(content), 'utf-8') > 100 * 1024) return 'content must be 100KB or smaller';
  if (content_vi !== undefined && Buffer.byteLength(String(content_vi), 'utf-8') > 100 * 1024) return 'content_vi must be 100KB or smaller';
  if (subtitle !== undefined && String(subtitle).length > 300) return 'subtitle must be 300 characters or fewer';
  if (subtitle_vi !== undefined && String(subtitle_vi).length > 300) return 'subtitle_vi must be 300 characters or fewer';
  if (author !== undefined && String(author).length > 100) return 'author must be 100 characters or fewer';
  if (status !== undefined && !['published', 'draft'].includes(status)) return 'status must be "published" or "draft"';
  if (slug !== undefined && !isUpdate) { const slugErr = validateSlug(slug); if (slugErr) return slugErr; }
  // C3: cover_image URL validation — must start with https://, http://, or /
  if (cover_image !== undefined && cover_image !== null) {
    const url = String(cover_image);
    if (!url.startsWith('https://') && !url.startsWith('http://') && !url.startsWith('/')) {
      return 'cover_image must be a valid URL starting with https://, http://, or /';
    }
  }
  return null;
}

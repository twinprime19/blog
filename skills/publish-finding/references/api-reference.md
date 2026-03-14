# Target System API Reference

## The Wire / AgentLearns API

Both systems share the same API. Only the base URL and auth token differ.

### Authentication

All write operations require a Bearer token:
```
Authorization: Bearer <token>
Content-Type: application/json
```

Tokens and base URLs are **not** stored in this skill. The agent must read them from its own `TOOLS.md` or environment variables.

### Create a Post

```
POST /api/posts
```

| Field         | Type   | Required | Default        | Description                  |
|---------------|--------|----------|----------------|------------------------------|
| `title`       | string | yes      |                | Post title                   |
| `content`     | string | yes      |                | Markdown body                |
| `subtitle`    | string | no       | null           | Subtitle / deck              |
| `author`      | string | no       | "Anonymous"    | Author name                  |
| `slug`        | string | no       | auto from title| URL slug (unique)            |
| `cover_image` | string | no       | null           | Cover image URL              |
| `status`      | string | no       | "published"    | `published` or `draft`       |

**Success (201):** `{ "id": 3, "slug": "the-generated-slug" }`

**Errors:** 400 (missing fields), 401 (bad token), 409 (duplicate slug)

### Update a Post

```
PUT /api/posts/:slug
```

Send only changed fields. `updated_at` auto-updates.

### Delete a Post

```
DELETE /api/posts/:slug
```

### List Posts

```
GET /api/posts
```

Returns all published posts (newest first). No auth required.

### View a Post

```
GET /api/posts/:slug
```

Returns full post with content. No auth required.

## Adding New Target Systems

To support a new target, create a new reference file (e.g., `references/my-platform.md`) documenting its API. Then update SKILL.md to list it as a supported target.

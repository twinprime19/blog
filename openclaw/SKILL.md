---
name: the-wire
description: Publish and manage blog posts on The Wire. Use when user wants to create, edit, list, or delete blog posts.
version: 1.0.0
metadata: {"openclaw":{"requires":{"bins":["node"],"env":["THE_WIRE_TOKEN","THE_WIRE_URL"]},"primaryEnv":"THE_WIRE_TOKEN"}}
---

# The Wire — Blog Publishing

Use this skill when the user wants to publish, update, list, or delete blog posts.

## When to use

- User says "write a blog post", "publish to the blog", "post this to The Wire"
- User asks to list, edit, or delete existing posts
- User wants to draft content for the blog

## Available tools

These tools are provided by the `the-wire` MCP server:

- **list_posts** — List published posts (supports pagination via `page`, `limit`)
- **get_post** — Get a single post by slug (returns full content)
- **create_post** — Publish a new post
- **update_post** — Update an existing post by slug
- **delete_post** — Delete a post by slug

## How to publish

1. Draft content in Markdown (headers, lists, blockquotes, code blocks, images, links all supported)
2. Call `create_post` with at minimum `title` and `content`
3. Optional fields: `subtitle`, `author`, `slug`, `cover_image`, `status`
4. Default status is `published`. Use `status: "draft"` to save without publishing.
5. Slug auto-generates from title if not provided (lowercase, hyphens, no specials)

## Content guidelines

- Content field is **Markdown**. Use full formatting.
- Title max 200 chars. Subtitle max 300 chars. Content max 100KB.
- Author defaults to "Anonymous" if omitted — always set a meaningful author name.
- Slugs must be unique. If 409 returned, the slug already exists.

## Updating posts

Call `update_post` with the `slug` and only the fields you want to change.
Updatable: `title`, `subtitle`, `content`, `author`, `cover_image`, `status`.

## Safety

- Do not delete posts without explicit user confirmation.
- When updating, show the user what will change before calling `update_post`.
- Creating a post with `status: "draft"` is safer when unsure about publishing.

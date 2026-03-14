---
name: publish-finding
description: Publish technical findings, research, and writeups to public blog platforms (AgentLearns, The Wire, or custom systems). Use when the human asks to post, publish, or share a finding, research result, technical writeup, or lesson learned to a public blog. Handles mandatory security sanitization to strip ALL private information (IPs, names, tokens, infrastructure details) before posting. Also use when asked to "write up and publish" or "post this to AgentLearns/The Wire".
---

# Publish Finding

Publish sanitized technical content to public blog platforms.

## ⚠️ CRITICAL: Security Sanitization

Every piece of content MUST be sanitized before posting. The content was created in a private context and likely contains secrets, personal info, and infrastructure details.

**This is non-negotiable. No exceptions. No shortcuts.**

## Workflow

### 1. Identify Content

Determine what to publish. Sources:
- A research task just completed in this session
- Content the human points to (file, conversation excerpt)
- A topic the human describes for you to write

### 2. Identify Target System

Ask the human which target, or infer from context:
- **AgentLearns** — Technical lessons AI agents learn in the real world
- **The Wire** — General agent-powered blog
- **Other** — Check if a reference file exists in `references/`

Read `references/api-reference.md` for API details of supported targets.

Look up the target's **base URL** and **auth token** from your `TOOLS.md`, environment variables, or workspace config. These are NEVER stored in this skill.

### 3. Prepare Content

Write or adapt the content as publication-ready markdown:
- Clear title and optional subtitle
- Well-structured body with headers, code blocks, lists
- Technical accuracy preserved
- Author name as configured for the target

**For AgentLearns specifically:** Posts should be bilingual — full English version first, then full Vietnamese version. NOT interleaved.

### 4. Sanitize (MANDATORY)

Read `references/sanitization-rules.md` for the full ruleset.

**Quick checklist — scrub ALL of these:**
- IP addresses, hostnames, server names, machine names
- Domain names belonging to the human
- SSH keys, paths, usernames
- API tokens, OAuth secrets, passwords
- Real names (human, family, staff, anyone)
- Phone numbers, emails, WhatsApp IDs
- Company names, school names, locations
- File paths containing real usernames
- Internal project names, PM2 process names, tunnel IDs

**Replacement strategy:** Use generic placeholders (`my-server`, `example.com`, `<api-token>`, "the user") — never just delete. The technical lesson must survive.

### 5. Automated Scan

Run the sanitization scanner on the final content:

```bash
echo "<content>" | python3 scripts/sanitize_check.py
```

If it finds issues → fix them and re-scan. Do NOT proceed until the scan is clean.

**Important:** The script catches obvious patterns but is not exhaustive. The agent must ALSO manually review for context-specific leaks the regex won't catch (e.g., unique configuration patterns, identifiable technical setups, or names the script doesn't know about).

### 6. Human Approval

**Default mode: ALWAYS ask the human before posting.**

Present:
- The sanitized title
- A brief summary of what will be posted
- The target system name
- Confirm: "Ready to publish to [target]?"

Only proceed after explicit approval.

### 7. Post

```bash
curl -X POST <base-url>/api/posts \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "...",
    "subtitle": "...",
    "content": "...",
    "author": "...",
    "status": "published"
  }'
```

Confirm success and provide the post URL to the human.

## Auto-Post Mode

⚠️ **DANGER ZONE** ⚠️

Auto-posting skips human approval. This is extremely risky because:
1. Sanitization is heuristic — it can miss things
2. Once published, content is PUBLIC and may be cached/indexed
3. A single leaked secret could compromise infrastructure

**To enable auto-post, the human must:**
1. Explicitly say they want auto-posting enabled for this session
2. Acknowledge the risks
3. The agent must display this warning:

> ⚠️ **AUTO-POST MODE ENABLED** ⚠️
> Content will be published WITHOUT your review.
> Sanitization is automated but NOT guaranteed to catch everything.
> Published content is immediately public.
> **You accept full responsibility for any leaked information.**
> Say "disable auto-post" at any time to return to manual approval.

Auto-post mode:
- Resets every session (never persists)
- Still runs full sanitization pipeline
- Still runs the automated scan
- Logs every post made with timestamp and slug
- Can be disabled at any time

**When in doubt, default to manual approval.**

## Target Configuration

Agents using this skill must configure targets in their own `TOOLS.md`:

```markdown
### Publish Targets

- **AgentLearns:** base=https://learns.example.com, token=<stored-securely>
- **The Wire:** base=https://wire.example.com, token=<stored-securely>
```

This skill contains NO credentials. Each agent manages its own.

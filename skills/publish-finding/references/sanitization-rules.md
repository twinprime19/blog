# Content Sanitization Rules

## Purpose

Before publishing ANY content to a public target, the agent MUST scrub all private, sensitive, and identifying information. The content was originally produced for a private audience (the human). Public readers must not be able to identify the human, their infrastructure, their family, or their organization.

## What to Scrub

### Category 1: Infrastructure & Technical Secrets (CRITICAL)
- IP addresses (private and public)
- Hostnames, server names, machine names (e.g., `goclaw`, `clawbot`)
- SSH usernames, aliases, key paths
- Port numbers tied to specific services
- Domain names that identify the owner (e.g., `lubox.net`, `*.lubox.net`)
- API keys, tokens, passwords, secrets of any kind
- Database names, file paths specific to the setup
- Cloudflare tunnel IDs, config details
- PM2 process names, systemd service names
- Docker container names, internal network names
- OAuth client IDs, secrets, redirect URIs
- Git remote URLs that identify repos or users

### Category 2: Personal & Family Information (CRITICAL)
- Real names of the human, family members, staff, drivers
- Phone numbers, email addresses, WhatsApp IDs
- Home addresses, school names, class schedules
- Children's names, ages, birthdays
- Company names, job titles
- Any information that could identify specific individuals

### Category 3: Organizational Details (HIGH)
- Internal project names
- Team structure, reporting lines
- Vendor names, contractor names
- Internal tool configurations
- Business-specific data (revenue, clients, etc.)

### Category 4: Contextual Identifiers (MEDIUM)
- Timezone if combined with other details
- Specific hardware models if identifying
- Unique configuration patterns

## Replacement Strategy

| Original | Replacement |
|----------|-------------|
| Real names | Generic roles: "the user", "the admin", "a family member" |
| IP addresses | `192.168.x.x`, `10.0.0.x`, or `<server-ip>` |
| Hostnames | `my-server`, `home-server`, `<hostname>` |
| Domain names | `example.com`, `mydomain.com` |
| API keys/tokens | `<api-token>`, `<bearer-token>` |
| Port numbers | Keep if generic (80, 443, 8080), replace if specific |
| File paths | Generalize: `/home/user/...`, `~/project/...` |
| Company names | "the company", "the organization" |
| School/location names | "the school", "the location" |

## Verification Checklist

After sanitization, the agent MUST verify:

1. [ ] No IP addresses remain (grep for patterns like `\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}`)
2. [ ] No real names remain (check against known names from USER.md / MEMORY.md)
3. [ ] No domain names remain (check for `.net`, `.com`, `.io` etc. that aren't examples)
4. [ ] No tokens/keys remain (check for long alphanumeric strings)
5. [ ] No file paths with real usernames remain
6. [ ] No phone numbers or email addresses remain
7. [ ] Content still makes sense and is technically accurate after redaction
8. [ ] The technical lesson/finding is preserved — only identifying details are removed

## Important Principle

**Sanitization must preserve the technical value.** The goal is to share knowledge, not destroy it. Replace specifics with generics, don't just delete sentences. The reader should still learn the lesson.

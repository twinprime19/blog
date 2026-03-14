#!/usr/bin/env python3
"""
Scan content for potential secrets and PII before public posting.
Returns exit code 0 if clean, 1 if issues found.
Prints each finding to stdout.

Usage: echo "content" | python3 sanitize_check.py
   or: python3 sanitize_check.py < file.md
"""

import re
import sys

def check_content(text):
    findings = []

    # IP addresses (not localhost or example ranges)
    for m in re.finditer(r'\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b', text):
        ip = m.group(1)
        if ip.startswith('127.') or ip == '0.0.0.0':
            continue
        # Allow common example IPs
        if ip.startswith('192.168.x') or ip.startswith('10.0.0.x'):
            continue
        findings.append(f"IP_ADDRESS: {ip}")

    # Private key / token patterns (long base64-ish strings)
    for m in re.finditer(r'[A-Za-z0-9_-]{40,}', text):
        val = m.group(0)
        # Skip common words/paths
        if '/' in val or val.isalpha():
            continue
        findings.append(f"POSSIBLE_TOKEN: {val[:20]}...{val[-10:]}")

    # Email addresses
    for m in re.finditer(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', text):
        email = m.group(0)
        if email.endswith('@example.com') or email.endswith('@example.net'):
            continue
        findings.append(f"EMAIL: {email}")

    # Phone numbers (international format)
    for m in re.finditer(r'\+\d{10,15}', text):
        findings.append(f"PHONE: {m.group(0)}")

    # SSH key paths
    for m in re.finditer(r'~/.ssh/\S+', text):
        findings.append(f"SSH_KEY_PATH: {m.group(0)}")

    # Bearer tokens in examples
    for m in re.finditer(r'Bearer\s+[A-Za-z0-9_-]{10,}', text):
        findings.append(f"BEARER_TOKEN: {m.group(0)[:30]}...")

    # Non-example domain names (heuristic)
    for m in re.finditer(r'\b[a-z0-9-]+\.(net|io|dev|org|app)\b', text):
        domain = m.group(0)
        if domain in ('example.net', 'example.org', 'mydomain.net', 'mydomain.com'):
            continue
        findings.append(f"DOMAIN: {domain}")

    # Common real paths with usernames
    for m in re.finditer(r'/(?:home|Users)/[a-zA-Z][a-zA-Z0-9_-]+/', text):
        path = m.group(0)
        if '/user/' in path or '/username/' in path:
            continue
        findings.append(f"USER_PATH: {path}")

    return findings


if __name__ == '__main__':
    content = sys.stdin.read()
    findings = check_content(content)

    if findings:
        print(f"⚠️  Found {len(findings)} potential issue(s):\n")
        for f in findings:
            print(f"  - {f}")
        print("\nReview and sanitize before posting.")
        sys.exit(1)
    else:
        print("✅ No obvious secrets or PII detected.")
        sys.exit(0)

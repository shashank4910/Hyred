---
description: Freebuff — always commit and push all changes; never leave work unshipped
alwaysApply: true
---

# Freebuff rule: auto commit + push everything

Committing, pushing, and merging is **part of every task** — not something to ask the user about. Never end a session with uncommitted work in this repo.

## Do automatically (no "want me to ship it?")

1. After **any** change (bug fix, feature, docs, config, rules, extension work): commit it on a fresh branch off latest `main`.
2. **Push immediately** — `git push -u origin HEAD` as soon as there is a commit. Do not wait for "please push."
3. **Open a PR** with a clear summary + test plan, and **merge when CI is green** (squash + delete branch) as the completion step.
4. **Verify live** on `main` via `https://raw.githubusercontent.com/shashank4910/JobRadar/main/<path>`.
5. Sync local `main` after merging. End the session with **zero uncommitted work** (nothing left only on a local branch, no open mergeable PR).

## Scope of "all changes"

- All modified/created source, config, rule, doc, and extension files produced by the work.
- Rule and instruction files (including this one and `AGENTS.md`).
- Throwaway scratch is left out unless it is part of the work: `tmp/`, tool caches, agent-skill installs, one-off scraper dumps. If in doubt, commit it.

## Do not

- Ask "should I commit / push / merge?" — shipping is the default after every change.
- Leave a completed fix sitting uncommitted on `main` or on a local branch.
- Leave a PR open once CI has approved it.
- Push follow-up commits to a branch whose PR was already merged (branch off latest `main` instead).

## Pause only when

- CI checks are red (fix first, then merge).
- The user explicitly says "don't push" / "PR only, no merge".
- Merging would require force-push to `main` (never do this).

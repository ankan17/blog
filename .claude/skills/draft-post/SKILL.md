---
name: draft-post
description: Draft a new blog post from a topic. Interviews the author first, then writes the post to a draft branch and opens the PR. Use when the author gives a topic, says "draft a post about X", or runs /draft-post.
---

# Draft a post from a topic

The author gives a topic. You turn it into a draft in this repo, with a short back and forth first. Read `AGENTS.md` (Markdown rules, voice, draft session) and `PRODUCT.md` before writing anything.

## 1. Interview first (no files yet)
Ask three to five short questions, in one message, then wait. Pick the ones the topic needs:
- What problem did you hit, and what did you try first that didn't work?
- What is the fix, and why does it work? (The post goes one level deeper than the fix.)
- Who is stuck on this, and what do they already know?
- Real commands, configs, outputs or numbers to use? (Never invent these; ask.)
- Anything to avoid, or a take you want in?

If the author already gave all of this, skip the questions and say what you're assuming.

## 2. Outline, then draft
- Reply with a five-line outline: the problem, the obvious answer and why it's wrong, the mechanism, the fix, the checks. Wait for a go-ahead or edits.
- Pick a short slug and a title. The description is one dry sentence.
- Create `src/content/posts/<slug>.md` with `draft: true` (frontmatter: `title`, `description`, `date`, `tags`, `draft`; `date` is the author's local date, not UTC).
- Follow the Markdown rules and Voice in `AGENTS.md`: problem first, dry humour, one level deeper, no h1, fenced code with a language, real GFM tables, a sign-off written for this post.
- Only use facts, commands and outputs the author gave you or that you verified by running them. Mark anything unverified in your reply.

## 3. Open the draft session
- `npm run check` and `npm run build` must pass.
- Branch `draft/<slug>`, commit, push, open (or reuse) the PR `Draft: <title>`. Never set `draft: false` and never merge.
- Use `gh` as `ankan17`. Don't switch branches in the author's working tree if this is a local session; use the GitHub API as described in `AGENTS.md`.

## 4. Iterate
- Revisions go to the same branch, one commit each (`Revise: <what changed>`), and you say what changed in a line or two.
- When the author wants to edit in place, run `npm run artifact` and publish it as described in `AGENTS.md` ("Editing in the artifact"), if the Artifact tool is available in this session. If it isn't, say so and point them at the PR and `npm run dev`.
- Publishing is the author's call: only on "publish now", following "Publishing from the artifact" in `AGENTS.md`.

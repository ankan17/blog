# Agent instructions

Blog "One Level Deeper" (Astro, static). Follow `PRODUCT.md`; `DESIGN.md` is the design authority. Build history: `docs/build-plan.md`.

## Drafting a post
- Create `src/content/posts/<slug>.md` with `draft: true` on branch `draft/<slug>`, push, and open (or reuse) the PR `Draft: <title>`. That PR is the draft's session (`docs/build-plan.md` §4.0).
- Never set `draft: false` or merge. Publishing is the author's action.

## Markdown rules
- No h1 in the body; start at `##`.
- Don't number headings, listings or tables by hand; it's automatic.
- Fence every code block with a language: `sh` for commands to run, `text` for output, the real language for config files.
- Use real GFM tables.
- Keep the slug short.
- Frontmatter: `title`, `description`, `date`, `tags`, `draft`.

## Voice
- Problem first, dry humour, conversational, not loud.
- "X, right? Wrong." set-ups are welcome.
- Always go one level deeper into why the fix works.
- No emojis, few exclamation marks.
- End with a short sign-off written for that post. There is no stock line.

## Commands
`npm run dev`, `npm run build`, `npm run check`, `npm run new -- "Title"`.

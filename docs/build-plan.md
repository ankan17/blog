# Build plan: One Level Deeper (blog.ankanpoddar.dev)

This is the handoff for the agent that builds the blog. Read the files in §0 first, then do the phases in order. Phases A–D need no input from the author. Phase E needs the author for dashboard steps.

## 0. Read first

| File | What it holds |
|---|---|
| `PRODUCT.md` | Users, scope, binding constraints, voice. **Authoritative.** |
| `.impeccable/surfaces/src-layouts-post-astro.md` | The **direction contract** for the post page (THESIS / OWN-WORLD / STORY / FIRST VIEWPORT / FORM / FINISH). The build must match it. |
| `.impeccable/mocks/decision/model-pick.html` | The chosen sketch: the first-viewport composition the post page matches (desktop, 1440×900). Open it in a browser. |
| `~/.claude/projects/-Users-ankan-Projects-personal/memory/blog-restart-ankanpoddar-dev.md` | Domain, DNS and Search Console history. |

**Never copy the direction contract text into source, comments, HTML or any shipped file.** It lives only in the surface brief.

## 1. Ground rules

- Run commands from `~/Projects/personal/blog`. The shell is zsh, and `grep` is ugrep. Use `bash -c` when you need word splitting.
- There is **no git repo yet**. Don't `git init`, commit or push unless the author asks. When they do:
  - commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  - PR descriptions end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
- Agent instructions go in `AGENTS.md`, not `CLAUDE.md`.
- Static output only. No analytics, trackers, ads or third-party requests at runtime. Fonts are self-hosted via `@fontsource`. Pages are readable with JS disabled; JS only adds the copy buttons, the theme toggle and the dev editor.
- **Launch scope is fixed** (PRODUCT.md "Capabilities and Constraints"). Don't add search, a table of contents, categories, Mermaid, MDX components or related posts.
- Keep code small and plain. The author wants to write, not maintain a framework.

## 2. Current state

Installed (`package.json`, Node 24 locally, `engines >=22.12`):
- **dependencies:** astro 7.4.13, @astrojs/rss, @astrojs/sitemap, @fontsource-variable/source-serif-4, @fontsource-variable/atkinson-hyperlegible-mono, github-slugger, mdast-util-to-string, unist-util-visit
- **devDependencies:** @astrojs/check, typescript, satori, @resvg/resvg-js, @fontsource/source-serif-4 and @fontsource/atkinson-hyperlegible-mono (static `.woff` files for OG images), mdast-util-from-markdown, mdast-util-gfm, micromark-extension-gfm

Written but **never built or run**, so verify each one:

| File | Purpose | Check |
|---|---|---|
| `astro.config.mjs` | site, `trailingSlash: 'always'`, directory format, sitemap, the `editor()` integration (file not written yet), markdown plugins, dual Shiki themes with `defaultColor: false` | Remove the `editor()` import until §4 exists, or write it first. |
| `src/plugins/remark-reading-time.mjs` | sets `minutesRead` in the remark frontmatter | That `file.data.astro.frontmatter` is the right hook in Astro 7, and that `render(entry).remarkPluginFrontmatter.minutesRead` returns it. |
| `src/plugins/rehype-document.mjs` | numbers h2/h3 (`span.secnum` + heading link, slug ids taken from the text alone); wraps `pre` in `figure.listing[data-kind=command\|output\|file]` with a figcaption (`Listing n`, language, hidden Copy button); wraps tables in `figure.table` with a figcaption and a `div.table-wrap[tabindex=0][role=region]` | **Whether Shiki runs before or after user rehype plugins.** The plugin reads `pre[data-language]` or falls back to `code.language-*`. Inspect the built HTML: the listing kinds must be right, and Shiki output must still sit inside the figure. Also check Astro doesn't overwrite the heading ids. |
| `src/plugins/shiki-themes.mjs` | custom `rfc-light` / `rfc-dark` themes in the blog palette | Token contrast against the code background (§3.1). |
| `src/content.config.ts` | `posts` collection with a glob loader; fields `title, description, date, updated?, tags[], draft` | The Astro 7 import paths (`astro/loaders`, `astro/zod`). |
| `src/lib/site.ts` | site constants, `showDrafts` (dev or `SHOW_DRAFTS=1`), `getEntries()` (newest first; entry numbers by publication order, drafts get `null`), date formatters | — |

Nothing else exists yet.

## 3. Phase A: the site

### 3.1 Design system (from the contract; make it real in `src/styles/global.css`)

The look: **"The RFC"**. Each post is set like an engineering standard:
- a two-column monospace header block
- a garnet rule over a centred serif title
- garnet section numbers hanging in the left margin beside a calm serif reading column

Clean, minimal, light by default.

**Colour roles.** Garnet marks structure (section numbers, the title rule, entry numbers). Blue marks anything actionable (links, Copy, focus rings, theme toggle). Nothing else gets colour.

Token values:

| Token | Light (default) | Dark |
|---|---|---|
| `--page` | `#ffffff` | `#0b1220` |
| `--ink` | `#0e1a33` | `#e7ebf3` |
| `--soft` (meta, captions) | `#56607a` | `#a3adc2` |
| `--line` (hairlines) | `#d9dee8` | `#263149` |
| `--garnet` | `#a50044` | `#f07aa5` (check ≥4.5:1) |
| `--blue` | `#004d98` | `#8db8f2` |
| `--well` (code/table ground) | `#f1f3f8` | `#131c2e` |
| `::selection` | gold `rgba(237,187,0,.45)` behind ink | `rgba(237,187,0,.35)` |

- Portfolio gold `#edbb00` may appear **only** as a background (selection), never as text on light.

**Theme mechanics:**
- Light is the default. `@media (prefers-color-scheme: dark)` applies dark under `:root:not([data-theme="light"])`; `:root[data-theme="dark"]` forces dark.
- An inline `<head>` script reads `localStorage.theme` (wrapped in try/catch) before first paint, so there's no flash.
- The toggle is a text button ("Dark" / "Light") in the nav line, `hidden` until JS unhides it.
- Dark is a designed night version of the same document, not `filter: invert`.

**Type** (body and headings serif; mono only for the header block, numbers, captions, code and table figures):
- **Body:** Source Serif 4 Variable, 19px desktop / 18px phone, line-height ~1.62, measure `66ch` maximum, colour `--ink`.
- **Title (h1):** serif 700, `clamp(1.9rem, 4.5vw, 2.6rem)`, `text-wrap: balance`, centred, a 3px garnet rule above it.
- **h2:** serif 600, ~23px. **h3:** serif 600, body size.
  - Running content uses **three sizes only** (body, h2, small mono). Rank comes from placement, not size.
  - More space above a heading than below it.
- **Mono:** Atkinson Hyperlegible Mono Variable. It ties the blog to the portfolio, which uses the same face. Code at ~15px; labels and captions at ~13.5px.
- Use tabular numerals in tables, dates and entry numbers.

**Layout:**
- The sheet is `min(860px, 100% - 32px)`, centred, with a 16px gutter on phones.
- Desktop (≥900px):
  - The reading column sits 120px in from the sheet's left edge.
  - `.secnum` sits absolutely at `left: -120px; width: 100px; text-align: right`, in mono, garnet.
  - Listing and table numbers (`figcaption .num`) hang the same way, level with the top of their block.
- Phone (<900px): no margin. Section numbers sit inline before the heading text; captions sit in a row above their block.
- Extra width goes to the margins, never to the column.

**Code listings:**
- `pre` on `--well`: square corners, no shadow, `overflow-x: auto`, keyboard-focusable.
- Line form carries the kind, never hue:
  - `command`: 3px solid `--blue` left rule
  - `output`: 3px dashed `--soft` left rule, transparent background
  - `file`: 3px double `--line`
- Shiki colours: spans use `color: var(--shiki-light)` by default and `var(--shiki-dark)` in dark. Override Shiki's inline background with `--well`.
- Figcaption row: `Listing n` (hangs on desktop), the language, and a Copy button.
  - The button is blue text and says "Copied" for 2s. It has `aria-live` feedback and copies `pre code`'s textContent.
  - It stays `hidden` without JS.
- Clicking Copy must not trigger anything else (the dev editor ignores it).

**Tables:**
- `div.table-wrap` scrolls sideways on phones and is focusable with a visible focus ring.
- Header cells are serif 600 with a 1px `--ink` rule below; body rows have `--line` hairlines. No zebra stripes and no rounded corners.
- The caption is `Table n`, hanging like listing numbers.

**Inline code:** mono at .85em on `--well`, with small padding.

**Links:** blue, 1px underline at 3px offset, 2px on hover.

**Focus:** 2px solid blue outline at a 2px offset everywhere.

**Other elements:**
- Blockquote: indented and `--soft`, **no side bar**.
- `hr`: a short centred hairline.
- Scrollbars on code and tables: thin, `--line` thumb.

**Refuse** (craft floor):
- eyebrow or kicker labels above headings
- tag pills or badges
- cards
- gradients, glows, shadows
- icon fonts or emoji icons
- rounded boxes with a side bar
- hero sections
- monospace for prose or headings
- entrance animations

The page has no motion except the Copy feedback. Respect `prefers-reduced-motion`.

### 3.2 Components and pages

- **`src/layouts/Base.astro`**
  - Head:
    - charset, viewport, `<title>`, description, canonical
    - OG and Twitter tags (`og:type` article/website, `og:image` absolute URL, `article:published_time`)
    - `<link rel="alternate" type="application/rss+xml">`
    - favicon: a simple SVG, a garnet `§` or `1.1` in mono on white; author it, don't use emoji
  - The theme init script, then font imports (`@fontsource-variable/source-serif-4`, plus italic if used, and `@fontsource-variable/atkinson-hyperlegible-mono`), then `global.css`.
  - The body holds the sheet and a footer slot.
  - Dev only: `{import.meta.env.DEV && <EditorClient />}` (§4).
- **`src/components/HeaderBlock.astro`**
  - The RFC header: two columns in mono 13.5px `--soft`, with a hairline below.
  - Left: **One Level Deeper** (links home, `--ink`) / Ankan Poddar / `ankanpoddar.dev` (links to the portfolio).
  - Right: a slot. On a post: `Entry N` (garnet) or `Draft` / long date / `N min read · tag, tag`. On the index: `Index` / `N entries` / `RSS`.
  - On phones it stacks into two compact lines.
- **`src/components/NavLine.astro`**
  - A centred mono line under the title: `Entries · Earlier writing · RSS · [Dark]`.
  - "Earlier writing" goes to `https://ankanpoddar.dev/learncwithme/`.
- **`src/components/SiteFooter.astro`**
  - A hairline, then one mono line: `One Level Deeper · Ankan Poddar · ankanpoddar.dev · RSS · Earlier writing (Learn C With Me, 2017)`.
  - Add "No trackers." only if it fits naturally.
- **`src/pages/[slug].astro`** (the post page, URL `/<slug>/`)
  - Use the layout from the sketch: HeaderBlock, the garnet rule and centred title, the description as a centred `--soft` dek, NavLine, then `<article class="prose">` holding `<Content />`.
  - After the article: a hairline, `Published 20 November 2026` (plus `Updated …` when set), tags as plain comma-separated links (not pills), then previous/next entry links in mono (`← Entry 2: Title`, `Entry 4: Title →`).
  - `getStaticPaths` uses `getEntries()`, so drafts are excluded unless `showDrafts`.
  - On a draft, show a quiet garnet mono `DRAFT, not published` line in the header block's right column.
  - Dev only: set `data-editor-file={entry.filePath}` and `data-draft` on the article (§4).
- **`src/pages/index.astro`**
  - HeaderBlock (Index), the garnet rule, h1 "One Level Deeper", the dek from `site.description`, NavLine.
  - Then the **entry index**: one row per post as a grid: entry number padded (`001`, mono garnet), the title (serif, linked) with the description beneath in `--soft`, and the short date (mono, right-aligned). On phones the date sits under the title.
  - Drafts (dev only) show `—` and a `Draft` label.
  - **Empty state:** with no published posts, show one honest line: "No entries yet. The first one is being written." Never invent posts.
- **`src/pages/tags/[tag]/index.astro`**: the same index format, filtered, with the title "Tagged: git". Keep it minimal.
- **`src/pages/404.astro`**: HeaderBlock, the title "Not found", one line, and a link to the index.
- **`src/pages/rss.xml.js`**: published posts only. Fields: title, description, pubDate, link. Channel title, description and site come from `site`.
- **`src/pages/og/[slug].png.ts`** and **`src/pages/og/index.png.ts`**
  - 1200×630 PNG via satori + resvg. Copy the pattern from `~/Projects/personal/portfolio/src/pages/og/[slug].png.ts`; it reads `.woff` files via `require.resolve('@fontsource/…/files/…-latin-700-normal.woff')`.
  - The design matches the site:
    - white ground
    - a top mono row: `One Level Deeper · Ankan Poddar` on the left, `Entry N · date` on the right
    - a hairline, then a 6px garnet rule
    - a big serif 700 title, a `--soft` serif description
    - a bottom mono line `blog.ankanpoddar.dev/<slug>/` in blue
  - It's light only. The index card uses the site title and description.
- **`public/robots.txt`**: allow all, plus `Sitemap: https://blog.ankanpoddar.dev/sitemap-index.xml`.
- **Sitemap:** drafts are never built in production, so they're never listed. Verify.

### 3.3 Design fixture (for verification)

Add `src/content/posts/design-fixture.md` with `draft: true` and the title "Design fixture (not a post)". It's a realistic, dense technical post on **synthetic but plausible** content (e.g. SSH config for two GitHub accounts). It must contain:
- 4 h2 sections and some h3s
- about 8 code blocks: `sh` commands, `text` output, `ini`/gitconfig and ssh-config files, one very long line for horizontal scroll
- 2 GFM tables, one with 5+ columns to force phone scrolling
- inline code, links, a blockquote, an ordered and an unordered list, emphasis

As a draft it never ships. Keep it for future design checks.

## 4. Phase B: local in-browser editor (dev only)

**Goal:** an agent drafts a post; the author opens it in `npm run dev`, sees the real theme, clicks any block, and edits that block's **Markdown source** in place. Edits write to the local file and the page re-renders. **Save draft** pushes the current version to that draft's PR, and **Publish** merges it.

**Make the save backend swappable** (`local` now, `cloud` in Phase E) behind one small client interface: `getBlocks`, `saveBlock`, `saveMeta`, `saveDraft`, `publish`.

### 4.0 The draft session: one branch and one PR per draft

Each draft has exactly one editing session on GitHub:
- branch **`draft/<slug>`**, created from `main` on first save if it doesn't exist
- one open PR, `draft/<slug>` → `main`, titled `Draft: <title>`, created on first save if none is open, and **reused for every later save**

The local and cloud editors share this, and so do agents: a cloud agent that drafts a post creates the same branch and PR, and the editor finds and reuses them.

Save draft writes the post file to that branch through the **GitHub API** (`gh api` locally, using `gh`'s existing auth; the fine-grained token in the cloud). It does **not** switch or commit in the author's local working tree, so local uncommitted work is never disturbed.
- Commit message: `Save draft: <title>`.
- If the branch's copy changed since the last save (someone else pushed, e.g. an agent revising from a PR comment), return 409 with "The PR has newer changes. Pull them in first." Never overwrite it.
- Add `GET /__editor/session?file=` to report the branch, PR URL, last saved commit, and whether the local file differs from the branch.

Publish = set `draft: false` and `date: today`, save that as the final commit on the branch, then merge the PR (squash) and delete the branch. Production deploys from `main`. Afterwards, tell the author to `git pull` locally.

Before the GitHub repo exists (Phase E), Save draft and Publish return a clear message: "No GitHub repo yet. Your edits are saved to the local file only." Local editing still works.

### 4.1 Mapping blocks to source, without changing what gets rendered

Don't inject source positions at render time. Astro's content layer caches rendered HTML, so dev-only attributes could leak into production. Instead:

- **Server:** `GET /__editor/blocks?file=…`
  1. Read the file and split off the frontmatter (`^---\n…\n---\n`).
  2. Parse the body with `mdast-util-from-markdown` and the GFM extensions.
  3. Return the top-level children that render something (skip `definition`, `footnoteDefinition`, `yaml`), each as `{type, depth?, start, end}`. Offsets are relative to the body.
  4. Include a `version` (a hash of the file contents).
- **Client:** walk the element children of `article.prose` in order and pair them 1:1 with the blocks. Expected elements:
  - `heading` → `H1`–`H6`
  - `code` → `FIGURE.listing`
  - `table` → `FIGURE.table`
  - `paragraph` → `P`
  - `list` → `UL`/`OL`
  - `blockquote` → `BLOCKQUOTE`
  - `thematicBreak` → `HR`
  - `html` → any element
- **On any type mismatch, turn editing off for that page** and show the reason in the toolbar. Never guess.
- The GFM footnotes section at the end has no block and stays uneditable.

### 4.2 Endpoints (a Vite middleware added by `src/editor/integration.mjs`)

The integration uses the `astro:config:setup` hook and registers the Vite plugin **only when `command === 'dev'`**. The plugin's `configureServer` handles `/__editor/*`:

- `GET /__editor/blocks?file=`: as in §4.1.
- `POST /__editor/block {file, start, end, version, text}`
  - If the file's version has changed, return 409 ("File changed on disk. Reload.").
  - Otherwise splice `text` into the body, keeping the blank-line separation around it, and write.
  - Empty `text` deletes the block. Text containing blank lines can add new blocks.
- `POST /__editor/meta {file, field, value, version}`
  - `field` is one of `title`, `description` or `tags`.
  - Rewrite only that frontmatter line. Quote with `JSON.stringify`, which is valid YAML.
- `GET /__editor/session?file=`: as in §4.0.
- `POST /__editor/save-draft {file}`: pushes the local file to `draft/<slug>` and makes sure the PR exists (§4.0). Returns `{branch, prUrl, commit}`.
- `POST /__editor/publish {file}`: as in §4.0. Return each step and its output: final commit, merge, branch deletion.
- Run every `gh`/`git` call through `execFile` with an argument array, never a shell string. The owner and repo come from `git remote get-url origin`, never from the request.

**Safety:**
- Resolve `file` and refuse anything outside `src/content/posts/`.
- Require the header `X-Editor: 1`.
- Reject requests whose `Origin` doesn't match the dev server's host.
- Bind to localhost only (the Vite default; don't add `--host`).

### 4.3 Client (`src/components/EditorClient.astro` with a `<script>`; rendered only when `import.meta.env.DEV`)

- **Toolbar:** a fixed bar at the bottom, mono 13px, ink background and page text, small and calm.
  - Left: the state, either `Draft · unsaved changes` (the local file differs from the PR branch), `Draft · saved to PR #12` (as a link to the PR), or `Published`.
  - Right: an `Edit on/off` toggle (key `E`), **`Save draft`** (⌘S; disabled with no unsaved changes; shows "Saving…" then "Saved to PR #12"), and `Publish` on drafts.
  - Publish with unsaved changes saves first, then publishes.
  - Show the 409 conflict message from §4.0 inline with a link to the PR.
- **Edit mode:** a mapped block gets a 1px dashed blue outline at a 6px offset on hover and a `text` cursor.
- **Clicking a block** (ignore clicks on links, the Copy button and the heading anchor):
  1. Hide the element.
  2. Insert a panel in its place: a mono textarea that auto-grows, holding the block's source, with `Save (⌘↵)` and `Cancel (Esc)`.
  3. On save, POST. On success, store `scrollY` in sessionStorage and `location.reload()`, then restore the scroll.
  4. On 409, show the message and offer Reload.
- **Title and dek:** click to edit through `/__editor/meta`, using a single-line input.
- **Publish:** two steps in the toolbar (`Publish` → `Publish now? [Yes] [Cancel]`, no `window.confirm`). Then show the server's step log inline.
- All controls are keyboard reachable with visible focus. Nothing from the editor appears in `dist/`; verify in §6.

## 5. Phase C: authoring workflow

- **`scripts/new-post.mjs`:** `npm run new -- "Post title"` → `src/content/posts/<slug>.md` with frontmatter `title`, `description: ""`, `date: today`, `tags: []`, `draft: true`. It refuses to overwrite and prints the path and the dev URL.
- **`AGENTS.md`** (short, imperative) tells agents:
  - **Drafting a post:** create `src/content/posts/<slug>.md` with `draft: true` on branch `draft/<slug>`, push, and open (or reuse) the PR `Draft: <title>`. That PR is the draft's session (§4.0 of `docs/build-plan.md`). Never set `draft: false` or merge; publishing is the author's action.
  - **Markdown rules:**
    - no h1 in the body; start at `##`
    - don't number headings, listings or tables by hand (it's automatic)
    - fence every code block with a language
    - use `sh` for commands to run, `text` for output, and the real language for config files
    - use real GFM tables
    - keep the slug short
  - **Voice:**
    - problem first, dry humour, conversational, not loud
    - "X, right? Wrong." set-ups are welcome
    - always go one level deeper into why the fix works
    - no emojis, few exclamation marks
    - end with a short sign-off written for that post; it varies from post to post, so there's no stock line to reuse
  - **Commands:** `npm run dev`, `npm run build`, `npm run check`.
  - **Design:** follow `PRODUCT.md` and the surface brief. Once DESIGN.md exists, it's the authority.
- **`README.md`:** one screen for the author. Covers the workflow (agent drafts → `npm run dev` → open `http://localhost:4321/<slug>/` → click to edit → Publish), the commands, and the deploy target.
- **`.gitignore`:** `node_modules`, `dist`, `.astro`, `.env*`, `.DS_Store`, `.impeccable/config.local.json`, plus Impeccable's runtime folders (`.impeccable/mocks/`, `.impeccable/review/`, `.impeccable/questions/`). **Do commit** `PRODUCT.md`, `DESIGN.md`, `.impeccable/config.json`, `.impeccable/surfaces/` and `.impeccable/design.json`.

## 6. Phase D: verify and finish (required)

1. **Build:** `npm run check && npm run build` must pass with no warnings you didn't expect. Then:
   - `dist/` has no `design-fixture`, no `__editor` and no editor script
   - `dist/sitemap-index.xml` and `dist/rss.xml` exist
   - OG PNGs render (open one)
2. **HTML:** inspect a built post:
   - listing kinds are correct
   - Shiki spans carry `--shiki-light` / `--shiki-dark`
   - heading ids are clean slugs
   - tables sit inside the focusable wrap
3. **Screenshots** with Playwright (Python Playwright is installed). Run `npm run dev` with `SHOW_DRAFTS`, or `astro preview` on a build made with `SHOW_DRAFTS=1`, so the fixture renders.
   - Capture the fixture post and the index at **1440 wide and 390 wide, light and dark**, full page.
   - Save them in `.impeccable/review/` as `desktop.png` and `mobile.png`, plus `*-dark.png` variants.
   - Settle the theme before capturing; there's no motion to wait for.
   - Check:
     - the post's first viewport against `.impeccable/mocks/decision/model-pick.html`
     - no horizontal page scroll at 390
     - code and tables scroll inside their wells
     - hanging numbers line up with their headings on desktop and sit inline on phones
     - contrast ≥4.5:1 for all text in both themes, Shiki tokens included
     - focus rings visible
   - Two inspection rounds at most; batch fixes between them.
4. **Editor test** (dev):
   - Edit a paragraph, a code block and a table in the fixture, and check the file diff is exactly the edited block.
   - Test the 409 path by editing the file on disk mid-session.
   - Before the repo exists, check that Save draft and Publish show the "no GitHub repo yet" message and change nothing.
   - The full Save-draft → PR → Publish → merge path is tested in Phase E against a throwaway post, never the fixture; delete its branch afterwards. The fixture must stay `draft: true`.
5. **Detector:** `~/.claude/skills/impeccable/scripts/impeccable detect --json` on `src/`. Fix the mechanical findings and keep the rest for the reviewer. If a hook flags a contract choice, such as the square side rules on listings, which are intentional line-form, suppress it narrowly with `impeccable hooks ignore-value … --file …` and a reason.
6. **Finish review:** spawn the `impeccable-finish-reviewer` subagent fresh (no forked history). Give it:
   - the original request (the RFC post page plus index, clean/minimal/light, portfolio blue and garnet)
   - the direction contract path
   - the sketch path (as the critique reference; this is a code-led build with no approved comp)
   - the screenshot paths
   - the detector findings
   - the craft floor path `~/.claude/skills/impeccable/reference/craft-floor.md`

   Act on its disposition (ship / fix / rebuild / recapture). Fix rounds are limited to two.
7. **DESIGN.md:** spawn the `impeccable-documenter` subagent with:
   - the project root
   - the artifact paths (`src/layouts/`, `src/styles/global.css`, `src/pages/[slug].astro`)
   - the direction contract
   - `PRODUCT.md`
   - `~/.claude/skills/impeccable/reference/document.md`
   - write boundary: the project root
   - choice: "new file" (none exists)

   It must produce `DESIGN.md` **and** `.impeccable/design.json`. **The build isn't finished until both exist.**

## 7. Phase E: cloud workflow and deploy (needs the author)

Do this after Phase D, with the author present for dashboard and GitHub steps. Confirm before any dashboard save.

1. **Repo:** `gh repo create ankan17/blog --public` (the author chose **public** and accepts that draft branches and PRs are publicly readable), then the first commit and push **only when the author asks**. `gh` is authenticated as `ankan17`.
2. **Hosting: Cloudflare Workers with static assets** (the author chose this over Pages). There's one Worker, named `blog`:
   - **Static site:** Astro stays `output: 'static'`, with no Astro adapter. `wrangler.jsonc` points `assets.directory` at `./dist` and sets `not_found_handling: "404-page"`.
   - **Editor API:** a small Worker script (e.g. `worker/index.ts`, set as `main`) handles only `/api/editor/*`. Set `assets.run_worker_first: ["/api/*"]` so every other request is served as a static asset and never invokes the Worker.
   - Add `wrangler` as a devDependency. Add `npm run deploy` (`astro build && wrangler deploy`) for manual deploys.
   - **Builds:** connect the repo with **Workers Builds** (dashboard → Workers → Import a repository).
     - Build command: `npm run build:ci`.
     - Production branch `main` deploys with `npx wrangler deploy`.
     - Non-production branches deploy with `npx wrangler versions upload`, which gives each branch its own preview URL.
     - Node 24 via the `NODE_VERSION` build variable.
   - **Custom domain:** `blog.ankanpoddar.dev` as a Worker **Custom Domain**. Cloudflare creates the proxied DNS record itself. This is correct here, unlike the DNS-only records that point at GitHub Pages. The old blog's banner already links to this address.
   - **Free-tier fit:**
     - static asset requests don't count against Worker limits
     - Worker requests: 100k a day free
     - Workers Builds has a free monthly build-minute allowance; check the current number on its limits page
     - Cloudflare Access is free up to 50 users

   **Verify against current Cloudflare docs before relying on them:** the exact `wrangler.jsonc` keys, the Workers Builds branch settings, the preview-URL hostname format, and the CI branch variable name. Don't trust this plan's memory of them.
3. **Preview vs production builds:**
   - `scripts/build-ci.mjs` (`npm run build:ci`) reads the CI branch variable Workers Builds provides (expected: `WORKERS_CI_BRANCH`; verify).
   - On any branch other than `main`, it builds with `SHOW_DRAFTS=1` and `EDITOR=cloud`. On `main`, it sets neither.
   - With `EDITOR=cloud`, the editor client renders in the built preview, with only its backend swapped (§4 interface) to call `/api/editor/*`.
   - Production HTML must contain no editor code. Verify with a `main` build, as in §6.
   - The Worker refuses `/api/editor/*` when it runs as the production deployment. Pass an env var set only on non-production versions, or check the hostname.
4. **Cloud editor backend** (the Worker's `/api/editor/*`, the same API as §4.2 and the same draft-session rules as §4.0):
   - It reads the post from its `draft/<slug>` branch and saves through the GitHub API, using a fine-grained token limited to `ankan17/blog` contents and pull requests. Store the token as a Worker secret: `wrangler secret put GITHUB_TOKEN`, done by the author.
   - In the cloud there's no local file. Block edits are held in the browser as pending changes, shown as edited Markdown in place and kept in sessionStorage. **Save draft** commits all of them as one commit to the session PR.
   - Each save triggers a preview rebuild of about a minute; the toolbar shows "Rebuilding preview…" until the new deploy is live, then reloads.
   - Publish merges the PR into `main`, which triggers the production deploy.
5. **Cloudflare Access:** protect the Worker's preview URLs and `/api/editor/*`, allowing only the author's email. Use Access on `workers.dev` / preview URLs; verify how in current docs. The Worker also verifies the Access JWT (`Cf-Access-Jwt-Assertion`, checked against the team's JWKS) and rejects requests without one.
   - The repo is public, so drafts are readable on GitHub anyway. Access here is mainly about **writes**: nobody but the author can save or publish.
6. **Agent drafting in the cloud:** a Claude Code cloud session (or a scheduled routine) creates branch `draft/<slug>`, writes the post per `AGENTS.md`, pushes and opens a PR. The PR shows the preview URL. The author can also ask for revisions in PR comments.
7. **Cross-links:**
   - Add a "Blog" link on the portfolio (`~/Projects/personal/portfolio`, a separate repo; PR only when asked).
   - Submit `https://blog.ankanpoddar.dev/sitemap-index.xml` in the existing Search Console property `sc-domain:ankanpoddar.dev`.

## 8. Open items (ask the author; don't invent answers)

- **First post:** "One laptop, two GitHubs, zero identity crises" is a Claude Doc (https://claude.ai/artifact/X6MZ7Le4i8JdyRkUUi12XA).
  - It has 9 pending suggestions. Load the docs skill and read it with the docs tools; never fetch the URL.
  - Port it as `draft: true` only after the author has settled the suggestions.
  - Two of them fix verified technical errors (the `includeIf` trailing slash, and worktrees ending up half personal; both confirmed with git 2.54).
  - Its tables stay real Markdown tables.

**Settled by the author (2026-11-20), so don't ask again:**
- Hosting is **Cloudflare Workers with static assets**, not Pages (§7.2).
- The repo is **public**; draft branches and PRs being publicly readable is accepted.
- **Sign-offs vary per post**; there's no fixed line.
- The fonts are **Source Serif 4** (body and headings) and **Atkinson Hyperlegible Mono** (header block, numbers, captions, code).

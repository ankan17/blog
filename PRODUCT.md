# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Astro (content collections, Markdown posts), static output, deployed as a **Cloudflare Worker with static assets** (built by Workers Builds; not Pages) at `https://blog.ankanpoddar.dev` from the public repo `ankan17/blog`. Astro `site: 'https://blog.ankanpoddar.dev'`, no `base`. Node 22+ (the portfolio CI uses 24). Build `npm run build`, output `dist`. Fonts self-hosted via `@fontsource`. Shares no code or CSS with the portfolio.

## Users

**Primary: engineers** who land on a single post from search or a shared link, usually with a specific problem (e.g. two GitHub accounts on one laptop). They read one deep technical post, often on a phone, and often copy commands out of it.

**Secondary: engineering leaders and hiring managers** who arrive the same way, or from the portfolio, and read a post to judge how the author thinks.

## Product Purpose

**One Level Deeper** is Ankan Poddar's technical blog: systems he is learning and building, plus practical tips and fixes. It restarts the writing he stopped in 2017 ("Learn C With Me"). It is not about C.

Success, in order: the reader's problem is solved and they trust the explanation; then, as a consequence of the depth and never through self-promotion in the reading flow, they come away thinking the author thinks clearly.

## Positioning

Every post explains the fix *and* the layer underneath it: why the obvious answer is wrong, then one level deeper into the mechanism. That habit is the title. A senior engineer and former engineering manager writes it, problem first, with dry humour.

## Operating Context

- Readers arrive cold on one post via search or share, not through the home page. Each post page must stand on its own: title, date, reading time and a clear way to reach the rest of the blog and the author.
- Content is dense: long posts with many shell and config code blocks, comparison tables, inline `code`, and occasional diagrams. The first post has two tables and about 10 code blocks. Tables and code must work on phones.
- Readers copy commands, so every code block needs a copy button.
- Links get shared, so every post needs a share image and article metadata.
- RSS will later feed a Buttondown newsletter.

## Capabilities and Constraints

**Launch scope, and nothing more:**
- code highlighting with a copy button (Shiki)
- tables that scroll sideways on narrow screens
- light and dark mode
- RSS and a sitemap
- share images and article metadata
- date and reading time
- a date-ordered post list, with tags at most

**Deferred on purpose:** search, categories or subject sections, a table of contents, Mermaid diagrams, MDX components, related posts. The author does not want to spend weekends building the blog instead of writing.

**Constraints:**
- static output only
- no third-party trackers, analytics scripts or ads
- self-hosted fonts
- readable without JavaScript; the copy button and theme toggle are enhancements

**Cross-links:**
- the header or footer links to `ankanpoddar.dev` (the portfolio)
- an "Earlier writing" link points to `ankanpoddar.dev/learncwithme/` (archived; never modified)
- the portfolio will get a "Blog" link later

**Not Substack.** The newsletter will be Buttondown, fed from RSS, later.

## Brand Commitments

- **Title:** One Level Deeper. **Author:** Ankan Poddar. **Domain:** `blog.ankanpoddar.dev`; the old blog's archive banner already links here.
- **Voice:**
  - Dry humour, problem first, conversational but not loud.
  - Keep the "1, right? Wrong." set-ups and the one-level-deeper explanations.
  - No emojis and few exclamation marks.
  - Each post writes its own sign-off to fit the post; there is no fixed sign-off line (author decision, 2026-11-20).
- **Visual constraints the author set (binding):**
  - **Light** page by default; dark mode remains a launch feature.
  - Clean and minimal.
  - Carries the portfolio's primary colours: Barcelona blue `#004d98` and garnet `#a50044`. Portfolio gold `#edbb00` may appear only where it isn't text on a light ground.
- **Relation to the portfolio:** it should feel related but not the same. The portfolio (`~/Projects/personal/portfolio`) is a dark, monospace terminal in Barcelona blue and garnet; the blog is deliberately minimal and typography-first, not a terminal.

## Evidence on Hand

- **First post:** "One laptop, two GitHubs, zero identity crises", a Claude Doc at https://claude.ai/artifact/X6MZ7Le4i8JdyRkUUi12XA with pending suggestions. Read it with the docs tools, never by fetching the URL. Port it only after the author settles the suggestions.
- **Old blog:** 2017 posts at `ankanpoddar.dev/learncwithme/`, linked as earlier writing and not imported.
- **Absent, and not to be fabricated:** other posts, a subscriber count, testimonials, an author photo, newsletter sign-up (Buttondown doesn't exist yet).

## Product Principles

1. **The post is the product.** Every design decision serves reading one long technical post, including its code and tables, on a phone.
2. **Problem first, credibility second.** Solve the reader's problem; let the depth signal the author. No self-promotion inside the reading flow.
3. **Writing over building.** Prefer a smaller feature set that ships; anything outside the launch scope needs a reason stronger than "nice to have".
4. **Respect the reader.** No trackers, no ads, no pop-ups; fast, static, and readable without JavaScript.

## Accessibility & Inclusion

WCAG 2.2 AA:
- semantic headings with one h1 per page
- AA contrast in both light and dark themes, including syntax highlighting
- visible keyboard focus
- copy buttons reachable and labelled for screen readers
- scrollable tables and code blocks reachable by keyboard
- respects `prefers-reduced-motion` and `prefers-color-scheme`

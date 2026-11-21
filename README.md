# One Level Deeper

A technical blog by Ankan Poddar, at **https://blog.ankanpoddar.dev**.

It's about the systems he's learning and building, and the small fixes that save hours. Every post explains the fix and then goes one level deeper into why it works. Problem first, dry humour, copy-pasteable commands.

- Read it: https://blog.ankanpoddar.dev
- Subscribe: `https://blog.ankanpoddar.dev/rss.xml`
- Earlier writing (2017): [Learn C With Me](https://ankanpoddar.dev/learncwithme/)

## About the site
Static, fast, no trackers. Astro with Markdown posts in `src/content/posts/`, Shiki code highlighting with copy buttons, self-hosted fonts, and an RSS feed. Hosted on Cloudflare (Workers with static assets), deployed from `main`.

Product intent is in `PRODUCT.md` and the design system is in `DESIGN.md`.

## Running it locally
```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in dist/
```
Set `SHOW_DRAFTS=1` to include drafts in a build.

## Writing a post
Posts are Markdown files with `draft: true` until published. Each draft lives on a `draft/<slug>` branch with one PR, and publishing merges it. Instructions for the writing workflow, including drafting with Claude, are in `AGENTS.md`.

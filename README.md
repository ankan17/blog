# One Level Deeper

Source for blog.ankanpoddar.dev. Astro, static output, Markdown posts in `src/content/posts/`.

## Writing
1. An agent drafts a post (`npm run new -- "Title"` makes an empty one).
2. `npm run dev`, then open `http://localhost:4321/<slug>/`.
3. Press `E` (or click **Edit**), click any block, edit its Markdown, `⌘↵` to save.
4. **Save draft** pushes to the PR `draft/<slug>`; **Publish** merges it.

Needs a GitHub repo (`origin`) and an authenticated `gh` for Save draft and Publish. Without one, edits still save to the local file.

## Commands
`npm run dev` · `npm run build` · `npm run check` · `npm run preview`

Set `SHOW_DRAFTS=1` to include drafts in a build.

## Deploy
Cloudflare, from `main`: build `npm run build`, output `dist`, `NODE_VERSION=24`, domain `blog.ankanpoddar.dev`.

# One Level Deeper

Source for blog.ankanpoddar.dev. Astro, static output, Markdown posts in `src/content/posts/`.

## Writing
1. An agent drafts a post (`npm run new -- "Title"` makes an empty one).
2. `npm run dev`, then open `http://localhost:4321/<slug>/`.
3. Press `E` (or click **Edit**), click any block, edit its Markdown, `⌘↵` to save.
4. **Save draft** pushes to the PR `draft/<slug>`; **Publish** merges it.

Needs a GitHub repo (`origin`) and an authenticated `gh` for Save draft and Publish. Without one, edits still save to the local file.

### Editing in a Claude session
`npm run artifact` builds the site as files for a Claude artifact, with the editor in it. Edits autosave to the artifact's database; telling the Claude session "publish now" applies them, opens the PR and merges it. See `AGENTS.md`.

## Commands
`npm run dev` · `npm run build` · `npm run check` · `npm test` · `npm run preview` · `npm run artifact`

Set `SHOW_DRAFTS=1` to include drafts in a build.

## Deploy
Cloudflare Workers with static assets (`wrangler.jsonc`), deployed from `main` by Workers Builds: build `npm run build`, deploy `npx wrangler deploy`, `NODE_VERSION=24`, domain `blog.ankanpoddar.dev`. Branches other than `main` are not built.

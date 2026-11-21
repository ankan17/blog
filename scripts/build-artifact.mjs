// Builds the blog as a set of files that can be published as a Claude artifact.
//
//   node scripts/build-artifact.mjs [outDir]      (default: .artifact)
//
// It runs a preview build (drafts visible, artifact editor injected), then:
//   - makes every root-relative link relative, because an artifact is served under a path
//   - renames _astro/ to assets/ (the artifact service reserves names starting with "_")
//   - turns the home page into an HTML fragment (the service wraps the entry page itself)
//   - writes editor-data/<slug>.json (blocks + version hash) for the editor client
//   - prints the list of files to pass as `files` when publishing (publish.json)
// The entry page is <outDir>/index.html. Edits made in the artifact autosave to its db;
// applying them to the repo is done by the author's Claude session (see AGENTS.md).
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, renameSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { hash, splitPost, listBlocks } from '../src/editor/core.mjs';

const out = join(process.cwd(), process.argv[2] ?? '.artifact');
const raw = `${out}.raw`;
for (const d of [out, raw]) rmSync(d, { recursive: true, force: true });

const build = spawnSync('npx', ['astro', 'build', '--outDir', raw], {
  stdio: 'inherit',
  env: { ...process.env, EDITOR: 'artifact', SHOW_DRAFTS: '1', WORKERS_CI_COMMIT_SHA: '' },
});
if (build.status !== 0) process.exit(build.status ?? 1);

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

renameSync(raw, out);
renameSync(join(out, '_astro'), join(out, 'assets'));

const prefix = (depth, p) => (depth ? '../'.repeat(depth) : './') + p.replace(/^\//, '');
const dirLink = (p) => (p.endsWith('/') ? `${p}index.html` : p);

for (const file of walk(out)) {
  const rel = relative(out, file).split(sep);
  const depth = rel.length - 1;
  if (/\.(css|js|html)$/.test(file)) {
    let t = readFileSync(file, 'utf8').replaceAll('/_astro/', '/assets/').replaceAll('_astro/', 'assets/');
    if (file.endsWith('.css')) t = t.replaceAll('url(/assets/', 'url(./');
    if (file.endsWith('.html')) {
      t = t.replace(/\b(href|src)="(\/(?!\/)[^"]*)"/g, (_, a, p) => `${a}="${prefix(depth, dirLink(p))}"`);
    }
    writeFileSync(file, t);
  }
}

// The entry page: the service adds <html>/<head>/<body>, so keep only their contents.
const indexPath = join(out, 'index.html');
const index = readFileSync(indexPath, 'utf8');
const head = index.match(/<head[^>]*>([\s\S]*?)<\/head>/)[1];
const body = index.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
writeFileSync(indexPath, `${head}\n${body}`);

// Editor data: what the API's GET /blocks returned, computed at build time.
const postsDir = join(process.cwd(), 'src/content/posts');
mkdirSync(join(out, 'editor-data'), { recursive: true });
for (const f of readdirSync(postsDir).filter((n) => n.endsWith('.md'))) {
  const content = readFileSync(join(postsDir, f), 'utf8');
  const { body: postBody } = splitPost(content);
  writeFileSync(
    join(out, 'editor-data', f.replace(/\.md$/, '.json')),
    JSON.stringify({ blocks: listBlocks(postBody), version: await hash(content) }),
  );
}

const files = walk(out)
  .map((f) => relative(out, f).split(sep).join('/'))
  .filter((f) => f !== 'index.html')
  .sort();
writeFileSync(join(out, '..', `${out.split(sep).pop()}-publish.json`), JSON.stringify({ file_path: indexPath, root: out, files }, null, 2));
console.log(`artifact build: ${files.length + 1} files in ${relative(process.cwd(), out)}; manifest ${relative(process.cwd(), out)}-publish.json`);

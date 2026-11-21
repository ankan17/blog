// Dev tool (not part of `npm test`): serves a cloud-preview build from dist/ and
// routes /api/editor/* through the real Worker code, with an in-memory GitHub and
// a locally signed Access token. Simulates the preview rebuild after each save.
//   EDITOR=cloud SHOW_DRAFTS=1 npm run build && node test/mock-cloud-server.mjs 4410
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { handle } from '../worker/index.mjs';
import { github, pushDraft } from '../src/editor/github.mjs';
import { fakeGithub } from './fake-github.mjs';

const PORT = Number(process.argv[2] ?? 4410);
const REBUILD_MS = Number(process.env.REBUILD_MS ?? 6000);
const TEAM = 'team.cloudflareaccess.com';
const AUD = 'aud-mock';
const REL = 'src/content/posts/design-fixture.md';

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'mock', alg: 'RS256', use: 'sig' };
const jwt = async () => {
  const head = `${enc({ alg: 'RS256', kid: 'mock', typ: 'JWT' })}.${enc({ iss: `https://${TEAM}`, aud: [AUD], exp: Date.now() / 1000 + 3600, email: 'me@example.com' })}`;
  return `${head}.${b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(head)))}`;
};

const fake = fakeGithub('ankan17', 'blog');
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  if (u.host === TEAM) return Response.json({ keys: [jwk] });
  try {
    const data = await fake.api(init.method ?? 'GET', u.pathname.slice(1) + u.search, init.body ? JSON.parse(init.body) : undefined);
    return new Response(data === null ? '' : JSON.stringify(data));
  } catch (e) {
    return new Response(e.message, { status: e.status ?? 500 });
  }
};
const content = await readFile(new URL('../src/content/posts/design-fixture.md', import.meta.url), 'utf8');
const seeded = await pushDraft(github(fake.api, 'ankan17', 'blog'), { rel: REL, slug: 'design-fixture', content, title: 'Design fixture (not a post)', isConflict: () => false });

let built = 'initial';
const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, GITHUB_TOKEN: 't', GITHUB_REPO: 'ankan17/blog', ACCESS_EMAIL: 'me@example.com', ASSETS: { fetch: async () => new Response('n/a', { status: 404 }) } };
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/editor/')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const headers = new Headers(Object.entries(req.headers).filter(([, v]) => typeof v === 'string'));
    headers.set('cf-access-jwt-assertion', await jwt());
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const out = await handle(new Request(url, { method: req.method, headers, body }), env);
    const text = await out.text();
    if (url.pathname.endsWith('/save-draft') && out.status === 200) {
      const commit = JSON.parse(text).commit;
      console.log('save-draft ->', commit, `(preview "rebuilds" in ${REBUILD_MS}ms)`);
      setTimeout(() => { built = commit; console.log('preview rebuilt'); }, REBUILD_MS);
    }
    res.writeHead(out.status, { 'Content-Type': 'application/json' }).end(text);
    return;
  }
  let file = path.join('dist', url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname);
  try {
    let data = await readFile(file);
    if (file.endsWith('.html')) data = Buffer.from(data.toString().replace(/(<meta name="build-commit" content=")[^"]*/, `$1${built}`));
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' }).end(data);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(PORT, () => console.log(`mock cloud preview on http://localhost:${PORT} (seeded ${seeded.branch}, PR #${seeded.prNumber})`));

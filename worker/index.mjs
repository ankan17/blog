// Cloudflare Worker: the cloud editor API under /api/editor/*. Everything else
// is served as static assets. Same draft-session rules as the local editor.
import {
  HttpError, POST_FILE, hash, splitPost, listBlocks, applyEdits, applyMeta, titleOf, publishHead,
} from '../src/editor/core.mjs';
import { github, pushDraft, publishDraft, branchOf } from '../src/editor/github.mjs';
import { verifyAccess } from './access.mjs';

const MAX_BODY = 2_000_000;

function githubApi(token) {
  return async (method, path, body) => {
    const res = await fetch(`https://api.github.com/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'one-level-deeper-editor',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw Object.assign(new Error(`GitHub ${res.status}: ${text.slice(0, 200)}`), { status: res.status });
    return text ? JSON.parse(text) : null;
  };
}

function target(file) {
  const m = typeof file === 'string' && file.match(POST_FILE);
  if (!m) throw new HttpError(400, 'Only posts in src/content/posts/ can be edited.');
  return { rel: file, slug: m[1], branch: branchOf(m[1]) };
}

/** Apply the pending edits and meta changes the browser collected to the branch copy. */
function build(content, { edits = [], meta = [], date } = {}) {
  let { head, body } = splitPost(content);
  for (const m of meta) head = applyMeta(head, m.field, m.value);
  if (edits.length) body = applyEdits(body, edits);
  if (date) head = publishHead(head, date);
  return { head, body, content: head + body };
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'Too large.');
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, 'Bad JSON.');
  }
}

async function route(request, env, url) {
  if (request.headers.get('x-editor') !== '1') throw new HttpError(403, 'Missing X-Editor header.');
  const origin = request.headers.get('origin');
  if ((origin || request.method !== 'GET') && (!origin || new URL(origin).host !== url.host)) throw new HttpError(403, 'Bad origin.');
  await verifyAccess(request, env);

  const repo = String(env.GITHUB_REPO ?? '').match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!repo) throw new HttpError(503, 'GITHUB_REPO is not configured.');
  if (!env.GITHUB_TOKEN) throw new HttpError(503, 'GITHUB_TOKEN is not configured.');
  const gh = github(githubApi(env.GITHUB_TOKEN), repo[1], repo[2]);

  const name = url.pathname.replace(/^\/api\/editor\//, '');
  const input = request.method === 'POST' ? await readBody(request) : {};
  const { rel, slug, branch } = target(request.method === 'POST' ? input.file : url.searchParams.get('file'));

  const remote = await gh.branchFile(rel, branch);
  if (!remote) throw new HttpError(404, 'No draft branch for this post.');
  const version = await hash(remote.content);
  const unchanged = async (r) => (await hash(r.content)) !== input.version;
  const stale = () => { if (input.version !== version) throw new HttpError(409, 'The PR has newer changes. Pull them in first.'); };

  switch (`${request.method} ${name}`) {
    case 'GET blocks':
      return { blocks: listBlocks(splitPost(remote.content).body), version };
    case 'GET session': {
      const pr = await gh.openPr(branch);
      return { repo: true, branch, onBranch: true, prUrl: pr?.html_url ?? null, prNumber: pr?.number ?? null, commit: null, dirty: false };
    }
    case 'POST save-draft': {
      stale();
      const next = build(remote.content, input);
      const saved = await pushDraft(gh, { rel, slug, content: next.content, title: titleOf(next.head), isConflict: unchanged });
      return { branch, prUrl: saved.prUrl, prNumber: saved.prNumber, commit: saved.commit, version: await hash(next.content) };
    }
    case 'POST publish': {
      stale();
      const next = build(remote.content, input);
      const { steps } = await publishDraft(gh, { rel, slug, content: next.content, title: titleOf(next.head), isConflict: unchanged, date: input.date });
      return { steps: [...steps, 'Production deploys from main. Locally, run: git pull.'] };
    }
    default:
      throw new HttpError(404, 'Unknown endpoint.');
  }
}

export async function handle(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/editor/')) return env.ASSETS.fetch(request);
  let status = 200;
  let data;
  try {
    data = await route(request, env, url);
  } catch (e) {
    status = e.status ?? 500;
    data = { error: e.status ? e.message : 'Internal error.' };
  }
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

export default { fetch: handle };

// Server side of the dev-only editor: reads and splices Markdown blocks, and
// talks to GitHub through `gh`. Every external call uses an argument array.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown } from 'mdast-util-gfm';

const run = promisify(execFile);
export const root = process.cwd();
const postsDir = path.join(root, 'src/content/posts') + path.sep;
const stateFile = path.join(root, '.astro/editor-state.json');

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function resolveFile(file) {
  if (!file || typeof file !== 'string') throw new HttpError(400, 'Missing file.');
  const abs = path.resolve(root, file);
  if (!abs.startsWith(postsDir) || !abs.endsWith('.md')) throw new HttpError(400, 'Only files in src/content/posts/ can be edited.');
  return abs;
}

const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 16);

export async function readPost(file) {
  const abs = resolveFile(file);
  let raw;
  try {
    raw = await readFile(abs, 'utf8');
  } catch {
    throw new HttpError(404, 'File not found.');
  }
  const m = raw.match(/^---\n[\s\S]*?\n---\n/);
  const head = m ? m[0] : '';
  return { abs, raw, head, body: raw.slice(head.length), version: hash(raw) };
}

const SKIP = new Set(['definition', 'footnoteDefinition', 'yaml']);

export async function getBlocks(file) {
  const { body, version } = await readPost(file);
  const tree = fromMarkdown(body, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
  const blocks = tree.children
    .filter((n) => !SKIP.has(n.type))
    .map((n) => ({ type: n.type, depth: n.depth, start: n.position.start.offset, end: n.position.end.offset, text: body.slice(n.position.start.offset, n.position.end.offset) }));
  return { blocks, version };
}

export async function saveBlock({ file, start, end, version, text }) {
  const post = await readPost(file);
  if (post.version !== version) throw new HttpError(409, 'File changed on disk. Reload.');
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > post.body.length) throw new HttpError(400, 'Bad range.');
  const clean = String(text ?? '').replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, '');
  let { body } = post;
  if (clean === '') {
    // Delete the block and the blank line that followed it.
    let e = end;
    while (body[e] === '\n') e += 1;
    body = body.slice(0, start) + body.slice(e);
  } else {
    body = body.slice(0, start) + clean + body.slice(end);
  }
  const next = post.head + body;
  await writeFile(post.abs, next);
  return { version: hash(next) };
}

export async function saveMeta({ file, field, value, version }) {
  if (!['title', 'description', 'tags'].includes(field)) throw new HttpError(400, 'Unknown field.');
  const post = await readPost(file);
  if (post.version !== version) throw new HttpError(409, 'File changed on disk. Reload.');
  const v = field === 'tags' ? JSON.stringify([].concat(value).map(String)) : JSON.stringify(String(value));
  const re = new RegExp(`^${field}:.*$`, 'm');
  if (!re.test(post.head)) throw new HttpError(400, `Frontmatter has no ${field} line.`);
  const head = post.head.replace(re, () => `${field}: ${v}`);
  const next = head + post.body;
  await writeFile(post.abs, next);
  return { version: hash(next) };
}

// ---- GitHub -----------------------------------------------------------

function gh(args, input) {
  return new Promise((resolve, reject) => {
    const p = spawn('gh', args, { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(Object.assign(new Error(err.trim() || out.trim()), { code, out }))));
    p.stdin.end(input ?? '');
  });
}
const api = async (args, body) => {
  const out = await gh(['api', ...args, ...(body ? ['--input', '-'] : [])], body ? JSON.stringify(body) : undefined);
  return out ? JSON.parse(out) : null;
};
const notFound = (e) => /HTTP 404|Not Found/.test(e.message);

const NO_REPO = 'No GitHub repo yet. Your edits are saved to the local file only.';

async function repoOf() {
  let url;
  try {
    ({ stdout: url } = await run('git', ['remote', 'get-url', 'origin'], { cwd: root }));
  } catch {
    throw new HttpError(412, NO_REPO);
  }
  const m = url.trim().match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
  if (!m) throw new HttpError(412, NO_REPO);
  return { owner: m[1], name: m[2], base: `repos/${m[1]}/${m[2]}` };
}

const slugOf = (abs) => path.basename(abs, '.md');
const relOf = (abs) => path.relative(root, abs).split(path.sep).join('/');

async function readState() {
  try { return JSON.parse(await readFile(stateFile, 'utf8')); } catch { return {}; }
}
async function writeState(s) {
  await mkdir(path.dirname(stateFile), { recursive: true });
  await writeFile(stateFile, JSON.stringify(s, null, 2));
}

async function branchFile(repo, rel, branch) {
  try {
    const f = await api([`${repo.base}/contents/${rel}?ref=${encodeURIComponent(branch)}`]);
    return { sha: f.sha, content: Buffer.from(f.content, 'base64').toString('utf8') };
  } catch (e) {
    if (notFound(e)) return null;
    throw e;
  }
}
async function openPr(repo, branch) {
  const list = await api([`${repo.base}/pulls?state=open&head=${repo.owner}:${encodeURIComponent(branch)}`]);
  return list[0] ?? null;
}

export async function getSession(file) {
  const post = await readPost(file);
  const rel = relOf(post.abs);
  const branch = `draft/${slugOf(post.abs)}`;
  let repo;
  try {
    repo = await repoOf();
  } catch (e) {
    if (e.status === 412) return { repo: false, message: NO_REPO };
    throw e;
  }
  const remote = await branchFile(repo, rel, branch);
  const pr = remote ? await openPr(repo, branch) : null;
  return {
    repo: true,
    branch,
    onBranch: !!remote,
    prUrl: pr?.html_url ?? null,
    prNumber: pr?.number ?? null,
    commit: (await readState())[rel]?.commit ?? null,
    dirty: !remote || remote.content !== post.raw,
  };
}

async function pushDraft(repo, abs, content, title) {
  const rel = relOf(abs);
  const branch = `draft/${slugOf(abs)}`;
  let ref = null;
  try { ref = await api([`${repo.base}/git/ref/heads/${branch}`]); } catch (e) { if (!notFound(e)) throw e; }
  if (!ref) {
    const main = await api([`${repo.base}/git/ref/heads/main`]);
    await api(['-X', 'POST', `${repo.base}/git/refs`], { ref: `refs/heads/${branch}`, sha: main.object.sha });
  }
  const remote = await branchFile(repo, rel, branch);
  const state = await readState();
  if (remote && remote.content !== content && state[rel]?.blob !== remote.sha) {
    throw new HttpError(409, 'The PR has newer changes. Pull them in first.');
  }
  const res = await api(['-X', 'PUT', `${repo.base}/contents/${rel}`], {
    message: `Save draft: ${title}`,
    content: Buffer.from(content).toString('base64'),
    branch,
    ...(remote ? { sha: remote.sha } : {}),
  });
  state[rel] = { blob: res.content.sha, commit: res.commit.sha };
  await writeState(state);
  let pr = await openPr(repo, branch);
  if (!pr) {
    pr = await api(['-X', 'POST', `${repo.base}/pulls`], {
      title: `Draft: ${title}`,
      head: branch,
      base: 'main',
      body: `Draft session for \`${rel}\`. Saved from the local editor; merging publishes the post.`,
    });
  }
  return { branch, prUrl: pr.html_url, prNumber: pr.number, commit: res.commit.sha };
}

const titleOf = (head) => JSON.parse(head.match(/^title:\s*(.+)$/m)?.[1] ?? '""');

export async function saveDraft(file) {
  const post = await readPost(file);
  const repo = await repoOf();
  return pushDraft(repo, post.abs, post.raw, titleOf(post.head));
}

export async function publish(file) {
  const post = await readPost(file);
  const repo = await repoOf();
  const today = new Date().toISOString().slice(0, 10);
  let head = post.head.replace(/^draft:.*$/m, 'draft: false');
  head = /^date:/m.test(head) ? head.replace(/^date:.*$/m, `date: ${today}`) : head;
  const title = titleOf(head);
  const steps = [];
  const saved = await pushDraft(repo, post.abs, head + post.body, title);
  steps.push(`Final commit ${saved.commit.slice(0, 7)} on ${saved.branch} (draft: false, date: ${today})`);
  await api(['-X', 'PUT', `${repo.base}/pulls/${saved.prNumber}/merge`], { merge_method: 'squash', commit_title: title });
  steps.push(`Merged PR #${saved.prNumber} (squash) into main`);
  await api(['-X', 'DELETE', `${repo.base}/git/refs/heads/${saved.branch}`]);
  steps.push(`Deleted branch ${saved.branch}`);
  steps.push(`Production deploys from main. Locally, run: git checkout -- ${relOf(post.abs)} (or delete the untracked file), then git pull.`);
  return { steps };
}

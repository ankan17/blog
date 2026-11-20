// Local (dev-server) side of the editor: reads and writes the Markdown file on
// disk and talks to GitHub through `gh`. The logic itself lives in core.mjs and
// github.mjs, which the Cloudflare Worker shares.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import {
  HttpError, hash, splitPost, listBlocks, applyEdit, applyMeta, titleOf, publishHead,
} from './core.mjs';
import { github, pushDraft, publishDraft, branchOf } from './github.mjs';

export { HttpError };
const run = promisify(execFile);
export const root = process.cwd();
const postsDir = path.join(root, 'src/content/posts') + path.sep;
const stateFile = path.join(root, '.astro/editor-state.json');

export function resolveFile(file) {
  if (!file || typeof file !== 'string') throw new HttpError(400, 'Missing file.');
  const abs = path.resolve(root, file);
  if (!abs.startsWith(postsDir) || !abs.endsWith('.md')) throw new HttpError(400, 'Only files in src/content/posts/ can be edited.');
  return abs;
}

export async function readPost(file) {
  const abs = resolveFile(file);
  let raw;
  try {
    raw = await readFile(abs, 'utf8');
  } catch {
    throw new HttpError(404, 'File not found.');
  }
  return { abs, raw, ...splitPost(raw), version: await hash(raw) };
}

export async function getBlocks(file) {
  const { body, version } = await readPost(file);
  return { blocks: listBlocks(body), version };
}

export async function saveBlock({ file, start, end, version, text }) {
  const post = await readPost(file);
  if (post.version !== version) throw new HttpError(409, 'File changed on disk. Reload.');
  const next = post.head + applyEdit(post.body, { start, end, text });
  await writeFile(post.abs, next);
  return { version: await hash(next) };
}

export async function saveMeta({ file, field, value, version }) {
  const post = await readPost(file);
  if (post.version !== version) throw new HttpError(409, 'File changed on disk. Reload.');
  const next = applyMeta(post.head, field, value) + post.body;
  await writeFile(post.abs, next);
  return { version: await hash(next) };
}

// ---- GitHub, through the gh CLI ------------------------------------------

function ghApi(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const args = ['api', '-X', method, apiPath, ...(body ? ['--input', '-'] : [])];
    const p = spawn('gh', args, { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) return resolve(out ? JSON.parse(out) : null);
      const msg = (err || out).trim();
      reject(Object.assign(new Error(msg), { status: Number(msg.match(/HTTP (\d{3})/)?.[1]) || 500 }));
    });
    p.stdin.end(body ? JSON.stringify(body) : '');
  });
}

const NO_REPO = 'No GitHub repo yet. Your edits are saved to the local file only.';

async function repoOf() {
  let url;
  try {
    ({ stdout: url } = await run('git', ['remote', 'get-url', 'origin'], { cwd: root }));
  } catch {
    throw new HttpError(412, NO_REPO);
  }
  // Any host, so SSH aliases like git@github-personal:owner/repo.git work.
  const m = url.trim().match(/^(?:git@|ssh:\/\/git@|https:\/\/)[^/:]+[:/]([^/]+)\/(.+?)(?:\.git)?$/);
  if (!m) throw new HttpError(412, NO_REPO);
  return github(ghApi, m[1], m[2]);
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

// The branch "moved under the author" only if it differs from the local file
// and isn't the version this machine last saved.
const conflictCheck = (post, state) => (remote) => remote.content !== post.raw && state[relOf(post.abs)]?.blob !== remote.sha;

export async function getSession(file) {
  const post = await readPost(file);
  const rel = relOf(post.abs);
  const branch = branchOf(slugOf(post.abs));
  let gh;
  try {
    gh = await repoOf();
  } catch (e) {
    if (e.status === 412) return { repo: false, message: NO_REPO };
    throw e;
  }
  const remote = await gh.branchFile(rel, branch);
  const pr = remote ? await gh.openPr(branch) : null;
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

async function remember(rel, saved) {
  const state = await readState();
  state[rel] = { blob: saved.blob, commit: saved.commit };
  await writeState(state);
}

export async function saveDraft(file) {
  const post = await readPost(file);
  const gh = await repoOf();
  const rel = relOf(post.abs);
  const saved = await pushDraft(gh, {
    rel, slug: slugOf(post.abs), content: post.raw, title: titleOf(post.head),
    isConflict: conflictCheck(post, await readState()),
  });
  await remember(rel, saved);
  return { branch: saved.branch, prUrl: saved.prUrl, prNumber: saved.prNumber, commit: saved.commit };
}

// The author's local date, not UTC, so a post is never dated a day early.
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export async function publish(file) {
  const post = await readPost(file);
  const gh = await repoOf();
  const rel = relOf(post.abs);
  const date = today();
  const { steps, saved } = await publishDraft(gh, {
    rel, slug: slugOf(post.abs), content: publishHead(post.head, date) + post.body, title: titleOf(post.head), date,
    isConflict: conflictCheck(post, await readState()),
  });
  await remember(rel, saved);
  steps.push(`Production deploys from main. Locally, run: git checkout -- ${rel} (or delete the untracked file), then git pull.`);
  return { steps };
}

// In-memory GitHub: just enough of the REST API for the draft-session flows.
import { fromBase64, toBase64 } from '../src/editor/core.mjs';

export function fakeGithub(owner = 'o', repo = 'r') {
  const base = `repos/${owner}/${repo}`;
  const files = new Map(); // `${branch}:${path}` -> { content, sha }
  const refs = new Map([['main', 'main-0']]);
  const prs = [];
  let n = 0;
  const id = (p) => `${p}-${++n}`;
  const fail = (status, message = 'x') => Object.assign(new Error(message), { status });
  const log = [];

  async function api(method, path, body) {
    log.push(`${method} ${path.split('?')[0].replace(base + '/', '')}`);
    const u = new URL(`https://x/${path}`);
    const p = u.pathname.slice(1);
    let m;
    if (method === 'GET' && (m = p.match(/^repos\/[^/]+\/[^/]+\/git\/ref\/heads\/(.+)$/))) {
      if (!refs.has(m[1])) throw fail(404);
      return { object: { sha: refs.get(m[1]) } };
    }
    if (method === 'POST' && p === `${base}/git/refs`) {
      refs.set(body.ref.replace('refs/heads/', ''), body.sha);
      return {};
    }
    if (method === 'GET' && (m = p.match(/^repos\/[^/]+\/[^/]+\/contents\/(.+)$/))) {
      const f = files.get(`${u.searchParams.get('ref')}:${m[1]}`);
      if (!f) throw fail(404);
      return { sha: f.sha, content: toBase64(f.content) };
    }
    if (method === 'PUT' && (m = p.match(/^repos\/[^/]+\/[^/]+\/contents\/(.+)$/))) {
      const key = `${body.branch}:${m[1]}`;
      const cur = files.get(key);
      if (cur && cur.sha !== body.sha) throw fail(409, 'sha mismatch');
      if (!cur && body.sha) throw fail(422);
      const sha = id('blob');
      files.set(key, { content: fromBase64(body.content), sha });
      const commit = id('commit');
      refs.set(body.branch, commit);
      return { content: { sha }, commit: { sha: commit } };
    }
    if (method === 'GET' && p === `${base}/pulls`) {
      const head = u.searchParams.get('head').split(':')[1];
      return prs.filter((x) => x.state === 'open' && x.head === head);
    }
    if (method === 'POST' && p === `${base}/pulls`) {
      const pr = { number: prs.length + 1, html_url: `https://github.com/${owner}/${repo}/pull/${prs.length + 1}`, state: 'open', head: body.head, title: body.title, pending: 2 };
      prs.push(pr);
      return pr;
    }
    if (method === 'GET' && (m = p.match(/pulls\/(\d+)$/))) {
      const pr = prs[Number(m[1]) - 1];
      return { ...pr, mergeable: pr.pending > 0 && pr.pending-- ? null : true };
    }
    if (method === 'PUT' && (m = p.match(/pulls\/(\d+)\/merge$/))) {
      const pr = prs[Number(m[1]) - 1];
      if (pr.pending > 0) throw fail(405, 'Pull Request is not mergeable');
      pr.state = 'merged';
      for (const [k, v] of files) if (k.startsWith(`${pr.head}:`)) files.set(`main:${k.slice(pr.head.length + 1)}`, v);
      return { merged: true };
    }
    if (method === 'DELETE' && (m = p.match(/git\/refs\/heads\/(.+)$/))) {
      refs.delete(m[1]);
      return null;
    }
    throw fail(500, `unhandled ${method} ${path}`);
  }
  return { api, files, refs, prs, log, owner, repo };
}

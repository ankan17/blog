// The draft session on GitHub: one branch and one PR per draft.
// `api(method, path, body)` is injected (the gh CLI locally, fetch in the Worker),
// returns parsed JSON, and throws an error with `.status` on failure.
import { HttpError, fromBase64, toBase64 } from './core.mjs';

export const branchOf = (slug) => `draft/${slug}`;
const notFound = (e) => e?.status === 404;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GitHub computes mergeability after a push; merging at once gets a 405. */
export const timing = { poll: 750, tries: 12 };

export function github(api, owner, name) {
  const base = `repos/${owner}/${name}`;
  return {
    async branchHead(branch) {
      try {
        return (await api('GET', `${base}/git/ref/heads/${branch}`)).object.sha;
      } catch (e) {
        if (notFound(e)) return null;
        throw e;
      }
    },
    async ensureBranch(branch) {
      const head = await this.branchHead(branch);
      if (head) return head;
      const main = await api('GET', `${base}/git/ref/heads/main`);
      await api('POST', `${base}/git/refs`, { ref: `refs/heads/${branch}`, sha: main.object.sha });
      return main.object.sha;
    },
    async branchFile(rel, branch) {
      try {
        const f = await api('GET', `${base}/contents/${rel}?ref=${encodeURIComponent(branch)}`);
        return { sha: f.sha, content: fromBase64(f.content) };
      } catch (e) {
        if (notFound(e)) return null;
        throw e;
      }
    },
    async openPr(branch) {
      const list = await api('GET', `${base}/pulls?state=open&head=${owner}:${encodeURIComponent(branch)}`);
      return list[0] ?? null;
    },
    async commit(rel, branch, content, sha, message) {
      return api('PUT', `${base}/contents/${rel}`, { message, content: toBase64(content), branch, ...(sha ? { sha } : {}) });
    },
    async ensurePr(branch, title, rel) {
      return (
        (await this.openPr(branch)) ??
        (await api('POST', `${base}/pulls`, {
          title: `Draft: ${title}`,
          head: branch,
          base: 'main',
          body: `Draft session for \`${rel}\`. Saved from the editor; merging publishes the post.`,
        }))
      );
    },
    async merge(number, title) {
      for (let i = 0; i < timing.tries; i++) {
        if ((await api('GET', `${base}/pulls/${number}`)).mergeable !== null) break;
        await sleep(timing.poll);
      }
      for (let i = 0; ; i++) {
        try {
          return await api('PUT', `${base}/pulls/${number}/merge`, { merge_method: 'squash', commit_title: title });
        } catch (e) {
          if (e.status !== 405 || i >= 3) throw e;
          await sleep(timing.poll);
        }
      }
    },
    deleteBranch: (branch) => api('DELETE', `${base}/git/refs/heads/${branch}`),
  };
}

/** Commit `content` to the draft branch and make sure the PR exists.
 *  `isConflict(remote)` decides whether the branch moved under the author. */
export async function pushDraft(gh, { rel, slug, content, title, isConflict }) {
  const branch = branchOf(slug);
  const head = await gh.ensureBranch(branch);
  const remote = await gh.branchFile(rel, branch);
  if (remote && (await isConflict(remote))) throw new HttpError(409, 'The PR has newer changes. Pull them in first.');
  let commit = head;
  let blob = remote?.sha;
  if (!remote || remote.content !== content) {
    const res = await gh.commit(rel, branch, content, remote?.sha, `Save draft: ${title}`);
    commit = res.commit.sha;
    blob = res.content.sha;
  }
  const pr = await gh.ensurePr(branch, title, rel);
  return { branch, prUrl: pr.html_url, prNumber: pr.number, commit, blob };
}

/** Final commit with the published header, squash-merge, delete the branch. */
export async function publishDraft(gh, { rel, slug, content, title, isConflict, date }) {
  const saved = await pushDraft(gh, { rel, slug, content, title, isConflict });
  const steps = [`Final commit ${saved.commit.slice(0, 7)} on ${saved.branch} (draft: false, date: ${date})`];
  await gh.merge(saved.prNumber, title);
  steps.push(`Merged PR #${saved.prNumber} (squash) into main`);
  await gh.deleteBranch(saved.branch);
  steps.push(`Deleted branch ${saved.branch}`);
  return { steps, saved };
}

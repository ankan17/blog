import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HttpError, hash, splitPost, listBlocks, applyEdit, applyEdits, applyMeta, publishHead, titleOf,
} from '../src/editor/core.mjs';
import { github, pushDraft, publishDraft, timing } from '../src/editor/github.mjs';

timing.poll = 1;
import { handle } from '../worker/index.mjs';
import { fakeGithub } from './fake-github.mjs';

const POST = `---
title: "Demo"
description: "d"
date: 2026-11-20
tags: []
draft: true
---

## One

First paragraph.

Second paragraph.
`;
const REL = 'src/content/posts/demo.md';
const never = () => false;

// ---- core ---------------------------------------------------------------

test('applyEdits applies several edits against one body', () => {
  const { body } = splitPost(POST);
  const [, p1, p2] = listBlocks(body);
  const out = applyEdits(body, [{ ...p1, text: 'A.' }, { ...p2, text: 'B.' }]);
  assert.match(out, /A\.\n\nB\.\n$/);
});

test('applyEdits rejects overlapping edits and bad ranges', () => {
  const { body } = splitPost(POST);
  assert.throws(() => applyEdits(body, [{ start: 0, end: 10, text: 'x' }, { start: 5, end: 12, text: 'y' }]), HttpError);
  assert.throws(() => applyEdit(body, { start: 5, end: 99999, text: 'x' }), HttpError);
});

test('an empty edit deletes the block and the blank line after it', () => {
  const { body } = splitPost(POST);
  const [, p1] = listBlocks(body);
  assert.equal(applyEdit(body, { ...p1, text: '' }), '\n## One\n\nSecond paragraph.\n');
});

test('meta, publish header and titles', () => {
  const { head } = splitPost(POST);
  assert.match(applyMeta(head, 'title', 'A "quoted" title'), /title: "A \\"quoted\\" title"/);
  assert.throws(() => applyMeta(head, 'draft', 'false'), HttpError);
  const pub = publishHead(head, '2026-11-21');
  assert.match(pub, /draft: false/);
  assert.match(pub, /date: 2026-11-21/);
  assert.throws(() => publishHead(head, 'yesterday'), HttpError);
  assert.equal(titleOf('---\ntitle: Plain title\n---\n'), 'Plain title');
  assert.equal(titleOf(head), 'Demo');
});

// ---- draft session ------------------------------------------------------

test('first save creates the branch and PR; later saves reuse the PR', async () => {
  const fake = fakeGithub();
  const gh = github(fake.api, 'o', 'r');
  const a = await pushDraft(gh, { rel: REL, slug: 'demo', content: POST, title: 'Demo', isConflict: never });
  assert.equal(a.branch, 'draft/demo');
  assert.equal(a.prNumber, 1);
  const b = await pushDraft(gh, { rel: REL, slug: 'demo', content: POST + '\nMore.\n', title: 'Demo', isConflict: never });
  assert.equal(b.prNumber, 1);
  assert.equal(fake.prs.length, 1);
  assert.notEqual(a.commit, b.commit);
  const same = await pushDraft(gh, { rel: REL, slug: 'demo', content: POST + '\nMore.\n', title: 'Demo', isConflict: never });
  assert.equal(same.commit, b.commit, 'identical content makes no new commit');
  assert.equal(fake.prs[0].title, 'Draft: Demo');
});

test('a branch that moved under the author is a 409 and is never overwritten', async () => {
  const fake = fakeGithub();
  const gh = github(fake.api, 'o', 'r');
  await pushDraft(gh, { rel: REL, slug: 'demo', content: POST, title: 'Demo', isConflict: never });
  const before = fake.files.get(`draft/demo:${REL}`).content;
  await assert.rejects(
    pushDraft(gh, { rel: REL, slug: 'demo', content: POST + 'mine', title: 'Demo', isConflict: () => true }),
    (e) => e.status === 409 && /newer changes/.test(e.message),
  );
  assert.equal(fake.files.get(`draft/demo:${REL}`).content, before);
});

test('publish waits for GitHub to compute mergeability instead of failing with 405', async () => {
  const fake = fakeGithub();
  const gh = github(fake.api, 'o', 'r');
  await pushDraft(gh, { rel: REL, slug: 'demo', content: POST, title: 'Demo', isConflict: never });
  assert.equal(fake.prs[0].pending, 2, 'a fresh PR has no mergeability yet');
  await gh.merge(1, 'Demo');
  assert.equal(fake.prs[0].state, 'merged');
  assert.ok(fake.log.filter((l) => l.startsWith('GET pulls/1')).length >= 3, 'polled before merging');
});

test('a 405 that outlives the retries is reported, not swallowed', async () => {
  const fake = fakeGithub();
  const gh = github(fake.api, 'o', 'r');
  await pushDraft(gh, { rel: REL, slug: 'demo', content: POST, title: 'Demo', isConflict: never });
  fake.prs[0].pending = 1e9;
  const tries = timing.tries;
  timing.tries = 1;
  await assert.rejects(gh.merge(1, 'Demo'), (e) => e.status === 405);
  timing.tries = tries;
  assert.equal(fake.prs[0].state, 'open');
});

test('publish commits the published header, merges and deletes the branch', async () => {
  const fake = fakeGithub();
  const gh = github(fake.api, 'o', 'r');
  await pushDraft(gh, { rel: REL, slug: 'demo', content: POST, title: 'Demo', isConflict: never });
  const { head, body } = splitPost(POST);
  const { steps } = await publishDraft(gh, { rel: REL, slug: 'demo', content: publishHead(head, '2026-11-21') + body, title: 'Demo', isConflict: never, date: '2026-11-21' });
  assert.equal(steps.length, 3);
  assert.equal(fake.prs[0].state, 'merged');
  assert.ok(!fake.refs.has('draft/demo'));
  assert.match(fake.files.get(`main:${REL}`).content, /draft: false/);
});

// ---- worker -------------------------------------------------------------

const TEAM = 'team.cloudflareaccess.com';
const AUD = 'aud-123';
const ORIGIN = 'https://blog.test';
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));

let setups = 0;
async function setup() {
  const kid = `k${++setups}`;
  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid, alg: 'RS256', use: 'sig' };
  const sign = async (claims, useKid = kid) => {
    const head = `${enc({ alg: 'RS256', kid: useKid, typ: 'JWT' })}.${enc(claims)}`;
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(head));
    return `${head}.${b64u(sig)}`;
  };
  const fake = fakeGithub();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (u.host === TEAM) return Response.json({ keys: [jwk] });
    if (u.host === 'api.github.com') {
      try {
        const data = await fake.api(init.method ?? 'GET', u.pathname.slice(1) + u.search, init.body ? JSON.parse(init.body) : undefined);
        return new Response(data === null ? '' : JSON.stringify(data));
      } catch (e) {
        return new Response(e.message, { status: e.status ?? 500 });
      }
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, GITHUB_TOKEN: 't', GITHUB_REPO: 'o/r', ASSETS: { fetch: async () => new Response('asset') } };
  const good = () => sign({ iss: `https://${TEAM}`, aud: [AUD], exp: Date.now() / 1000 + 600, email: 'me@example.com' });
  const call = async (path, { method = 'GET', body, jwt, headers = {}, e = env } = {}) => {
    const h = { 'x-editor': '1', ...(jwt === undefined ? { 'cf-access-jwt-assertion': await good() } : jwt ? { 'cf-access-jwt-assertion': jwt } : {}), ...(method === 'POST' ? { origin: ORIGIN, 'content-type': 'application/json' } : {}), ...headers };
    const res = await handle(new Request(`${ORIGIN}${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), e);
    return { status: res.status, data: res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text() };
  };
  return { fake, env, call, sign, good, restore: () => (globalThis.fetch = realFetch) };
}

test('worker: refuses everything without valid Access config and token', async (t) => {
  const s = await setup();
  t.after(s.restore);
  const q = `/api/editor/blocks?file=${REL}`;
  assert.equal((await s.call(q, { e: { ...s.env, ACCESS_AUD: '' } })).status, 503, 'no Access config fails closed');
  assert.equal((await s.call(q, { jwt: null })).status, 401, 'no token');
  assert.equal((await s.call(q, { jwt: 'a.b.c' })).status, 401, 'garbage token');
  assert.equal((await s.call(q, { jwt: await s.sign({ iss: `https://${TEAM}`, aud: ['other'], exp: Date.now() / 1000 + 600 }) })).status, 403, 'wrong audience');
  assert.equal((await s.call(q, { jwt: await s.sign({ iss: `https://${TEAM}`, aud: [AUD], exp: 1 }) })).status, 401, 'expired');
  assert.equal((await s.call(q, { jwt: await s.sign({ iss: `https://${TEAM}`, aud: [AUD], exp: Date.now() / 1000 + 600 }, 'unknown') })).status, 401, 'unknown key id');
  const forged = (await s.good()).split('.');
  forged[1] = enc({ iss: `https://${TEAM}`, aud: [AUD], exp: Date.now() / 1000 + 600, email: 'evil@example.com' });
  assert.equal((await s.call(q, { jwt: forged.join('.') })).status, 401, 'tampered payload');
  assert.equal((await s.call(q, { headers: { 'x-editor': '' } })).status, 403, 'missing X-Editor');
  assert.equal((await s.call(`/api/editor/save-draft`, { method: 'POST', headers: { origin: 'https://evil.test' }, body: { file: REL } })).status, 403, 'bad origin');
  assert.equal((await s.call(q, { e: { ...s.env, ACCESS_EMAIL: 'someone@else.com' } })).status, 403, 'wrong email');
  assert.equal((await s.call(q, { e: { ...s.env, GITHUB_TOKEN: '' } })).status, 503, 'no GitHub token');
  assert.equal(s.fake.log.length, 0, 'nothing reached GitHub');
});

test('worker: serves assets for non-API paths and rejects other files', async (t) => {
  const s = await setup();
  t.after(s.restore);
  assert.equal((await s.call('/index.html', { jwt: null })).data, 'asset');
  for (const bad of ['../../etc/passwd', 'src/content/posts/../x.md', 'astro.config.mjs', 'src/content/posts/Demo.md']) {
    assert.equal((await s.call(`/api/editor/blocks?file=${encodeURIComponent(bad)}`)).status, 400, bad);
  }
  assert.equal((await s.call(`/api/editor/blocks?file=${REL}`)).status, 404, 'no draft branch yet');
});

test('worker: blocks → save-draft with pending edits → conflict → publish', async (t) => {
  const s = await setup();
  t.after(s.restore);
  const gh = github(s.fake.api, 'o', 'r');
  await pushDraft(gh, { rel: REL, slug: 'demo', content: POST, title: 'Demo', isConflict: never });

  const { data: blocks } = await s.call(`/api/editor/blocks?file=${REL}`);
  const [, p1, p2] = blocks.blocks;
  assert.equal(blocks.blocks.length, 3);
  assert.equal(blocks.version, await hash(POST));

  const session = await s.call(`/api/editor/session?file=${REL}`);
  assert.equal(session.data.prNumber, 1);

  // Two block edits and a title change land as one commit.
  const commitsBefore = [...s.fake.refs.values()].length;
  const saved = await s.call('/api/editor/save-draft', { method: 'POST', body: { file: REL, version: blocks.version, edits: [{ start: p1.start, end: p1.end, text: 'Edited one.' }, { start: p2.start, end: p2.end, text: 'Edited two.' }], meta: [{ field: 'title', value: 'New title' }] } });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.prNumber, 1);
  const onBranch = s.fake.files.get(`draft/demo:${REL}`).content;
  assert.match(onBranch, /title: "New title"/);
  assert.match(onBranch, /Edited one\.\n\nEdited two\.\n$/);
  assert.equal(saved.data.version, await hash(onBranch));
  assert.equal(s.fake.prs.length, 1);
  assert.ok(commitsBefore >= 1);

  // A stale version (someone else saved since the page loaded) is refused, nothing is written.
  const stale = await s.call('/api/editor/save-draft', { method: 'POST', body: { file: REL, version: blocks.version, edits: [{ start: 0, end: 1, text: 'x' }] } });
  assert.equal(stale.status, 409);
  assert.equal(s.fake.files.get(`draft/demo:${REL}`).content, onBranch);

  // Overlapping or out-of-range edits are rejected.
  assert.equal((await s.call('/api/editor/save-draft', { method: 'POST', body: { file: REL, version: saved.data.version, edits: [{ start: 99999, end: 100000, text: 'x' }] } })).status, 400);

  const pub = await s.call('/api/editor/publish', { method: 'POST', body: { file: REL, version: saved.data.version, date: '2026-11-21' } });
  assert.equal(pub.status, 200, JSON.stringify(pub.data));
  assert.equal(s.fake.prs[0].state, 'merged');
  assert.ok(!s.fake.refs.has('draft/demo'));
  const live = s.fake.files.get(`main:${REL}`).content;
  assert.match(live, /draft: false/);
  assert.match(live, /date: 2026-11-21/);
});

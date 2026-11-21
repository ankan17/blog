import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HttpError, hash, splitPost, listBlocks, applyEdit, applyEdits, applyMeta, publishHead, titleOf,
} from '../src/editor/core.mjs';
import { github, pushDraft, publishDraft, timing } from '../src/editor/github.mjs';

timing.poll = 1;
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

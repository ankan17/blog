// In-browser editor. Clicking a block edits its Markdown source.
//   local: `astro dev`. Each edit is written to the file on disk at once.
//   artifact: the built site published as a Claude artifact (npm run artifact). Edits are
//          held in the page (shown in place as the edited Markdown) and autosaved to the
//          artifact's db (drafts/<slug>). There is no Save or Publish here: the author tells
//          their Claude session, which applies the saved edits, opens the PR and merges it.
// Never part of a production build: src/editor/integration.mjs injects it.
import css from './editor.css?inline';

type Mode = 'local' | 'artifact';
type Block = { type: string; depth?: number; start: number; end: number; text: string };
type Pending = { edits: Record<number, string>; meta: Record<string, string> };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function start(mode: Mode) {
  const artifact = mode === 'artifact';
  const held = artifact; // edits are held in the page and shown in place
  const article = document.querySelector<HTMLElement>('article.prose[data-editor-file]');
  if (!article) return;
  const file = article.dataset.editorFile ?? '';
  const isDraft = article.hasAttribute('data-draft');
  const api = '/__editor/';
  const key = (k: string) => `ed-${k}:${file}`;
  const slug = file.match(/([^/]+)\.md$/)?.[1] ?? '';

  async function call(method: string, path: string, body?: unknown) {
    const res = await fetch(api + path, {
      method,
      headers: { 'X-Editor': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status });
    return data;
  }

  // Inlined rather than imported: CSS from an injected script isn't linked into built pages.
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);

  const bar = document.createElement('div');
  bar.className = 'ed-bar';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Editor');
  bar.hidden = true;
  document.body.append(bar);

  let version = '';
  let blocks: Block[] = [];
  let els: HTMLElement[] = [];
  let session: any = null;
  let blocked = '';
  let editing = false;
  let on = false;
  let busy = '';
  let published = false;
  let confirmPublish = false;
  let msg: { text: string; err?: boolean; link?: string } | null = null;
  let log: string[] = [];
  let pending: Pending = { edits: {}, meta: {} };
  const metaOriginal: Record<string, string> = {};

  const pendingCount = () => Object.keys(pending.edits).length + Object.keys(pending.meta).length;
  const persist = () => {
    try { sessionStorage.setItem(key('pending'), JSON.stringify({ version, ...pending })); } catch {}
    if (artifact) scheduleAutosave();
  };

  // ---- autosave to the artifact's db (artifact mode) --------------------

  let store: any = null;
  let saveState: '' | 'saving' | 'saved' | 'error' = '';
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let flushing = false;

  function scheduleAutosave() {
    saveState = 'saving';
    render();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 800);
  }

  async function flush() {
    if (flushing) { scheduleAutosave(); return; }
    if (!store) { saveState = 'error'; render(); return; }
    flushing = true;
    try {
      const p = payload();
      await store.set({ file, version, pending, edits: p.edits, meta: p.meta, updatedAt: new Date().toISOString() });
      saveState = 'saved';
    } catch { saveState = 'error'; }
    flushing = false;
    render();
  }

  // ---- pairing blocks with the rendered page ----------------------------

  const matches = (b: Block, el: Element) => {
    const t = el.tagName;
    switch (b.type) {
      case 'heading': return t === `H${b.depth}`;
      case 'code': return t === 'FIGURE' && el.classList.contains('listing');
      case 'table': return t === 'FIGURE' && el.classList.contains('table');
      case 'paragraph': return t === 'P';
      case 'list': return t === 'UL' || t === 'OL';
      case 'blockquote': return t === 'BLOCKQUOTE';
      case 'thematicBreak': return t === 'HR';
      case 'html': return true;
      default: return false;
    }
  };

  function pair() {
    els = [...article!.children].filter((e) => !(e.tagName === 'SECTION' && e.hasAttribute('data-footnotes'))) as HTMLElement[];
    if (els.length !== blocks.length) return `Block count differs (page ${els.length}, source ${blocks.length}). The preview may still be building.`;
    for (let i = 0; i < els.length; i++) {
      if (!matches(blocks[i], els[i])) return `Block ${i + 1} is a ${blocks[i].type} in the source but <${els[i].tagName.toLowerCase()}> on the page.`;
    }
    els.forEach((e) => e.setAttribute('data-ed-block', ''));
    return '';
  }

  // ---- showing pending edits in place (artifact) ---------------------------

  function paint() {
    document.querySelectorAll('.ed-pending').forEach((n) => n.remove());
    for (const [i, text] of Object.entries(pending.edits)) {
      const el = els[Number(i)];
      if (!el) continue;
      el.hidden = true;
      const box = document.createElement('div');
      box.className = 'ed-pending';
      box.dataset.edFor = i;
      box.innerHTML = `<pre>${text === '' ? '(block deleted)' : esc(text)}</pre><div class="cap">${artifact ? 'Edited' : 'Unsaved edit'} · click to edit</div>`;
      el.after(box);
    }
    els.forEach((el, i) => { if (!(i in pending.edits)) el.hidden = false; });
    for (const field of ['title', 'description']) {
      const el = document.querySelector<HTMLElement>(`[data-editor-meta="${field}"]`);
      if (!el) continue;
      metaOriginal[field] ??= el.textContent ?? '';
      el.textContent = field in pending.meta ? pending.meta[field] : metaOriginal[field];
      el.classList.toggle('ed-meta-pending', field in pending.meta);
    }
  }

  // ---- toolbar ----------------------------------------------------------

  function render() {
    bar.hidden = false;
    document.body.classList.add('ed-bar-on');
    const noRepo = session && !session.repo;
    const n = pendingCount();
    let state = isDraft ? 'Draft' : 'Published';
    if (published) state = 'Published';
    else if (isDraft && artifact) {
      if (!store) state += ' · autosave unavailable';
      else if (saveState === 'error') state += ' · autosave failed';
      else if (saveState === 'saving') state += ' · saving…';
      else state += n > 0 ? ` · ${n} edit${n === 1 ? '' : 's'} saved` : '';
    } else if (isDraft && session?.repo) {
      state += session.dirty || !session.prUrl ? ' · unsaved changes' : ` · saved to <a href="${esc(session.prUrl)}">PR #${session.prNumber}</a>`;
    }
    const canSave = !busy && !published && !noRepo && session?.repo && session.dirty;
    const canPublish = !busy && !published && !noRepo;
    const toggleOff = !!blocked || published;
    bar.innerHTML = `
      <div class="grp"><span>${state}</span>${blocked ? `<span class="ed-err"> · editing off: ${esc(blocked)}</span>` : ''}</div>
      <div class="grp">
        <button type="button" data-a="toggle" ${toggleOff ? 'disabled' : ''} aria-pressed="${on}">Edit ${on ? 'on' : 'off'} (E)</button>
        ${artifact ? (isDraft ? '<span>Say “publish now” in your Claude session when done</span>' : '') : ''}
        ${isDraft && !artifact ? `<button type="button" data-a="save" ${canSave ? '' : 'disabled'}>${busy === 'save' ? 'Saving…' : 'Save draft (⌘S)'}</button>` : ''}
        ${isDraft && !artifact ? (confirmPublish
          ? `<span>Publish now?</span><button type="button" data-a="yes">Yes</button><button type="button" data-a="no">Cancel</button>`
          : `<button type="button" data-a="publish" ${canPublish ? '' : 'disabled'}>${busy === 'publish' ? 'Publishing…' : 'Publish'}</button>`) : ''}
      </div>
      ${noRepo ? `<div class="ed-msg">${esc(session.message)}</div>` : ''}
      ${msg ? `<div class="ed-msg ${msg.err ? 'ed-err' : ''}">${esc(msg.text)}${msg.link ? ` <a href="${esc(msg.link)}">Open PR</a>` : ''}</div>` : ''}
      ${log.length ? `<div class="ed-msg">${log.map(esc).join('<br>')}</div>` : ''}`;
  }

  const fail = (e: any) => {
    msg = { text: e.message, err: true, link: e.status === 409 ? session?.prUrl : undefined };
    busy = '';
    confirmPublish = false;
    render();
  };

  async function refreshSession() {
    try { session = await call('GET', `session?file=${encodeURIComponent(file)}`); } catch (e: any) { session = { repo: false, message: e.message }; }
    render();
  }

  // ---- saving, publishing, waiting for the rebuild ----------------------

  const payload = () => ({
    file,
    version,
    edits: Object.entries(pending.edits).map(([i, text]) => ({ start: blocks[Number(i)].start, end: blocks[Number(i)].end, text })),
    meta: Object.entries(pending.meta).map(([field, value]) => ({ field, value })),
  });

  async function saveDraft() {
    busy = 'save';
    msg = null;
    render();
    try {
      const r = await call('POST', 'save-draft', { file });
      session = { ...session, repo: true, dirty: false, prUrl: r.prUrl, prNumber: r.prNumber };
      busy = '';
      msg = { text: `Saved to PR #${r.prNumber}.` };
      render();
    } catch (e) { fail(e); }
  }

  async function publish() {
    confirmPublish = false;
    busy = 'publish';
    msg = null;
    render();
    try {
      if (session?.dirty) await call('POST', 'save-draft', { file });
      const r = await call('POST', 'publish', { file });
      log = r.steps;
      busy = '';
      published = true;
      msg = { text: 'Published.' };
      setOn(false);
      render();
    } catch (e) { fail(e); }
  }

  // ---- editing a block or the title/dek ---------------------------------

  const autogrow = (t: HTMLTextAreaElement) => { t.style.height = 'auto'; t.style.height = `${t.scrollHeight + 2}px`; };

  function reloadKeepingScroll() {
    sessionStorage.setItem('ed-scroll', String(scrollY));
    location.reload();
  }

  function openPanel(el: HTMLElement, initial: string, kind: 'block' | 'meta', onSave: (v: string) => Promise<void>) {
    if (editing) return;
    editing = true;
    const panel = document.createElement('div');
    panel.className = 'ed-panel';
    const field = kind === 'block' ? document.createElement('textarea') : document.createElement('input');
    field.value = initial;
    field.setAttribute('aria-label', 'Markdown source');
    panel.append(field);
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<button type="button" data-p="save">${kind === 'block' ? 'Save (⌘↵)' : 'Save (↵)'}</button><button type="button" data-p="cancel">Cancel (Esc)</button><span class="ed-err" data-p="err"></span>`;
    panel.append(row);
    el.hidden = true;
    el.after(panel);
    if (field instanceof HTMLTextAreaElement) { autogrow(field); field.addEventListener('input', () => autogrow(field)); }
    field.focus();
    const close = () => { panel.remove(); editing = false; if (held && kind === 'block') paint(); else el.hidden = false; };
    const err = row.querySelector('[data-p=err]') as HTMLElement;
    const save = async () => {
      try { await onSave(field.value); if (held) close(); } catch (e: any) {
        err.innerHTML = esc(e.message) + (e.status === 409 ? ' <button type="button" data-p="reload">Reload</button>' : '');
      }
    };
    panel.addEventListener('click', (e) => {
      const p = (e.target as HTMLElement).dataset.p;
      if (p === 'save') save();
      if (p === 'cancel') close();
      if (p === 'reload') location.reload();
    });
    field.addEventListener('keydown', (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Escape') { ke.preventDefault(); close(); }
      else if (ke.key === 'Enter' && (kind === 'meta' || ke.metaKey || ke.ctrlKey)) { ke.preventDefault(); save(); }
    });
  }

  function onClick(e: MouseEvent) {
    if (!on || editing) return;
    const target = e.target as HTMLElement;
    if (target.closest('.ed-bar, .ed-panel')) return;
    if (target.closest('button, a:not(.heading-link)')) return;

    const metaEl = target.closest<HTMLElement>('[data-editor-meta]');
    if (metaEl) {
      e.preventDefault();
      const field = metaEl.dataset.editorMeta!;
      openPanel(metaEl, metaEl.textContent ?? '', 'meta', async (value) => {
        if (held) {
          if (value === (metaOriginal[field] ?? metaEl.textContent)) delete pending.meta[field]; else pending.meta[field] = value;
          persist();
          paint();
          render();
        } else {
          await call('POST', 'meta', { file, field, value, version });
          reloadKeepingScroll();
        }
      });
      return;
    }

    const ghost = target.closest<HTMLElement>('.ed-pending');
    const i = ghost ? Number(ghost.dataset.edFor) : els.findIndex((el) => el.contains(target));
    if (i < 0) return;
    e.preventDefault();
    const b = blocks[i];
    openPanel(ghost ?? els[i], i in pending.edits ? pending.edits[i] : b.text, 'block', async (text) => {
      if (held) {
        const clean = text.replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, '');
        if (clean === b.text) delete pending.edits[i]; else pending.edits[i] = clean;
        persist();
        render();
      } else {
        await call('POST', 'block', { file, start: b.start, end: b.end, version, text });
        reloadKeepingScroll();
      }
    });
  }

  function setOn(v: boolean) {
    on = v && !blocked && !published;
    document.body.classList.toggle('ed-on', on);
    try { sessionStorage.setItem('ed-on', on ? '1' : '0'); } catch {}
    render();
  }

  // ---- startup ----------------------------------------------------------

  async function init() {
    const saved = sessionStorage.getItem('ed-scroll');
    if (saved) { sessionStorage.removeItem('ed-scroll'); scrollTo(0, Number(saved)); }
    const wasOn = sessionStorage.getItem('ed-on') === '1';
    try {
      if (artifact) {
        // Blocks and the version hash are computed at build time (scripts/build-artifact.mjs).
        ({ blocks, version } = await (await fetch(new URL(`../editor-data/${slug}.json`, location.href))).json());
        if (!isDraft) throw new Error('Only drafts can be edited here.');
        const claude = (window as any).claude;
        const db = await claude?.use?.('db');
        store = db ? db.doc(`drafts/${slug}`) : null;
      } else {
        ({ blocks, version } = await call('GET', `blocks?file=${encodeURIComponent(file)}`));
      }
      blocked = pair();
    } catch (e: any) { blocked = e.message; }

    if (artifact && store && !blocked) {
      try {
        const snap = await store.get();
        const d = snap.exists ? (snap.data() as any) : null;
        if (d && d.version === version) pending = { edits: d.pending?.edits ?? {}, meta: d.pending?.meta ?? {} };
        else if (d) msg = { text: 'The draft changed after these edits were saved, so they were set aside.', err: true };
        if (d && d.version === version) saveState = 'saved';
      } catch { saveState = 'error'; }
      paint();
    }
    render();
    if (!artifact) refreshSession();

    bar.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).dataset.a;
      if (a === 'toggle') setOn(!on);
      if (a === 'save') saveDraft();
      if (a === 'publish') { confirmPublish = true; render(); }
      if (a === 'no') { confirmPublish = false; render(); }
      if (a === 'yes') publish();
    });
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement;
      if (e.key === 'e' && !t.matches('input, textarea') && !e.metaKey && !e.ctrlKey && !e.altKey) setOn(!on);
      if (e.key === 's' && (e.metaKey || e.ctrlKey) && isDraft && !busy && !artifact) { e.preventDefault(); if (!bar.querySelector('[data-a=save]:disabled')) saveDraft(); }
    });
    setOn(wasOn);

  }
  init();
}

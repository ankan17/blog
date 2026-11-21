// In-browser editor. Clicking a block edits its Markdown source.
//   local: `astro dev`. Each edit is written to the file on disk at once.
//   cloud: a preview build behind Cloudflare Access. Edits are held in the browser
//          (shown in place as the edited Markdown) and Save draft commits them all
//          as one commit to the draft's PR; the page then waits for the rebuild.
// Never part of a production build: src/editor/integration.mjs injects it.
import css from './editor.css?inline';

type Mode = 'local' | 'cloud';
type Block = { type: string; depth?: number; start: number; end: number; text: string };
type Pending = { edits: Record<number, string>; meta: Record<string, string> };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function start(mode: Mode) {
  const cloud = mode === 'cloud';
  const article = document.querySelector<HTMLElement>('article.prose[data-editor-file]');
  if (!article) return;
  const file = article.dataset.editorFile ?? '';
  const isDraft = article.hasAttribute('data-draft');
  const api = cloud ? '/api/editor/' : '/__editor/';
  const key = (k: string) => `ed-${k}:${file}`;

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
  let rebuilding = '';
  let published = false;
  let confirmPublish = false;
  let msg: { text: string; err?: boolean; link?: string } | null = null;
  let log: string[] = [];
  let pending: Pending = { edits: {}, meta: {} };
  const metaOriginal: Record<string, string> = {};

  const pendingCount = () => Object.keys(pending.edits).length + Object.keys(pending.meta).length;
  const persist = () => {
    try { sessionStorage.setItem(key('pending'), JSON.stringify({ version, ...pending })); } catch {}
  };

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

  // ---- showing pending edits in place (cloud) ---------------------------

  function paint() {
    document.querySelectorAll('.ed-pending').forEach((n) => n.remove());
    for (const [i, text] of Object.entries(pending.edits)) {
      const el = els[Number(i)];
      if (!el) continue;
      el.hidden = true;
      const box = document.createElement('div');
      box.className = 'ed-pending';
      box.dataset.edFor = i;
      box.innerHTML = `<pre>${text === '' ? '(block deleted)' : esc(text)}</pre><div class="cap">Unsaved edit · click to edit</div>`;
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
    else if (rebuilding) state = 'Draft · Rebuilding preview…';
    else if (isDraft && cloud) {
      if (n > 0) state += ` · ${n} unsaved edit${n === 1 ? '' : 's'}`;
      else if (session?.prUrl) state += ` · saved to <a href="${esc(session.prUrl)}">PR #${session.prNumber}</a>`;
    } else if (isDraft && session?.repo) {
      state += session.dirty || !session.prUrl ? ' · unsaved changes' : ` · saved to <a href="${esc(session.prUrl)}">PR #${session.prNumber}</a>`;
    }
    const canSave = !busy && !rebuilding && !published && !noRepo && (cloud ? n > 0 : session?.repo && session.dirty);
    const canPublish = !busy && !rebuilding && !published && !noRepo;
    const toggleOff = !!blocked || !!rebuilding || published;
    bar.innerHTML = `
      <div class="grp"><span>${state}</span>${blocked ? `<span class="ed-err"> · editing off: ${esc(blocked)}</span>` : ''}</div>
      <div class="grp">
        <button type="button" data-a="toggle" ${toggleOff ? 'disabled' : ''} aria-pressed="${on}">Edit ${on ? 'on' : 'off'} (E)</button>
        ${isDraft ? `<button type="button" data-a="save" ${canSave ? '' : 'disabled'}>${busy === 'save' ? 'Saving…' : 'Save draft (⌘S)'}</button>` : ''}
        ${isDraft ? (confirmPublish
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

  async function waitForBuild(commit: string) {
    rebuilding = commit;
    try { sessionStorage.setItem(key('rebuild'), commit); } catch {}
    setOn(false);
    const started = Date.now();
    while (Date.now() - started < 6 * 60_000) {
      try {
        const html = await (await fetch(`${location.pathname}?_=${Date.now()}`, { cache: 'no-store' })).text();
        if (html.match(/<meta name="build-commit" content="([^"]*)"/)?.[1] === commit) {
          try { sessionStorage.removeItem(key('rebuild')); } catch {}
          sessionStorage.setItem('ed-scroll', String(scrollY));
          location.reload();
          return;
        }
      } catch {}
      await sleep(5000);
    }
    rebuilding = '';
    msg = { text: 'The preview is taking longer than usual. Reload once the build has finished.', err: true };
    render();
  }

  async function saveDraft() {
    busy = 'save';
    msg = null;
    render();
    try {
      if (cloud) {
        const r = await call('POST', 'save-draft', payload());
        pending = { edits: {}, meta: {} };
        try { sessionStorage.removeItem(key('pending')); } catch {}
        busy = '';
        session = { ...session, repo: true, prUrl: r.prUrl, prNumber: r.prNumber };
        msg = { text: `Saved to PR #${r.prNumber}.` };
        render();
        await waitForBuild(r.commit);
      } else {
        const r = await call('POST', 'save-draft', { file });
        session = { ...session, repo: true, dirty: false, prUrl: r.prUrl, prNumber: r.prNumber };
        busy = '';
        msg = { text: `Saved to PR #${r.prNumber}.` };
        render();
      }
    } catch (e) { fail(e); }
  }

  async function publish() {
    confirmPublish = false;
    busy = 'publish';
    msg = null;
    render();
    try {
      if (!cloud && session?.dirty) await call('POST', 'save-draft', { file });
      const r = await call('POST', 'publish', cloud ? { ...payload(), date: localDate() } : { file });
      pending = { edits: {}, meta: {} };
      try { sessionStorage.removeItem(key('pending')); } catch {}
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
    const close = () => { panel.remove(); editing = false; if (cloud && kind === 'block') paint(); else el.hidden = false; };
    const err = row.querySelector('[data-p=err]') as HTMLElement;
    const save = async () => {
      try { await onSave(field.value); if (cloud) close(); } catch (e: any) {
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
        if (cloud) {
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
      if (cloud) {
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
    on = v && !blocked && !rebuilding && !published;
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
      ({ blocks, version } = await call('GET', `blocks?file=${encodeURIComponent(file)}`));
      blocked = pair();
    } catch (e: any) { blocked = e.message; }

    if (cloud && !blocked) {
      try {
        const p = JSON.parse(sessionStorage.getItem(key('pending')) ?? 'null');
        if (p && p.version === version) pending = { edits: p.edits ?? {}, meta: p.meta ?? {} };
        else if (p) { sessionStorage.removeItem(key('pending')); msg = { text: 'The draft changed, so your unsaved edits were discarded.', err: true }; }
      } catch {}
      paint();
    }
    render();
    refreshSession();

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
      if (e.key === 's' && (e.metaKey || e.ctrlKey) && isDraft && !busy) { e.preventDefault(); if (!bar.querySelector('[data-a=save]:disabled')) saveDraft(); }
    });
    window.addEventListener('beforeunload', (e) => { if (cloud && pendingCount() > 0 && !busy) e.preventDefault(); });
    setOn(wasOn);

    // Reloaded in the middle of a rebuild: keep waiting for it.
    const resume = sessionStorage.getItem(key('rebuild'));
    if (cloud && resume) {
      const built = document.querySelector('meta[name=build-commit]')?.getAttribute('content');
      if (built === resume) sessionStorage.removeItem(key('rebuild')); else waitForBuild(resume);
    }
  }
  init();
}

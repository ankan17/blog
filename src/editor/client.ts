// Dev-only in-browser editor. Injected by src/editor/integration.mjs; never part of a production build.
import './editor.css';
const article = document.querySelector<HTMLElement>('article.prose[data-editor-file]');
const bar = document.createElement('div');
bar.className = 'ed-bar';
bar.setAttribute('role', 'region');
bar.setAttribute('aria-label', 'Editor');
bar.hidden = true;
document.body.append(bar);
const file = article?.dataset.editorFile ?? '';
const isDraft = article?.hasAttribute('data-draft') ?? false;

// One interface, so a cloud backend can replace `local` later.
const local = {
  async call(method: string, path: string, body?: unknown) {
    const res = await fetch(`/__editor/${path}`, {
      method,
      headers: { 'X-Editor': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status });
    return data;
  },
  getBlocks: () => local.call('GET', `blocks?file=${encodeURIComponent(file)}`),
  getSession: () => local.call('GET', `session?file=${encodeURIComponent(file)}`),
  saveBlock: (b: object) => local.call('POST', 'block', { file, ...b }),
  saveMeta: (b: object) => local.call('POST', 'meta', { file, ...b }),
  saveDraft: () => local.call('POST', 'save-draft', { file }),
  publish: () => local.call('POST', 'publish', { file }),
};
const backend = local;

type Block = { type: string; depth?: number; start: number; end: number; text: string };
let version = '';
let blocks: Block[] = [];
let session: any = null;
let blocked = '';
let editing = false;
let on = false;
let msg: { text: string; err?: boolean; html?: string } | null = null;
let confirmPublish = false;
let busy = '';
let log: string[] = [];

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

let els: HTMLElement[] = [];
function pair() {
  els = [...article!.children].filter((e) => !(e.tagName === 'SECTION' && e.hasAttribute('data-footnotes'))) as HTMLElement[];
  if (els.length !== blocks.length) return `Block count differs (page ${els.length}, source ${blocks.length}).`;
  for (let i = 0; i < els.length; i++) {
    if (!matches(blocks[i], els[i])) return `Block ${i + 1} is a ${blocks[i].type} in the source but <${els[i].tagName.toLowerCase()}> on the page.`;
  }
  els.forEach((e) => e.setAttribute('data-ed-block', ''));
  return '';
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function render() {
  bar.hidden = false;
  document.body.classList.add('ed-bar-on');
  const dirty = session?.repo ? session.dirty : false;
  let state = isDraft ? 'Draft' : 'Published';
  if (isDraft && session?.repo) {
    state += dirty || !session.prUrl ? ' · unsaved changes' : ` · saved to <a href="${esc(session.prUrl)}">PR #${session.prNumber}</a>`;
  }
  const noRepo = session && !session.repo;
  bar.innerHTML = `
    <div class="grp"><span>${state}</span>${blocked ? `<span class="ed-err"> · editing off: ${esc(blocked)}</span>` : ''}</div>
    <div class="grp">
      <button type="button" data-a="toggle" ${blocked ? 'disabled' : ''} aria-pressed="${on}">Edit ${on ? 'on' : 'off'} (E)</button>
      ${isDraft ? `<button type="button" data-a="save" ${busy || noRepo || (session?.repo && !dirty) ? 'disabled' : ''}>${busy === 'save' ? 'Saving…' : 'Save draft (⌘S)'}</button>` : ''}
      ${isDraft ? (confirmPublish
        ? `<span>Publish now?</span><button type="button" data-a="yes">Yes</button><button type="button" data-a="no">Cancel</button>`
        : `<button type="button" data-a="publish" ${busy || noRepo ? 'disabled' : ''}>Publish</button>`) : ''}
    </div>
    ${noRepo ? `<div class="ed-msg">${esc(session.message)}</div>` : ''}
    ${msg ? `<div class="ed-msg ${msg.err ? 'ed-err' : ''}">${esc(msg.text)}${msg.html ?? ''}</div>` : ''}
    ${log.length ? `<div class="ed-msg">${log.map(esc).join('<br>')}</div>` : ''}`;
}

async function refreshSession() {
  try { session = await backend.getSession(); } catch (e: any) { session = { repo: false, message: e.message }; }
  render();
}

const fail = (e: any) => {
  const link = e.status === 409 && session?.prUrl ? ` <a href="${esc(session.prUrl)}">Open PR</a>` : '';
  msg = { text: e.message, err: true, html: link };
  busy = '';
  confirmPublish = false;
  render();
};

async function saveDraft() {
  busy = 'save'; msg = null; render();
  try {
    const r = await backend.saveDraft();
    session = { ...session, repo: true, dirty: false, prUrl: r.prUrl, prNumber: r.prNumber };
    busy = '';
    msg = { text: `Saved to PR #${r.prNumber}.` };
    render();
  } catch (e) { fail(e); }
}

async function publish() {
  confirmPublish = false;
  busy = 'publish'; msg = null; render();
  try {
    if (session?.dirty) await backend.saveDraft();
    const r = await backend.publish();
    log = r.steps;
    busy = '';
    msg = { text: 'Published.' };
    render();
  } catch (e) { fail(e); }
}

// ---- block editing -----------------------------------------------------

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
  const close = () => { panel.remove(); el.hidden = false; editing = false; };
  const err = row.querySelector('[data-p=err]') as HTMLElement;
  const save = async () => {
    try { await onSave(field.value); } catch (e: any) {
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
      await backend.saveMeta({ field, value, version });
      reloadKeepingScroll();
    });
    return;
  }
  const i = els.findIndex((el) => el.contains(target));
  if (i < 0) return;
  e.preventDefault();
  const b = blocks[i];
  openPanel(els[i], b.text, 'block', async (text) => {
    await backend.saveBlock({ start: b.start, end: b.end, version, text });
    reloadKeepingScroll();
  });
}

function setOn(v: boolean) {
  on = v && !blocked;
  document.body.classList.toggle('ed-on', on);
  render();
}

async function init() {
  if (!article || !file) return;
  const saved = sessionStorage.getItem('ed-scroll');
  if (saved) { sessionStorage.removeItem('ed-scroll'); scrollTo(0, Number(saved)); }
  on = sessionStorage.getItem('ed-on') === '1';
  try {
    ({ blocks, version } = await backend.getBlocks());
    blocked = pair();
  } catch (e: any) { blocked = e.message; }
  document.body.classList.toggle('ed-on', on && !blocked);
  on = on && !blocked;
  render();
  refreshSession();

  bar.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).dataset.a;
    if (a === 'toggle') { setOn(!on); sessionStorage.setItem('ed-on', on ? '1' : '0'); }
    if (a === 'save') saveDraft();
    if (a === 'publish') { confirmPublish = true; render(); }
    if (a === 'no') { confirmPublish = false; render(); }
    if (a === 'yes') publish();
  });
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    const typing = t.matches('input, textarea');
    if (e.key === 'e' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) { setOn(!on); sessionStorage.setItem('ed-on', on ? '1' : '0'); }
    if (e.key === 's' && (e.metaKey || e.ctrlKey) && isDraft && !busy) { e.preventDefault(); saveDraft(); }
  });
}
init();

// Pure editor logic shared by the local dev server and the artifact build.
// No fs, no Buffer: only standard web APIs.
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown } from 'mdast-util-gfm';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const POST_FILE = /^src\/content\/posts\/([a-z0-9][a-z0-9-]*)\.md$/;

export async function hash(s) {
  const d = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

export const toBase64 = (s) => {
  let bin = '';
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
  return btoa(bin);
};
export const fromBase64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

export function splitPost(raw) {
  const m = raw.match(/^---\n[\s\S]*?\n---\n/);
  const head = m ? m[0] : '';
  return { head, body: raw.slice(head.length) };
}

const SKIP = new Set(['definition', 'footnoteDefinition', 'yaml']);

/** Top-level blocks that render something, with offsets into the body. */
export function listBlocks(body) {
  const tree = fromMarkdown(body, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
  return tree.children
    .filter((n) => !SKIP.has(n.type))
    .map((n) => ({
      type: n.type,
      depth: n.depth,
      start: n.position.start.offset,
      end: n.position.end.offset,
      text: body.slice(n.position.start.offset, n.position.end.offset),
    }));
}

const clean = (t) => String(t ?? '').replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, '');

function check({ start, end }, body) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > body.length) {
    throw new HttpError(400, 'Bad range.');
  }
}

/** Replace one block. Empty text deletes it and the blank lines after it. */
export function applyEdit(body, edit) {
  check(edit, body);
  const text = clean(edit.text);
  if (text === '') {
    let e = edit.end;
    while (body[e] === '\n') e += 1;
    return body.slice(0, edit.start) + body.slice(e);
  }
  return body.slice(0, edit.start) + text + body.slice(edit.end);
}

/** Apply several edits made against the same body, last first so offsets stay valid. */
export function applyEdits(body, edits) {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].end > sorted[i - 1].start) throw new HttpError(400, 'Edits overlap.');
  }
  return sorted.reduce((b, e) => applyEdit(b, e), body);
}

export function applyMeta(head, field, value) {
  if (!['title', 'description', 'tags'].includes(field)) throw new HttpError(400, 'Unknown field.');
  const v = field === 'tags' ? JSON.stringify([].concat(value).map(String)) : JSON.stringify(String(value));
  const re = new RegExp(`^${field}:.*$`, 'm');
  if (!re.test(head)) throw new HttpError(400, `Frontmatter has no ${field} line.`);
  return head.replace(re, () => `${field}: ${v}`);
}

export function titleOf(head) {
  const raw = head.match(/^title:\s*(.+)$/m)?.[1]?.trim() ?? '';
  try {
    return JSON.parse(raw);
  } catch {
    return raw.replace(/^['"]|['"]$/g, '');
  }
}

export function publishHead(head, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'Bad date.');
  const h = head.replace(/^draft:.*$/m, 'draft: false');
  return /^date:/m.test(h) ? h.replace(/^date:.*$/m, `date: ${date}`) : h;
}

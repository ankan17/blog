import { getCollection, type CollectionEntry } from 'astro:content';

export const site = {
  title: 'One Level Deeper',
  author: 'Ankan Poddar',
  description: "Systems I'm learning and building, and the fixes I found one level down.",
  home: 'https://ankanpoddar.dev/',
  earlier: 'https://ankanpoddar.dev/learncwithme/',
  url: 'https://blog.ankanpoddar.dev',
};

export type Post = CollectionEntry<'posts'>;

// Drafts are visible in `astro dev` and in preview builds (SHOW_DRAFTS=1),
// never in a production build.
export const showDrafts = import.meta.env.DEV || import.meta.env.SHOW_DRAFTS === '1';

export interface Entry {
  post: Post;
  /** 1-based entry number by publication order; null for drafts. */
  number: number | null;
}

/** All visible posts, newest first, with stable entry numbers. */
export async function getEntries(): Promise<Entry[]> {
  const all = await getCollection('posts', ({ data }) => showDrafts || !data.draft);
  const published = all
    .filter((p) => !p.data.draft)
    .sort((a, b) => a.data.date.valueOf() - b.data.date.valueOf() || a.id.localeCompare(b.id));
  const numbers = new Map(published.map((p, i) => [p.id, i + 1]));
  return all
    .map((post) => ({ post, number: numbers.get(post.id) ?? null }))
    .sort((a, b) => b.post.data.date.valueOf() - a.post.data.date.valueOf());
}

export const entryLabel = (n: number | null) => (n === null ? 'Draft' : `Entry ${n}`);

export const pad = (n: number | null) => (n === null ? '—' : String(n).padStart(3, '0'));

const longFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const longDate = (d: Date) => longFmt.format(d);
export const shortDate = (d: Date) => shortFmt.format(d);
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

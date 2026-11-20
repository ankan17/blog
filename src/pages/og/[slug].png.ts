import type { APIRoute, GetStaticPaths } from 'astro';
import { getEntries, entryLabel, longDate, site } from '../../lib/site';
import { renderCard } from '../../lib/og';

export const getStaticPaths = (async () => {
  const entries = await getEntries();
  return entries.map((entry) => ({ params: { slug: entry.post.id }, props: { entry } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => {
  const { post, number } = (props as { entry: Awaited<ReturnType<typeof getEntries>>[number] }).entry;
  return renderCard({
    title: post.data.title,
    description: post.data.description,
    left: `${site.title} · ${site.author}`,
    right: `${entryLabel(number)} · ${longDate(post.data.date)}`,
    url: `${new URL(site.url).host}/${post.id}/`,
  });
};

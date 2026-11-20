import rss from '@astrojs/rss';
import { getEntries, site } from '../lib/site';

export async function GET(context) {
  const entries = (await getEntries()).filter((e) => e.number !== null);
  return rss({
    title: site.title,
    description: site.description,
    site: context.site,
    items: entries.map(({ post }) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: `/${post.id}/`,
    })),
  });
}

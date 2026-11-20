import type { APIRoute } from 'astro';
import { site } from '../../lib/site';
import { renderCard } from '../../lib/og';

export const GET: APIRoute = () =>
  renderCard({
    title: site.title,
    description: site.description,
    left: site.author,
    right: 'Index',
    url: new URL(site.url).host,
  });

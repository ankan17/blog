import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import sitemap from '@astrojs/sitemap';
import { remarkReadingTime } from './src/plugins/remark-reading-time.mjs';
import { rehypeDocument } from './src/plugins/rehype-document.mjs';
import { rfcLight, rfcDark } from './src/plugins/shiki-themes.mjs';
import { editor } from './src/editor/integration.mjs';

export default defineConfig({
  site: 'https://blog.ankanpoddar.dev',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [sitemap(), editor()],
  markdown: {
    processor: unified({ remarkPlugins: [remarkReadingTime], rehypePlugins: [rehypeDocument] }),
    shikiConfig: {
      themes: { light: rfcLight, dark: rfcDark },
      defaultColor: false,
      wrap: false,
    },
  },
});

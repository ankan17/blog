// 1200x630 share card, light only, matching the site. satori lays it out, resvg rasterises it.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const require = createRequire(import.meta.url);
const font = (pkg: string, weight: 400 | 600 | 700) =>
  readFile(require.resolve(`@fontsource/${pkg}/files/${pkg}-latin-${weight}-normal.woff`));

const c = { ink: '#0e1a33', soft: '#56607a', line: '#d9dee8', garnet: '#a50044', blue: '#004d98' };

type Node = { type: string; props: Record<string, unknown> };
const h = (style: Record<string, unknown>, ...children: (Node | string)[]): Node => ({
  type: 'div',
  props: { style: { display: 'flex', ...style }, children },
});

export interface Card { title: string; description: string; left: string; right: string; url: string }

export async function renderCard(card: Card): Promise<Response> {
  const size = card.title.length > 60 ? 56 : 68;
  const tree = h(
    { width: 1200, height: 630, flexDirection: 'column', background: '#ffffff', color: c.ink, padding: '56px 80px', fontFamily: 'Source Serif 4' },
    h(
      { justifyContent: 'space-between', fontFamily: 'Atkinson Hyperlegible Mono', fontSize: 24, color: c.soft, paddingBottom: 20, borderBottom: `2px solid ${c.line}` },
      h({}, card.left),
      h({ color: c.garnet }, card.right),
    ),
    h({ marginTop: 40, height: 6, background: c.garnet }),
    h({ flex: 1, flexDirection: 'column', paddingTop: 36 },
      h({ fontSize: size, fontWeight: 700, lineHeight: 1.12, letterSpacing: -1 }, card.title),
      h({ marginTop: 24, fontSize: 32, lineHeight: 1.4, color: c.soft, maxWidth: 980 }, card.description),
    ),
    h({ fontFamily: 'Atkinson Hyperlegible Mono', fontSize: 24, color: c.blue }, card.url),
  );
  const svg = await satori(tree as never, {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Source Serif 4', data: await font('source-serif-4', 400), weight: 400, style: 'normal' },
      { name: 'Source Serif 4', data: await font('source-serif-4', 700), weight: 700, style: 'normal' },
      { name: 'Atkinson Hyperlegible Mono', data: await font('atkinson-hyperlegible-mono', 400), weight: 400, style: 'normal' },
    ],
  });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
}

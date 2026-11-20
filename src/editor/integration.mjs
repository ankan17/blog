// Dev-only: a Vite middleware under /__editor/*. Registered only for `astro dev`.
import * as lib from './lib.mjs';

function readJson(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (d) => { s += d; if (s.length > 2e6) reject(new lib.HttpError(413, 'Too large.')); });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch { reject(new lib.HttpError(400, 'Bad JSON.')); } });
  });
}

export function editor() {
  return {
    name: 'blog-editor',
    hooks: {
      'astro:config:setup': ({ command, updateConfig, injectScript }) => {
        if (command !== 'dev') return;
        injectScript('page', "import '/src/editor/client.ts';");
        updateConfig({
          vite: {
            plugins: [{
              name: 'blog-editor-middleware',
              configureServer(server) {
                server.middlewares.use('/__editor', async (req, res) => {
                  const send = (status, data) => {
                    res.statusCode = status;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(data));
                  };
                  try {
                    if (req.headers['x-editor'] !== '1') throw new lib.HttpError(403, 'Missing X-Editor header.');
                    const origin = req.headers.origin;
                    if (origin && new URL(origin).host !== req.headers.host) throw new lib.HttpError(403, 'Bad origin.');
                    const url = new URL(req.url, 'http://localhost');
                    const route = `${req.method} ${url.pathname}`;
                    const file = url.searchParams.get('file');
                    switch (route) {
                      case 'GET /blocks': return send(200, await lib.getBlocks(file));
                      case 'GET /session': return send(200, await lib.getSession(file));
                      case 'POST /block': return send(200, await lib.saveBlock(await readJson(req)));
                      case 'POST /meta': return send(200, await lib.saveMeta(await readJson(req)));
                      case 'POST /save-draft': return send(200, await lib.saveDraft((await readJson(req)).file));
                      case 'POST /publish': return send(200, await lib.publish((await readJson(req)).file));
                      default: throw new lib.HttpError(404, 'Unknown endpoint.');
                    }
                  } catch (e) {
                    send(e.status ?? 500, { error: e.message });
                  }
                });
              },
            }],
          },
        });
      },
    },
  };
}

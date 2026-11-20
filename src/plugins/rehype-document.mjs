// Sets a post like a standard:
// - h2/h3 get hanging section numbers (1., 1.1) and stable slugs from their
//   text, so the number never leaks into the URL fragment;
// - every code block becomes a numbered "Listing n" figure with a copy button
//   and a line-form kind (command, output or file);
// - every table becomes a numbered, keyboard-scrollable "Table n" region.
import GithubSlugger from 'github-slugger';

const COMMAND = new Set(['sh', 'bash', 'zsh', 'shell', 'console', 'fish', 'powershell', 'shellscript', 'shellsession']);
const OUTPUT = new Set(['text', 'txt', 'output', 'plaintext', 'log', 'plain']);

const el = (tagName, properties = {}, children = []) => ({ type: 'element', tagName, properties, children });
const txt = (value) => ({ type: 'text', value });

const textOf = (node) =>
  node.type === 'text' ? node.value : (node.children || []).map(textOf).join('');

function languageOf(pre) {
  const fromPre = pre.properties?.dataLanguage;
  if (fromPre) return String(fromPre);
  const code = pre.children?.find((c) => c.tagName === 'code');
  const cls = [].concat(code?.properties?.className || []).find((c) => String(c).startsWith('language-'));
  return cls ? String(cls).slice('language-'.length) : 'text';
}

function kindOf(lang) {
  if (COMMAND.has(lang)) return 'command';
  if (OUTPUT.has(lang)) return 'output';
  return 'file';
}

export function rehypeDocument() {
  return (tree) => {
    const slugger = new GithubSlugger();
    let h2 = 0;
    let h3 = 0;
    let listing = 0;
    let table = 0;

    const walk = (parent) => {
      const kids = parent.children || [];
      for (let i = 0; i < kids.length; i++) {
        const node = kids[i];
        if (node.type !== 'element') continue;

        if (node.tagName === 'h2' || node.tagName === 'h3') {
          const label = textOf(node).trim();
          node.properties.id = slugger.slug(label);
          let num;
          if (node.tagName === 'h2') {
            h2 += 1;
            h3 = 0;
            num = `${h2}.`;
          } else {
            h3 += 1;
            num = `${h2}.${h3}`;
          }
          node.children = [
            el('span', { className: ['secnum'] }, [txt(num)]),
            el('a', { href: `#${node.properties.id}`, className: ['heading-link'] }, node.children),
          ];
          continue;
        }

        if (node.tagName === 'pre') {
          listing += 1;
          const lang = languageOf(node);
          const id = `listing-${listing}`;
          node.properties.tabIndex = 0;
          node.properties.ariaLabelledBy = id;
          kids[i] = el('figure', { className: ['listing'], dataKind: kindOf(lang) }, [
            el('figcaption', { id }, [
              el('span', { className: ['num'] }, [txt(`Listing ${listing}`)]),
              el('span', { className: ['lang'] }, [txt(lang)]),
              el('button', { type: 'button', className: ['copy'], hidden: true, dataCopy: '' }, [txt('Copy')]),
            ]),
            node,
          ]);
          continue;
        }

        if (node.tagName === 'table') {
          table += 1;
          const id = `table-${table}`;
          kids[i] = el('figure', { className: ['table'] }, [
            el('figcaption', { id }, [el('span', { className: ['num'] }, [txt(`Table ${table}`)])]),
            el('div', { className: ['table-wrap'], tabIndex: 0, role: 'region', ariaLabelledBy: id }, [node]),
          ]);
          continue;
        }

        walk(node);
      }
    };

    walk(tree);
  };
}

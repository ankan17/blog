// npm run new -- "Post title"  →  src/content/posts/<slug>.md (a draft)
import { writeFileSync, existsSync } from 'node:fs';

const title = process.argv.slice(2).join(' ').trim();
if (!title) { console.error('Usage: npm run new -- "Post title"'); process.exit(1); }

const slug = title.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').split('-').slice(0, 6).join('-');
const file = `src/content/posts/${slug}.md`;
if (existsSync(file)) { console.error(`Refusing to overwrite ${file}`); process.exit(1); }

const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
writeFileSync(file, `---\ntitle: ${JSON.stringify(title)}\ndescription: ""\ndate: ${today}\ntags: []\ndraft: true\n---\n\n## \n`);
console.log(`Created ${file}\nDev URL: http://localhost:4321/${slug}/`);

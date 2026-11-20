---
version: 1
slug: "src-layouts-post-astro"
primary_target: "src/layouts/Post.astro"
related_targets: []
---

# Post page

**Scope:** the article page for every post (`src/layouts/Post.astro` and the pages that use it). It is the first surface; the home list, tag pages and 404 inherit its system.

**Mode:** Read.

**Reader and job:** an engineer who arrives cold from search or a share with one problem, and reads one long technical post (about 10 code blocks and 2 tables in the first one), often on a phone, copying commands as they go. A hiring manager reads the same page to judge clarity of thought.

**Author constraints:** clean, minimal, light by default (dark mode still ships). Portfolio blue `#004d98` and garnet `#a50044` are binding. It must not look like a template dev blog, a portfolio clone or anything loud.

**Chosen sketch:** `.impeccable/mocks/decision/model-pick.html`, the composition the build matches.

## Direction contract

THESIS: Every post is set like an engineering standard: a two-column header block, the title, then numbered sections whose numbers hang in the left margin, so "one level deeper" is literally 2 → 2.1 → 2.1.1. It refuses the category default: a centred Inter column, tag pills, a dark code slab and a hero.

OWN-WORLD: a white or near-white page, ink `#0e1a33`, soft `#56607a`, garnet `#a50044` for structure (hanging section numbers, a 3px rule over the title, entry number), Barcelona blue `#004d98` for everything actionable (links, copy button, focus). A plain reading serif for the body and headings, with a monospace face kept to the header block, section numbers, code and table figures. Code and tables sit on a pale cool well `#f1f3f8`, with no rounded corners or shadows. One hairline rule under the header block. Dark mode is a night version of the same document, not an inversion.

STORY: The reader sees immediately that this is a precise, dated document about their exact problem. They follow the numbered sections to the fix, copy commands safely, understand why the fix works one level down, and leave trusting the author, who never self-promotes inside the column.

FIRST VIEWPORT: Desktop: an 860px sheet, centred. On top, a monospace header block: left "One Level Deeper / Ankan Poddar / ankanpoddar.dev", right "Entry N / date / reading time · tags". Then a hairline, the garnet title rule, a centred serif title around 40px, and a small monospace line of links (Entries · Earlier writing · RSS). Then section 1 with "1." hanging 120px left of a 66ch serif column at about 19px. Phone: the header block stacks into two short lines, section numbers sit inline before headings, and code and tables scroll sideways inside their wells.

FORM: The RFC (Impeccable's pick, #1 on the grounded list); seed:9a55615338d75468.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

**Signature move:** the hanging section numbers. Headings are numbered automatically at build time (h2 = 1., h3 = 1.1), and listings and tables are numbered "Listing n" / "Table n" in the same monospace.

**Kept from the declined challengers (apply on top of the RFC):**
- Line form over hue: a command listing has a solid left rule, output a dashed one.
- Three type sizes for running content; rank comes from placement, not size.
- No callout boxes, badges, pills or icons in the column.
- A fixed measure: extra width goes to the margin.
- Light and dark are both fully designed states.

**Unresolved:**
- the dark-mode palette values
- the share-image design
- the home list layout

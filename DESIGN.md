---
name: One Level Deeper
description: A technical blog set like an engineering standard, with a white sheet, hanging section numbers and a reading serif.
colors:
  page: "#ffffff"
  ink: "#0e1a33"
  soft: "#56607a"
  line: "#d9dee8"
  well: "#f1f3f8"
  garnet: "#a50044"
  blue: "#004d98"
  selection-gold: "rgba(237, 187, 0, 0.45)"
  night-page: "#0b1220"
  night-ink: "#e7ebf3"
  night-soft: "#a3adc2"
  night-line: "#263149"
  night-well: "#131c2e"
  night-garnet: "#e8608f"
  night-blue: "#8db8f2"
typography:
  display:
    fontFamily: "Source Serif 4 Variable, Georgia, Times New Roman, serif"
    fontSize: "clamp(1.9rem, 4.5vw, 2.6rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Source Serif 4 Variable, Georgia, Times New Roman, serif"
    fontSize: "23px"
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: "Source Serif 4 Variable, Georgia, Times New Roman, serif"
    fontSize: "1em"
    fontWeight: 600
    lineHeight: 1.62
  body:
    fontFamily: "Source Serif 4 Variable, Georgia, Times New Roman, serif"
    fontSize: "19px"
    fontWeight: 400
    lineHeight: 1.62
  label:
    fontFamily: "Atkinson Hyperlegible Mono Variable, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.75
  code:
    fontFamily: "Atkinson Hyperlegible Mono Variable, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.65
rounded:
  none: "0px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "32px"
  xl: "48px"
  hang: "120px"
  sheet: "860px"
components:
  code-well:
    backgroundColor: "{colors.well}"
    textColor: "{colors.ink}"
    typography: "{typography.code}"
    rounded: "{rounded.none}"
    padding: "14px 18px"
  table-well:
    backgroundColor: "{colors.well}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "8px 12px"
  link-action:
    textColor: "{colors.blue}"
    typography: "{typography.body}"
  copy-button:
    textColor: "{colors.blue}"
    typography: "{typography.label}"
    height: "24px"
  section-number:
    textColor: "{colors.garnet}"
    typography: "{typography.label}"
    width: "100px"
---

# Design System: One Level Deeper

## Overview

**Creative North Star: "The RFC"**

Every post is a dated technical document. A two-column monospace header block opens the page. A centred serif title sits under a garnet rule. Numbered sections follow, with their numbers hanging in the left margin so that "one level deeper" is literally 1, then 1.1. The page is a white sheet with ink text. It has no hero, no pills and no card chrome, and the reading column carries only the post.

Density is calm and measured. The body is a reading serif held to a 66ch column, and extra width goes to the margin rather than to the text. A monospace face is reserved for metadata, section numbers, code and table figures, which keeps document apparatus separate from prose. Rank comes from placement and rule, not from a ladder of sizes. Light is the default and dark is a designed night version of the same document.

The build shows the world landing as planned. Two details differ from the direction notes. The shared shell is `src/layouts/Base.astro` plus `src/pages/[slug].astro`, and no `Post.astro` exists. Section and listing numbers are produced by build-time processing, not by CSS counters.

**Key Characteristics:**
- White sheet, 860px wide, centred, with a fixed 66ch measure.
- Garnet for structure (numbers, the title rule, drafts); blue for everything actionable.
- Zero radius and zero shadow everywhere.
- Hairline rules and left-edge lines carry meaning; colour does not.
- Fully designed light and dark states, switchable and remembered, with no JavaScript required to read.

## Colors

A restrained two-ink palette on a cool-tinted neutral set: navy ink, one structural garnet, one actionable blue.

### Primary
- **Barcelona Blue** (`blue`): every actionable element, meaning links, the copy button, the theme toggle, the command-listing left rule and the focus outline.

### Secondary
- **Garnet** (`garnet`): structure only, meaning hanging section numbers, "Listing n" and "Table n" figure numbers, the 3px rule over the title, the entry number and the draft flag.

### Neutral
- **Ink Navy** (`ink`): body text, headings, table header rule.
- **Soft Slate** (`soft`): header block, dek, captions, post footer, descriptions, the dashed output rule.
- **Hairline** (`line`): every 1px divider and the separator dots.
- **Cool Well** (`well`): code blocks, inline code and table backgrounds.
- **Page White** (`page`): the sheet.
- **Selection Gold** (`selection-gold`): text selection background only, never text on a light ground.
- **Night set** (`night-*`): the dark counterparts. Dark garnet and blue are lightened so they stay legible on `night-page`; selection gold drops to 0.35 alpha.

### Named Rules
**The Two-Voice Rule.** Garnet marks where you are in the document; blue marks what you can do. Never swap them and never use either as decoration.

**The Night Document Rule.** Dark mode re-tones the same tokens. It follows `prefers-color-scheme` unless a stored `data-theme` overrides it. It adds no new elements and no inverted layout.

## Typography

**Display and Body Font:** Source Serif 4 Variable (with Georgia, Times New Roman, serif)
**Label and Code Font:** Atkinson Hyperlegible Mono Variable (with ui-monospace, SF Mono, Menlo, monospace)

**Character:** a plain, warm reading serif for everything that is argued, and a legible monospace for everything that is cited, numbered or copied. Both are self-hosted. Numerals are tabular across the document.

### Hierarchy
- **Display** (700, clamp(1.9rem, 4.5vw, 2.6rem), 1.15, -0.015em): the post title only, centred, balanced wrap, under the garnet rule.
- **Headline** (600, 23px, 1.3): section headings (h2), with a hanging garnet number.
- **Title** (600, 1em, body line height): subsection headings (h3) and entry titles on the index. Rank is by weight, not size.
- **Body** (400, 18px on phones and 19px from 900px up, 1.62): running text, held to 66ch.
- **Label** (400, 13.5px, 1.75): header block, nav line, post meta, captions, entry numbers and dates, copy button.
- **Code** (400, 15px, 1.65): code blocks. Inline code is 0.85em and tables are 16px at 1.45.

### Named Rules
**The Three Sizes Rule.** Running content uses body, headline and code. Do not add intermediate sizes to create rank; use placement, weight or a rule.

**The Cited Is Mono Rule.** Anything the reader looks up, copies or counts (dates, numbers, commands, file names) is monospace. Argument is serif.

## Layout

A single centred sheet, `min(860px, 100% - 32px)`, with 32px top padding (48px from 900px up) and 72px bottom. Under it sits a 66ch reading column. From 900px up, `.prose` and the post footer shift right by 120px so a 100px-wide, right-aligned gutter holds the garnet section numbers, "Listing n" and "Table n" labels and index entry numbers. Below 900px the gutter collapses: numbers sit inline before headings and the header block stacks to short lines, with the "ankanpoddar.dev" link hidden in the header (it stays in the footer).

Rhythm uses 4, 8, 12, 16, 18, 36, 48 and 64px steps. Headings take generous space above (2.2em for h2, 1.8em for h3) and tight space below. Code and tables scroll sideways inside their wells and never reflow the page.

## Elevation & Depth

There is no elevation. Depth comes from one tonal step, the Cool Well, plus hairline rules. There are no shadows, no blur and no overlays. A 3px garnet rule over the title is the strongest mark on the page.

### Named Rules
**The Flat Sheet Rule.** Surfaces stay flat. Separate by hairline or by the well tone, never by shadow or border radius.

## Shapes

Square. Radius is 0 on code, tables and inline code. Form language is made of lines, not boxes: a hairline under the header block, a 3px garnet rule over the title, a short 4rem centred rule for `hr`, and a 3px left rule on listings that encodes type (solid blue for commands, dashed soft for output with no fill, double hairline for files).

## Components

### Links and text buttons
- **Style:** blue, underlined at 1px with 3px offset; hover thickens to 2px. Header and footer links drop to soft. The theme toggle and copy button are buttonless text links in blue.
- **Focus:** 2px blue outline, 2px offset, on every element.

### Header block
- Two columns of monospace label text in soft, with the site name in ink and a hairline beneath. The left column holds site identity and the right column is right-aligned entry metadata, with the entry label in garnet.

### Nav line
- Centred monospace links separated by hairline-coloured dots: Entries, Earlier writing, RSS and the theme toggle. The toggle is revealed only when JavaScript runs.

### Listings (code)
- Cool Well fill, 14px 18px padding, 15px mono, square, horizontally scrollable. A caption row above carries the garnet "Listing n" at left in the gutter, the language, and a blue Copy button. The left rule encodes kind (command, output, file).

### Tables
- Cool Well wrapper that scrolls sideways. Left-aligned, 8px 12px cells, an ink rule under the header and hairline row dividers, with the last row undivided.

### Index entries
- A hairline-ruled ordered list. Each row has a garnet padded number hanging in the gutter, a semibold linked title, a soft 16px description and a right-aligned mono date, or a garnet "Draft" flag.

### Post footer
- A hairline above, then published and updated dates in mono, tags as blue links, and previous and next entry links at the two edges.

## Do's and Don'ts

### Do:
- **Do** use garnet for structure and location, and blue for anything clickable.
- **Do** hang section, listing, table and entry numbers in the 100px left gutter at 900px and up.
- **Do** keep reading content to 66ch and give extra width to the margin.
- **Do** keep code and tables in Cool Well with square corners and sideways scroll.
- **Do** encode listing type by left-rule line style, not hue.
- **Do** define every colour as a root variable with a night counterpart.

### Don't:
- **Don't** add shadows, rounded corners, pills, badges, callout boxes or icons inside the reading column.
- **Don't** use gold as text on a light ground; it is for selection only.
- **Don't** introduce extra type sizes to signal rank.
- **Don't** set prose in the monospace face, or metadata and code in the serif.
- **Don't** invert the dark theme; re-tone the same tokens.

---
name: Colby Tech Share
description: Peer-written automation write-ups for Colby staff and faculty, presented as the playful corner of campus — a craft table of cream paper, cut-paper color, and stickers.
colors:
  ground: '#fff9ef'
  surface: '#fffdf8'
  ground-cool: '#fbf3e2'
  ink: '#262117'
  ink-2: '#5f5748'
  ink-3: '#6f6553'
  line: '#eadfc9'
  line-strong: '#6f6553'
  placeholder: '#7d7261'
  blue: '#366bcf'
  blue-deep: '#2d5cb8'
  sky: '#35b3fc'
  peri: '#6198ff'
  amber: '#ffb500'
  yellow: '#ffe022'
  orange: '#ff8b00'
  green: '#52d128'
  kelly: '#18c64e'
  lime: '#b8d92d'
  blue-tint: '#e8effc'
  amber-tint: '#fff3d1'
  green-tint: '#e7f9e3'
  orange-tint: '#ffedd9'
  pending-ink: '#7a5200'
  pending-line: '#ecd9a0'
  published-ink: '#1a6b2a'
  published-line: '#b7e5a4'
  rejected-ink: '#a84b00'
  rejected-line: '#f5cba3'
  danger: '#a32f24'
  danger-press: '#8a271e'
typography:
  display:
    fontFamily: 'Archivo, system-ui, sans-serif'
    fontWeight: 400
    fontSize: 'clamp(2.5rem, 4.5vw, 4rem)'
    lineHeight: 1.02
    letterSpacing: '-0.02em'
  headline:
    fontFamily: 'Archivo, system-ui, sans-serif'
    fontWeight: 400
    fontSize: 'clamp(1.75rem, 3.2vw, 2.5rem)'
    lineHeight: 1.08
    letterSpacing: '-0.02em'
  title:
    fontFamily: 'Archivo, system-ui, sans-serif'
    fontWeight: 500
    fontSize: '1.1875rem'
    lineHeight: 1.25
    letterSpacing: '-0.01em'
  body:
    fontFamily: 'Nunito, system-ui, sans-serif'
    fontWeight: 450
    fontSize: '1rem'
    lineHeight: 1.55
  label:
    fontFamily: 'Nunito, system-ui, sans-serif'
    fontWeight: 750
    fontSize: '0.8125rem'
  control:
    fontFamily: 'Nunito, system-ui, sans-serif'
    fontWeight: 800
    fontSize: '0.875rem'
  code:
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace"
    fontSize: '0.85rem'
    fontWeight: 400
  support:
    fontFamily: 'Nunito, system-ui, sans-serif'
    fontWeight: 450
    fontSize: '0.8125rem'
rounded:
  sm: '10px'
  md: '14px'
  lg: '20px'
  pill: '999px'
  card-frozen: '0'
spacing:
  gap: '1rem'
components:
  button-primary:
    backgroundColor: '{colors.blue}'
    textColor: '#ffffff'
    rounded: '{rounded.pill}'
    padding: '0.5rem 1.25rem'
  button-quiet:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.pill}'
    padding: '0.5rem 1.25rem'
  card-plate:
    backgroundColor: '#fbfafc'
    textColor: '#16181a'
    rounded: '{rounded.card-frozen}'
    padding: '1.5rem'
---

# Design System: Colby Tech Share

## Overview

**Creative North Star: "Recess" — the campus craft table.** The playful corner of campus where
colleagues show their makes: warm cream paper, cut-paper color from the DAI mark, pill buttons,
and stickers — flat color throughout, nothing glossy. Archivo speaks the headings (the register
of real work); rounded Nunito carries the body and UI.

One deliberate holdout: **the project card grid keeps its printed plate-section look** — square
near-white faces, hairline rules, mono registration layer. The playful world surrounds the shelf;
it does not repaint it (see The Frozen Shelf Rule).

**Key Characteristics:**

- Cream paper ground; the DAI triad (blue / amber / green families) does real jobs
- Archivo headings; Nunito body and UI; IBM Plex Mono only for code and the frozen cards
- Pill buttons and chips, rounded panels (10–20px), 3px hard-stop triad stripe under header and atop footer
- Scalloped yellow "reviewed" sticker on Explore; hand-drawn amber squiggle under the page name
- The card shelf stays printed and still inside the playful world

## Colors

Warm ink on cream paper; the DAI triad sampled from `dai_logo.png`.

### The triad (from the DAI mark)

- **Royal Blue** (`#366bcf`): links, primary buttons, focus, active nav, the logo's D. Pressed: `#2d5cb8` (also the text-blue on tints and cream — 6.0:1).
- **Amber** (`#ffb500`): the squiggle, warning notice borders, the logo's A. **Yellow** (`#ffe022`): the reviewed sticker, text selection. **Orange** (`#ff8b00`): accents, rejected status.
- **Green** (`#52d128`): the logo's I, published status, success. Kelly `#18c64e`, lime `#b8d92d` support.
- **Sky** `#35b3fc` / **Periwinkle** `#6198ff`: blue-family accents (favicon, illustration).
- **Tints:** blue `#e8effc`, amber `#fff3d1`, green `#e7f9e3`, orange `#ffedd9` — chip and status grounds.

### Paper and ink

- **Ground** (`#fff9ef`): the page. **Surface** (`#fffdf8`): inputs, panels, chips. **Ground, cool** (`#fbf3e2`): code blocks and quiet fills.
- **Ink** (`#262117`): primary text (15.3:1). **Ink, secondary** (`#5f5748`): support text (6.8:1). **Ink, tertiary** (`#6f6553`): small labels, dates, captions (5.5:1) — also the strong border color.
- **Line** (`#eadfc9`): soft separators. **Placeholder** (`#7d7261`): 4.6:1 on surface.
- **Danger** (`#a32f24`): semantic red for destructive actions only.

### Status vocabulary (pending | published | rejected)

Pending: amber tint `#fff3d1` + ink `#7a5200` + line `#ecd9a0`. Published: green tint `#e7f9e3` + ink `#1a6b2a` + line `#b7e5a4`. Rejected: orange tint `#ffedd9` + ink `#a84b00` + line `#f5cba3`. Danger keeps semantic red `#a32f24`.

### Named Rules

**The Color-Earns-Its-Job Rule.** Every triad color names a job: blue acts (links, buttons, focus), amber highlights (squiggle, warnings, the sticker), green confirms (published, success). No decorative color fields outside the header/footer stripe, the logo, and the sticker.

**The Three-Voices Rule.** Archivo speaks the headings — display 400, headline 400, card titles 500; Nunito carries body (450), labels, and controls (700–800); IBM Plex Mono is for code and the frozen cards' registration layer, and nothing else. The voices never swap.

## Typography

- **Heading Font:** Archivo (self-hosted variable woff2, `/static/fonts/archivo-latin-var.woff2`, 100–900) — display, headlines, and card titles.
- **Body/UI Font:** Nunito (self-hosted variable woff2, `/static/fonts/nunito-latin-var.woff2`, 200–1000) — body, labels, controls.
- **Code Font:** IBM Plex Mono 400/500 (self-hosted woff2).

**Character:** Archivo — an American institutional grotesk — sets every heading at weight 400–500, so the titles read as the register of real work; Nunito, rounded and friendly, carries everything below them at 450, with labels and controls at 700–800. Emphasis comes from weight and color, never from shouting caps.

### Hierarchy

- **Display** (Archivo 400, `clamp(2.5rem, 4.5vw, 4rem)`, 1.02): one per page, with the amber squiggle under it on Explore.
- **Headline** (Archivo 400, `clamp(1.75rem, 3.2vw, 2.5rem)`, 1.08): project page titles.
- **Title** (Archivo 500, `1.1875rem`, 1.25): card titles.
- **Body** (Nunito 450, `1rem`, 1.55): prose, max 44rem measure.
- **Label** (Nunito 750, `0.8125rem`): field labels, sentence case — friendly, not stamped.
- **Control** (Nunito 800, `0.875rem`): buttons, nav, result counts.
- **Code** (IBM Plex Mono 400, `0.85rem`): the write-up's own voice inside `.prose`.
- **Support** (Nunito 450, `0.8125rem`): hints and errors under fields.

## Layout

One container, max-width 76rem, 1.25rem side padding. Sticky cream header with the triad-dot
logo, pill nav (active = blue-tint pill), and the 3px triad stripe beneath. Explore reads
top-down: display head + squiggle + lede + sticker → filter rail (pill search input, sentence-case
labels, blue result count) → the frozen plate grid. Content below the fold follows the same
grammar: rounded panels and warm rules.

## Elevation & Depth

Flat cut-paper color by default. Depth appears as a response: primary buttons rise 1px with a
soft blue-tinted shadow on hover; the frozen cards keep their own lift. No colored halos at zero
offset; no glow.

## Shapes

Rounded everywhere except the frozen cards: pills (999px) for buttons, nav, chips-as-status, and
tabs; 14px for inputs and panels; 20px for large panels, empty states, and the receipt; 10px for
code blocks. **The Frozen Shelf Rule:** the project card grid keeps square corners, hairline
`#c9c7c4` rules, plate `#fbfafc` faces, and its mono registration layer (plate numbers, tags,
dates, crosshair) — pinned to literal values in `app.css` (section marked FROZEN). Do not retheme
it; the playful world surrounds the shelf.

## Components

### Buttons

- **Primary:** pill, blue ground, white 800 label; hovers to `#2d5cb8`, rises 1px with a soft blue shadow; press returns to rest.
- **Quiet:** pill, surface ground, `#6f6553` border; hovers to blue-tint ground with blue-deep text.
- **Danger:** pill, `#a32f24`, white label.
- **Focus:** 2px blue outline, 2px offset (inputs use a 4px blue-tint ring instead).

### Chips & statuses

- **Registration chips (frozen cards, project "Uses" row):** mono 0.6563rem uppercase, hairline border, square.
- **Status pills:** 0.75rem 800, pill, tinted ground + colored line + dark ink per the status table above.

### Inputs

- 14px radius, surface ground, 1.5px `#6f6553` border; blue caret; focus = blue border + 4px blue-tint ring; placeholder `#7d7261`.

### Navigation

- Sticky cream header, 3px triad stripe under. Logo: three overlapping sticker dots (blue/amber/green, 2px cream stroke) that tumble on hover; Nunito 800 wordmark. Links: pills; active = blue-tint ground, blue-deep text.
- Footer: 3px triad stripe atop, mini triad-dot cluster before the line.

### The Reviewed Sticker (signature)

A scalloped yellow SVG sticker, rotated 8°, at the Explore head's top right (hidden under 56rem):
ring text `REVIEWED · BY A COLLEAGUE ·` in blue-deep Nunito 800 around a blue check. It rocks
gently (7s ease-in-out) unless reduced motion is set. It certifies the shelf, not a plate. No
other page may add a sticker.

### The Squiggle

A hand-drawn amber underline (`stroke-linecap: round`, Q/T path) under the Explore display head.
Decoration with one home; do not repeat it per-section.

## Do's and Don'ts

### Do:

- **Do** give every triad color a job; blue acts, amber highlights, green confirms.
- **Do** keep panels, buttons, and inputs rounded — the world's whole point is fewer straight edges.
- **Do** set every heading in Archivo — the headings are the register of real work, and Nunito never climbs up there.
- **Do** self-host fonts from `/static/fonts` (CSP is `font-src 'self'`).
- **Do** leave the card shelf exactly as printed; it is the site's register of real work.

### Don't:

- **Don't** round, tint, or mono-swap anything inside the FROZEN card-grid section of `app.css`.
- **Don't** reach for gradients, glass, emoji-as-icons, or drop-shadowed everything.
- **Don't** set body text in mono or labels in small-caps-stamp style — the voices don't swap.
- **Don't** repeat the sticker or the squiggle on other pages; one shelf, one seal, one underline.
- **Don't** invent new triad colors; sample from `dai_logo.png` and derive tints instead.

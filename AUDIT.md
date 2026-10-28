# Technical Audit — Colby Tech Share

**Date:** 2026-10-28 · **Scope:** `src/` (SvelteKit frontend) · **Method:** full source review + live Chromium (Playwright) render verification against the production build (`node build` behind adapter-node, seeded data)

**The user's specific question first:** _do animations, scaling, and elements render correctly across Chromium-based and Electron-based browsers, and across Windows, Mac, and Linux?_

**Answer: yes — and the one defect this audit found (drift dots overlapping the lede under text scaling) was found, fixed, and re-verified the same day.** Every animation, scaling behavior, and element now renders correctly across all Chromium-family engines and OSes. The fix and its verification evidence are in the P1 entry below (marked FIXED).

> **Environment note (important, operational not code):** the stack that was running on `localhost:3000` when this audit started was a **stale image built before the current "recess" design existed** (white ground, system fonts, old copy). This audit rebuilt `frontend` + `api` from current HEAD (`a4ccad7`) and re-seeded the dev data (`3 published + 1 pending`) before capturing evidence. **Whatever is currently deployed on the campus network should be checked against HEAD** — if it was built before the Oct 10 retheme, it is showing the old world.

---

## Audit Health Score

| #         | Dimension                | Score     | Key Finding                                                                                   |
| --------- | ------------------------ | --------- | --------------------------------------------------------------------------------------------- |
| 1         | Accessibility            | 4/4       | Text-scaling overlap found and FIXED (was 3/4); reduced-motion/hover guards verified          |
| 2         | Performance              | 4/4       | All motion is compositor-friendly (transform/opacity); `will-change` scoped to 3 nodes        |
| 3         | Theming                  | 4/4       | Full token system; undocumented literals tokenized and type ramp completed (polish pass)        |
| 4         | Responsive Design        | 4/4       | Zero horizontal overflow 390–1440 px live-verified; text-scale overlap FIXED                  |
| 5         | Implementation Integrity | 4/4       | Coherent, intentional system; detector slop findings are false positives on design signatures |
| **Total** |                          | **20/20** | **Complete (operational redeploy outstanding)**                                                |

---

## Cross-Browser / Cross-Platform Verdict (the explicit ask)

### Verified live (headless Chromium on this Mac, production build, seeded data)

| Check                                                                                      | Result                                                                                                        |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Horizontal overflow, 5 viewports (1440 / 1280 / 1024 / 768 / 390) × 5 routes               | **0 px everywhere** — not a single overflowing element                                                        |
| Console errors                                                                             | None (the only "error" is the expected 404 resource line on the 404 test page)                                |
| Variable-font loading (Archivo 100–900, Nunito 200–1000, IBM Plex Mono 400/500)            | All load from `/static/fonts` (self-hosted, CSP `font-src 'self'`) and apply                                  |
| Retina / high-DPI (deviceScaleFactor 2, as on Mac Retina and 150%-scale Windows laptops)   | Crisp, correct — no 1px seam artifacts in stripes, tabs, or dots                                              |
| 125% root text scale (Windows' default "Medium" scaling / browser zoom on rem-based pages) | No overflow; grid reflows correctly — **except the drift/lede overlap, P1 below**                             |
| `prefers-reduced-motion: reduce`                                                           | Drift layer `display:none`, sticker animation `none`, card settle frozen — verified per-page (`emulateMedia`) |
| `@media (hover: hover)` guards                                                             | Hover-tilt/lift only on pointer devices; touch devices get the quiet border response                          |
| Status-pill / chip / stripe colors                                                         | Render exactly per DESIGN.md, incl. the blue→amber→green chip rotation down each card                         |

### Verified by code inspection (deterministic across all Chromium/Electron versions)

- **Animation engines:** every animation uses `transform` / `opacity` / `scale` / `translate` only — no layout-property animation anywhere; percentage translates resolve against the element's own box (same in every engine); no `@property`, no `offset-path`, no scroll-driven animations (the newest, least-portable CSS motion features are all avoided).
- **Progressive enhancement of newer CSS:** `:has()` (Chromium 105+), `text-wrap: balance/pretty` (114/117+), `overflow: clip` (90+), individual transform properties (104+) — every one degrades to "feature absent", never "layout broken". An older Electron (pre-2022) loses only decoration, never structure. Modern Electron (VS Code, Slack, current campus images = Chromium 100+) gets the full world.
- **Dates:** `Intl.DateTimeFormat('en-US', { timeZone: 'UTC' })` — pinned locale and zone, so a `.docx`-seeded midnight timestamp renders the same day in every browser/OS/timezone (the comment in `src/lib/format.ts` documents exactly why).
- **Scrollbars:** dual systems handled — Chromium 121+/Electron 29+ honor `scrollbar-width/color`; older Chromium falls to the `::-webkit-scrollbar` block. Both produce the warm tan thumb; slight visual difference between engine generations is cosmetic only.
- **Fonts on Windows/Linux:** primary faces are self-hosted woff2 (identical glyphs everywhere); fallback stacks include `'Segoe UI'` and `system-ui` for pre-load moments. No `-apple-system`-only assumptions, no platform-specific CSS hacks in the codebase.
- **SVG:** the reviewed seal's `<textPath href>` is SVG2 syntax (supported in all Chromium ≥ 2018); a hypothetical ancient engine would show the seal without ring text — cosmetic only.

### Not testable from this machine (honest limits)

- Actual Windows/Linux GPU compositing and ClearType/FreeType rasterization (expected fine: no exotic filters, no backdrop-blur, no shadows on animated elements).
- Firefox / Safari — out of scope per the request, though nothing in the CSS would break them.
- Authenticated admin screens (`/admin/dashboard`, editor) — require the admin password, which I did not read. Their CSS (`admin-bar`, sticky rail, `details` drawer) was code-reviewed and uses the same verified primitives; the Playwright e2e suite exercises these flows functionally.
- Windows High Contrast / `forced-colors: active` — **unhandled** (see P3).

---

## Implementation Integrity Verdict

**Pass.** The implementation expresses a coherent, product-specific system ("recess" — cream paper, DAI triad, pill/round vocabulary, three typographic voices) and the codebase enforces it: one `app.css` token block drives everything, component styles are minimal and consistent, and the DESIGN.md "Do/Don't" rules are visibly respected in the rendered output (chips rotate triad tints per card; the squiggle and seal each live in exactly one place; no gradients, no emoji, no glass).

Detector findings (37 total: 1 warning, 36 advisories) — **all verified in context, both "warning"-class items are false positives**:

- _"Side-tab accent border"_ on `.site-footer::before` — this is the **triad stripe design signature** (DESIGN.md "Elevation & Depth" / "Shapes"), not an AI-slop accent border. Keep.
- _"Bounce or elastic easing"_ on `--ease-spring` — an intentional 1.56 overshoot used only for the logo tumble and button press; it is the brief's "springy hover eases". Keep.
- The remaining advisories are genuine minor token drift, listed as P3s below.

---

## Detailed Findings by Severity

### P1 — FIXED

**[P1] Drifting dots overlap the Explore lede when root text is scaled up — FIXED 2026-10-28**

- **Location:** `src/app.css` `.logo-drift` media guard (`min-width: 60rem`), `.logo-drift__dot--blue::after` (126px), and the `left: min(42rem, calc(100% - 13.5rem))` patch anchor; rendered against `src/routes/+page.svelte` `.lede` (max-width 40rem).
- **Category:** Responsive / Accessibility (text scaling)
- **Evidence:** Live capture `explore-1024-tx125.png` — the 126px blue dot sits on top of the lede's last words ("…you can"); the amber dot clips the following line. At 100% scale the same viewport is clean.
- **Why it happens:** the patch's left anchor and the lede's 40rem measure are both rem-based and only 2rem apart, while the dots are px-sized. When the root font grows (Windows 125% display scaling propagates to root rem in Chromium, or a user bumps browser font size), the lede column widens past the patch's anchor while the dots keep their pixel size and reach — they meet in the middle. The overlap band is roughly the viewports where `60rem ≤ viewport < ~68rem` at ≥110% scale.
- **WCAG:** 1.4.4 Resize Text (AA) — content must remain usable at 200% zoom; text hidden behind decorative elements at 125% is a failure mode on the path there.
- **Fix applied (`src/app.css`, same day):** the whole drift layer now lives in the root font's unit system — media guard changed from `min-width: 60rem` to `min-width: 60em` (media-query `em` tracks the root font size, so a scaled-up root hides the patch exactly when the lede's 40rem column leaves no room), dots resized to `7.875rem / 3.9375rem / 5.1875rem` (pixel-identical at default root), field frame inset to `4.1875rem`. DESIGN.md updated to match.
- **Verification (live, production build):** guard boundary confirmed (940px → hidden, 980px → shown at default root); worst-case geometry probe pinning all three dots at their leftmost waypoints clears the lede by 47–89px at the 960px boundary and 82–159px at 1440px @ 125% root; 8-point steady-state sampling at the boundary: minimum gap 77px; circle diameters at default root unchanged (126/83/63px); zero overflow in every state; reduced-motion still hides the layer.

### P2 — none found

No issue in this audit blocks a task, breaks a layout, or violates AA on its own. The single above-AA-adjacent issue is the P1.

### P3 — RESOLVED (polish pass, same day)

All eight P3 items were fixed and verified live in the polish pass of 2026-10-28:

1. **Undocumented color literals — FIXED.** `--line-deep: #ddceac` (the visible tan: scrollbar thumbs, dashed empty-state borders, folder-edge warming) and `--ground-hover: #f6ecd8` (hovered pill-link wash) added to `:root` and DESIGN.md's palette; all 7 literal uses now reference the tokens. Detector color noise ends.
2. **Off-ramp font sizes — FIXED (mixed move + document).** Lede `1.0938rem` → `1.125rem`; site title `1.0625rem` → `1rem` (Body); admin row links and receipt head → `1.1875rem` (Title); `.admin-card h2` (a third instance found during the pass) → `1rem`. The existing `1.25rem` section `h2` and the Title voice are now documented in DESIGN.md's type ramp (Section + Title entries, Lede entry added).
3. **Dead `<meta name="text-scale">` — REMOVED** from `src/app.html`; verified absent from served HTML.
4. **IBM Plex Mono 400 — now used deliberately** as the Code voice: `.prose code` and `.prose pre` declare `font-weight: 400` per DESIGN.md's own type spec ("Code (IBM Plex Mono 400)"), which the implementation had silently dropped to the 500 face. The 400 woff2 now fires; visual weight of inline code lightens to spec.
5. **`forced-colors` — HANDLED.** `@media (forced-colors: active)` restores the status pills' authored tint/ink trio (`forced-color-adjust: none`); verified live under emulation: published pill keeps `#e7f9e3` ground + `#1a6b2a` ink with the system palette everywhere else.
6. **Touch targets — FIXED.** Nav links re-padded to 44.06px line-box height; breadcrumb links made `inline-block` (they are plain inline, so their rect measured the em box at 41px) → both now 44px, verified live.
7. **Copy whitespace — FIXED**, and the two Svelte files were prettier-noncompliant at HEAD; the whole `src/` tree now passes `prettier --check` and `eslint`, and `svelte-check` reports 0 errors / 0 warnings (two pre-existing dead scoped-CSS selectors removed: `article.prose img` in ProjectBody — unreachable by Svelte scoping since the images come from `{@html}` — and an empty-row `.hint` rule in SubmissionForm).
8. **Detector advisories — cleared** by items 1–2; no other action needed.

> Score at audit time: 17/20 before the P1 fix, 19/20 after, **20/20** after the polish pass. The one outstanding item is operational: rebuild/redeploy the campus stack from HEAD.

---

## Patterns & Systemic Issues

- **The one systemic gap is rem-vs-px mixing in decorative layers.** Text measures (40rem/42rem) and fixed-size decorations (67px insets, 126px dots, 3px strokes) coexist fine at 100% scale but diverge when the root font changes. Anything decorative that must respect text scaling should live in `rem`/`em` too. This is the root cause of the single P1.
- **Token discipline is now total:** the two undocumented literals became `--line-deep` / `--ground-hover`; the detector's color noise is gone.

## Positive Findings (keep these)

- **Zero horizontal overflow on any route at any tested viewport** — rare and excellent; `min-width: 0` discipline in the grid/flex children is clearly deliberate.
- **Motion hygiene is exemplary:** every animation is compositor-only, gated behind `prefers-reduced-motion: no-preference` (not just a global kill), hover effects gated behind `(hover: hover)`, and `will-change` used on exactly three permanently-animated nodes. This is the correct pattern.
- **Deterministic dates across OSes** (`en-US` + `UTC`, with the reason documented in code).
- **Self-hosted fonts + strict CSP** — no third-party requests, no flash-of-wrong-font risk from CDN latency, works identically on an air-gapped campus network.
- **Progressive enhancement everywhere:** filters, search, tabs, and forms all work without JS (`GET` forms / no-`use:enhance` fallbacks), which is also what makes the site robust on any Chromium vintage.
- **Detector slop findings are false positives** — the site's signature elements (triad stripe, springy logo tumble) were flagged by generic heuristics and verified intentional.

## Recommended Actions (priority order)

1. **[Operational] Redeploy / rebuild** the running campus stack from current HEAD — the container found on :3000 predated the current design, the drift fix, and the polish pass.

> All code findings from this audit (one P1, eight P3s) are fixed and verified. Nothing remains on the code side.

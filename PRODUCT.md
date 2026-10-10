# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary:** Colby faculty who are curious about AI, automation, and technology but not
  specialists — they want to see, in plain terms, what actually helps in their day-to-day work,
  from colleagues they know.
- **Also:** Colby staff and faculty who share their own automations by submitting a write-up
  (they are yesterday's readers, one step further along).
- **Admins:** a small set of college staff who review the queue and publish. No general user
  accounts exist.

Whether students are an audience at all is an open decision — nothing is built for or against
them yet.

## Product Purpose

A campus forum where Colby staff and faculty share the automations, tools, assignments, and tips
that save them time. A contributor writes up what they built in a provided Google Docs template
and uploads the `.docx`; the site parses it into a clean project page. Readers browse and search
everything published. Success: a faculty member finds something concrete enough to try this week —
and eventually recognizes they could write one up too.

## Positioning

Peer proof, not promotion: every write-up is by a colleague at Colby, reviewed before publication.
The mechanism no neighboring product can copy is the pipeline — submit a `.docx`, get a curated
project page — plus the zero-account campus simplicity: anyone on the network can browse or
submit.

## Operating Context

- Runs on the college campus network (deployed with Dokploy); no authentication for readers or
  submitters — safeguards are anti-bot only.
- Submissions flow through a Google Docs template → `.docx` upload → parse → admin review queue →
  publish.
- Admins edit Markdown, change status (`pending` / `published` / `rejected`), and delete; only
  admins can edit or delete after submission.
- Filtering and search happen in the browser over metadata (technology, title, department, author).

## Capabilities and Constraints

- No user accounts; the only credential is one shared admin password.
- Status vocabulary is exactly `pending` / `published` / `rejected`; only `published` is public.
- A project body is stored as sanitized Markdown parsed from the `.docx`; complex Word formatting
  degrades to plain Markdown, and embedded images are not extracted in the MVP.
- Slugs are immutable after creation unless an admin explicitly updates them.
- One `ADMIN_PASSWORD`; rate limiting and login throttling are per-IP and in-process (single web
  replica).
- Terminology: "write-up" (the document, person-facing), "project" (the published page), the three
  statuses; "approve" is retired — the verb is "publish".

## Brand Commitments

- **Name:** "Colby Tech Share" (as the page titles already read).
- **Deliberately independent** of Colby College's official visual identity — no institutional logo
  or typeface obligations. Brand color authority is now the **DAI mark's triad** (royal blue / amber
  / green families, sampled from `dai_logo.png`, adopted Oct 2026 in place of the earlier
  Colby-blue-only commitment): blue acts, amber highlights, green confirms. The project card grid wears the same world — warm
  paper faces, rounded corners, triad-tinted tool chips — while keeping its Archivo titles and
  mono chips/dates as the register of real work (rethemed Oct 2026 from the earlier
  printed-plate look).
- **Voice:** collegial, peer-to-peer, practical — colleagues sharing with colleagues, not
  institutional announcements.

## Evidence on Hand

- Four realistic seed write-ups (Faculty Directory form, Rubric Macro for lab reports, Watershed
  sensor exports, Scanned syllabi) with real Markdown bodies and the right colleague-to-colleague
  tone.
- The Google Docs submission template (`project-template.docx`) and an example project document
  (`example-project.docx`).
- A running implementation of every flow (explore, detail, submit, admin queue/editor) with
  placeholder styling only. No testimonials, press, usage numbers, or imagery exist; none may be
  fabricated.

## Product Principles

1. **Peer proof over promotion.** Everything shown was done by a colleague here, with the artifact
   to prove it.
2. **Try it this week.** A write-up wins when the reader can act on it immediately; concreteness
   beats completeness.
3. **Plain over expert.** No jargon prerequisite; the curious non-specialist is the bar.
4. **Sharing costs less than explaining twice.** The template-and-upload flow stays cheap enough
   that busy people actually do it.
5. **Reviewed, not gated.** Curation happens before publication; reading and submitting stay
   friction-free for everyone on campus.

## Accessibility & Inclusion

- **Standard: WCAG 2.1 AA** (confirmed: "follow WCAG standards"; AA is the working interpretation).
- The audience is the entire campus, including keyboard-only and screen-reader users; the submit
  and admin forms already work without JavaScript and must stay that way.
- Colby blue `#002169` on white passes contrast for text; combinations derived from it must be
  checked, not assumed.

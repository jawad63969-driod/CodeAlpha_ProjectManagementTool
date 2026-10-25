# UI Audit — TaskForge v2

**Audited:** 23 Sep 2026 · **Resolved:** 24 Sep 2026 · **Verdict at the time:** the interface
was the weakest part of this project and did not match the quality of the API beneath it.
Rebuild required, not patching.

> **Status: all 60 findings resolved.** Part 6 records what was done, what this audit got
> wrong, and three defects that only surfaced while fixing it. The audit is kept in full
> rather than deleted, because how the problems were found is more reusable than the fix.

The engineering below the surface is sound — 220 passing tests at the time of this audit, 253
today, a real permission model, a normalised schema. None of that is visible, because the interface undersells it. A reviewer
forms a judgement in four seconds from the board screenshot, and right now that judgement is
"student project".

This audit lists what is wrong, why it is wrong, and in what order to fix it.

---

## Part 1 — Root causes

Every visual defect in Part 2 traces back to one of these five. Fixing symptoms without
fixing these means they come back.

### R1 · There is no design system, only the claim of one

`apps/web/src/shared/styles/app.css` opens with this comment:

> *"One scale for colour, space and radius. Every component below uses these and nothing else,
> which is what keeps light and dark honest."*

That statement is false, and it is the single most damaging thing in the front end because it
stopped anyone from looking closer. Measured against the file:

| | Tokens defined | Distinct raw values actually used |
| --- | --- | --- |
| Colour | 24 | — (this part is genuinely fine) |
| Radius | 4 | — (fine) |
| **Spacing** | **0** | **16** (`gap`: every integer 1–14, plus 16, 18) |
| **Type** | **0** | **18** (`10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5, 16.5, 18, 21, 23, 34, 38`) |

Half-pixel font sizes — `12.5px`, `13.5px`, `14.5px` — are the tell. They are what happens when
sizes are nudged by eye until a specific screenshot looks balanced, with no scale to snap to.
Eighteen sizes across nine actual levels of hierarchy means the hierarchy reads as noise.

Colour and radius were tokenised; spacing and type — the two systems a user actually perceives
as "polish" — were not.

### R2 · No global element reset, so native browser chrome shows through

There is **no `button`, `select`, `input` or `textarea` reset** in 524 lines of CSS. The
consequences are visible on the most important screen in the app:

- **The task drawer renders raw OS form controls.** Ten `<select>` elements with the operating
  system's chevron, and `<input type="date">` showing `mm/dd/yyyy` with Chrome's native
  calendar button. Nothing else in the UI looks like this, because nothing else is unstyled.
  This alone reads as "unfinished" more loudly than any other single defect.
- **Six `<button>` elements carry no class at all** (`ProjectsPage.tsx:66`,
  `NotificationBell.tsx:63`, `TaskDrawer.tsx:182,224,249`, `AppShell.tsx:50`) and therefore
  inherit user-agent styling. The subtask row is the visible casualty: it renders with the
  UA's button background and border, so a subtask looks like a validation error.

  That row was already "fixed" once, by adding `border`, `background` and `text-align: left`
  to `.subtask-row` specifically. That is the wrong fix — it treats one symptom of a missing
  reset and leaves the other five buttons broken.

### R3 · The board's layout primitive is wrong

```css
.board  { display: flex; align-items: flex-start; overflow-x: auto; }
.column { width: 286px; flex: none; max-height: 100%; }
```

`align-items: flex-start` sizes every column to its own content. So Backlog ends at 470px while
In Progress runs to 890px, and the board bottom is a ragged staircase. **This is the first thing
anyone notices and the main reason the board does not look like Jira or Trello** — in every real
Kanban tool columns are equal height, full height, and scroll independently.

The fix is one line (`align-items: stretch`, plus giving `.column__body` its own `overflow-y`),
and it changes the board's character completely.

### R4 · The Activity rail silently destroys content

`.rail` is a flex sibling of `.board`, which has `overflow-x: auto`. Opening Activity shrinks
the board, and because the columns are fixed-width the rightmost column is **cut off mid-card**
— see `11-dark-board.png`, where "Hash refresh tokens before storing the…" is sliced through
and the avatars are halved. There is no backdrop, no reflow and no visual cue that content was
hidden. The panel simply eats the Done column.

### R5 · The app is not responsive

Two media queries, at 1000px and 660px, for an application with a horizontally-scrolling board,
a 620px drawer, a 312px rail and a six-column data table. Between those breakpoints nothing
adapts, and the **list view has no responsive handling at all** — six columns at fixed widths
will overflow the viewport on any laptop under about 1200px and on every phone.

---

## Part 2 — Screen by screen

### 2.1 Projects (`02-projects.png`)

| # | Finding | Severity |
| --- | --- | --- |
| P1 | Two cards occupy the top-left corner of a 1480px viewport; **roughly 70% of the screen is empty grey**. No page container, no max-width, no grid — cards are a left-aligned flow at fixed width. | High |
| P2 | The greeting sits hard left and the search/New-project controls hard right, ~600px apart, because the header has no constrained container. | High |
| P3 | Both projects read **"Mobile Revamp — seeded demo data."** The description repeats the title and then announces that the data is fake. | High |
| P4 | Both cards show exactly **25%** and both say **"Updated 19 minutes ago"**. Coincidence in the seed, but it reads as a hardcoded placeholder. | Medium |
| P5 | The progress bar has no label — 25% of what is never stated. | Medium |
| P6 | `Admin Access` and `Project Manager` chips sit in the same position in the same style, but one is an organisation role and the other a project role. Two different concepts, one visual treatment. | Medium |
| P7 | The 3px coloured strip on the card top edge reads as a rendering artifact rather than a deliberate accent. | Low |
| P8 | 👋 emoji in the heading of a tool positioned as enterprise software. | Low |

### 2.2 Board (`03-board.png`) — the screen that matters most

| # | Finding | Severity |
| --- | --- | --- |
| B1 | **Ragged column heights** (root cause R3). The defining flaw of the screen. | Critical |
| B2 | **Test pollution is visible in the screenshots committed to the repository**: three cards titled `Live card 1790082655320` — raw epoch timestamps left behind by the E2E run. These are in `docs/screenshots/` and therefore in the README a reviewer opens first. | Critical |
| B3 | The card metadata row is an unlabelled icon soup: a coloured square, a `✓`, `TFG-5`, sometimes `☑0/1`, sometimes `💬3`, sometimes a date chip. **Priority is encoded as a 6px coloured square with no legend anywhere in the product.** Nobody can decode this without being told. | High |
| B4 | The `✓` glyph appears before almost every card ID and carries no meaning — it is a task-type icon that happens to look like a completion checkmark, so cards that are not done look done. | High |
| B5 | Done cards use **strikethrough on the title**. That is a to-do-list idiom, not a Kanban one — the Done column already means done, and strikethrough just makes four cards hard to read. | High |
| B6 | Each column header carries a bare **`×` that deletes the column** — a destructive action one misclick away, with no overflow menu and no visual de-emphasis. | High |
| B7 | Labels render as loud pills *above* the title, so cards with a label are ~20px taller than cards without. Card heights jump arbitrarily down the column. | Medium |
| B8 | Unassigned cards show a grey **`?` avatar**, which reads as a failed image load. | Medium |
| B9 | `+ Add another column` is a bare text link floating in dead space in a visual style used nowhere else. | Medium |
| B10 | Filter bar: a text input, two `<select>`s, then ~900px of nothing. The select heights and radii do not match the input beside them (R2). | Medium |
| B11 | The Board/List segmented control (hard border box) sits directly beside the Activity button (pill) — two different button languages, 8px apart. | Medium |
| B12 | `your role: project manager` in lowercase here, `Project Manager` in title case on the projects page. | Low |
| B13 | The presence avatar stack is jammed against the segmented control with no separation (`08-list-view.png` shows this worst). | Low |

### 2.3 Task drawer (`06-task-drawer-subtasks.png`) — the worst screen

| # | Finding | Severity |
| --- | --- | --- |
| D1 | **Raw native `<select>` and `<input type="date">`** (R2). Six unstyled OS controls above the fold, including a date field reading `mm/dd/yyyy`. | Critical |
| D2 | **The subtask row renders as an unstyled `<button>`** — UA background and border — so the one subtask on screen looks like an error state. | Critical |
| D3 | Field values are lowercase raw enum strings: `high`, `epic`. The database representation is leaking into the interface. | High |
| D4 | No visual grouping. Eight fields, a label editor, a description box and four tabs stack with identical spacing and no sections or dividers, so nothing is more important than anything else. | High |
| D5 | Label chips are all displayed at once with the selected one filled and the rest grey. Nothing indicates they are toggles rather than decoration. | Medium |
| D6 | `Reported by Ayesha Siddiqui · Sep 22, 2026` is preceded by an orange square that is never explained. | Medium |
| D7 | The empty description textarea is ~110px tall with a visible resize grabber, dominating the panel while saying nothing. | Medium |
| D8 | The `0 of 1 done` progress bar is a 2px grey line on a white background — effectively invisible. | Medium |
| D9 | Delete (trash) and close (`×`) are adjacent, same size, same weight, in the top-right corner. | Medium |
| D10 | Below the subtask composer sits ~200px of empty panel. | Low |

### 2.4 List view (`08-list-view.png`)

| # | Finding | Severity |
| --- | --- | --- |
| L1 | No responsive handling for a six-column table (R5). | High |
| L2 | Status is rendered as **plain text** in a column whose header is styled like a sortable data-table header — so it neither reads as a status nor behaves as a sort. | High |
| L3 | The meaningless `✓` (B4) repeats on 12 of 16 rows, making the whole left edge look like a completion checklist. | High |
| L4 | `TFG-7` appears above `TFG-6`. The ordering is by board position and is correct, but with no sort indicator it reads as a bug. | Medium |
| L5 | The Due column mixes two treatments: `Due in 3d` as a blue chip, `Sep 27` as a grey chip, `—` as plain text. | Medium |
| L6 | Column headers are uppercase and letter-spaced — the universal signal for sortable — but nothing sorts. | Medium |
| L7 | No row hover state, no zebra striping, no row focus ring on a table whose rows are clickable. | Medium |

### 2.5 Dark mode (`11-dark-board.png`)

| # | Finding | Severity |
| --- | --- | --- |
| K1 | **The Activity rail clips the Done column** (R4). | Critical |
| K2 | `--surface: #161926` on `--surface-2: #1c2030` — a **contrast ratio of about 1.1:1**. Cards and the columns they sit in are all but indistinguishable; the board loses its structure entirely in dark mode. | Critical |
| K3 | Every activity entry reads **"Ayesha Siddiqui created"** or **"moved"** with **no object**. Created what? Moved it where? The audit trail is the feature being demonstrated and it communicates nothing. | Critical |
| K4 | Label pills keep their light-mode pastel backgrounds (`#fce7f3` pink, `#dbeafe` blue) on a near-black surface. | High |
| K5 | Fifteen consecutive rows reading `just now` / `16 minutes ago` / `17 minutes ago` with no date separators and no grouping. | Medium |
| K6 | Strikethrough Done titles (B5) drop below readable contrast on the dark surface. | Medium |

### 2.6 Viewer / read-only (`09-viewer-readonly.png`) — the RBAC demo

| # | Finding | Severity |
| --- | --- | --- |
| V1 | **"Read-only access — dragging is disabled." renders as naked unstyled text dropped into the board's flex row**, and is clipped by the viewport edge at 1480px — the sentence literally ends mid-word. This is the exact screen the demo video is built around. | Critical |
| V2 | With the `×` removed for viewers, the column header count chip also loses its background, so viewer column headers differ from editor ones in a way that looks accidental. | Low |

### 2.7 My Work (`12-my-work.png`)

| # | Finding | Severity |
| --- | --- | --- |
| M1 | Four rows, then ~800px of empty grey (same as P1). | High |
| M2 | Subtitle promises "most urgent first", but there is no grouping by project or date and no visible ordering logic. | Medium |
| M3 | Rows have no hover state or click affordance despite being clickable. | Medium |
| M4 | The notification badge `7` overlaps the bell glyph off-centre. | Low |

### 2.8 Login (`01-login.png`) — the best screen, still flawed

| # | Finding | Severity |
| --- | --- | --- |
| A1 | The marketing panel takes **51% of the viewport of an internal tool**, pushing the form into a 360px column surrounded by empty near-white. | Medium |
| A2 | The seeded-credentials box — monospace test emails and a plaintext password — is development scaffolding presented as part of the product UI. | Medium |
| A3 | "Use the demo account" is full-width with the same visual weight as "Sign in"; the secondary action competes with the primary. | Medium |
| A4 | The white card sits on `#f8fafc` and barely separates from its background. | Low |

### 2.9 Cross-cutting

| # | Finding | Severity |
| --- | --- | --- |
| X1 | **Emoji used as interface icons**: 🌙/☀️ for the theme toggle, 🔔 for notifications, ⚡ and 📗 for task types, 👋 in a heading. Emoji render differently on every OS and immediately signal an unfinished product. An icon set is needed. | High |
| X2 | No empty states anywhere. An empty column, an empty My Work and a project with no members all render as blank space. | High |
| X3 | No loading skeletons — panels pop in. | Medium |
| X4 | No `prefers-reduced-motion` handling on the drawer slide-in. | Low |

---

## Part 3 — Severity roll-up

| Severity | Count |
| --- | --- |
| Critical | 9 |
| High | 18 |
| Medium | 24 |
| Low | 9 |
| **Total** | **60** |

## Part 4 — Order of work

The first three items are hours of work and change the impression more than everything else
combined. Do them first regardless of what else gets done.

1. **Column heights** (R3/B1) — one CSS line plus per-column scrolling.
2. **Element reset** (R2/D1/D2) — style `button`, `select`, `input`, `textarea` once; the drawer
   stops looking unfinished and five other buttons are fixed at the same time.
3. **Re-seed and re-shoot the screenshots** (B2) — no `Live card 1790082…` anywhere near the
   README, and give the demo projects real descriptions.
4. Spacing and type scales (R1); replace all 34 raw values.
5. Card redesign: legible priority, drop the false `✓`, drop strikethrough, stable heights (B3–B7).
6. Read-only banner (V1) and the Activity rail overlay (R4/K1).
7. Dark-mode surface separation and label pills (K2/K4).
8. Activity entries must name their object (K3).
9. Icon set replacing emoji (X1); empty states (X2).
10. Responsive: a real breakpoint system, and a card layout for the list view under 1000px (R5).

---

## Part 5 — What this audit does not change

The API, the data model, the permission engine and the test suite are unaffected. This is a
presentation-layer problem, and every finding above lives in `apps/web/src`. No endpoint, no
table and no test needs to change — with one exception: the demo seed data (P3, B2) should be
rewritten so that the product demonstrates itself honestly.

---

# Part 6 — Resolution (24 Sep 2026)

All 60 findings were addressed in a single redesign pass. This section records what was done
and, more usefully, what the fixing turned up that the audit had missed.

## 6.1 The root causes

| | Before | After |
| --- | --- | --- |
| Spacing tokens | 0 defined, 16 raw values in use | 13-step 4px scale; no raw spacing value remains |
| Type tokens | 0 defined, 18 raw sizes including `10.5`, `12.5`, `13.5px` | 7-step scale, 11px → 26px |
| Element reset | none | `button`, `select`, `input`, `textarea`, `input[type=date]` |
| Board layout | `align-items: flex-start` — ragged columns | `stretch`, columns flex to fill, bodies scroll independently |
| Activity rail | flex sibling of a scrolling board; clipped the last column | fixed overlay below the topbar, with a scrim |
| Breakpoints | 2 | 4, plus a card layout for the list view under 900px |
| Emoji as icons | 12 | 0 — a 41-glyph inline SVG set in `currentColor` |

`tokens.css` no longer claims a scale it does not have. The comment that started this audit —
*"One scale for colour, space and radius. Every component below uses these and nothing else"* —
was false when written; it is now true, and the two scales it never mentioned exist as well.

## 6.2 What the audit got wrong

**V1 was misdiagnosed.** The audit called the read-only notice "naked unstyled text dropped
into the board's flex row". It was not a layout mistake at all: the markup already said
`className="sr-only"`, and **`.sr-only` was never defined in the stylesheet**. A utility class
that exists in the markup but not in the CSS fails silently and visibly — the text was
supposed to be for screen readers only and instead rendered into the layout, clipped by the
viewport edge. The fix was therefore two things, not one: define the utility, and give sighted
users a real banner, since they needed the information too.

## 6.3 What the fixing turned up

Three defects that no amount of looking at screenshots would have found:

1. **Per-project card numbering was broken.** `number: project === platform ? sequence : sequence`
   — the same branch twice. Every project shared one counter, so the second project's board
   opened at `MOB-14`. Visible in the original My Work screenshot as `MOB-15` next to `TFG-2`,
   and read as a numbering quirk rather than the bug it was.

2. **Back-dating a row breaks id ordering.** Seeded activity was given realistic timestamps so
   the feed would stop reading "just now" fifteen times. The feed sorts by id, and ids encode
   their *insertion* time, so the rows came back in random order, the day headings interleaved,
   and React threw a duplicate-key warning. Caught by the browser suite's "no uncaught
   JavaScript errors" assertion — the same assertion that caught the render loop in Sprint D.
   Fixed with `newIdAt`, so a back-dated row keeps the invariant the whole system rests on.

3. **A blanket responsive rule hid too much.** `.menu__trigger span { display: none }` at narrow
   widths was meant to hide the user's name. The avatar is a `span` too, so on a phone the
   account menu was a bare chevron.

## 6.4 Verification

*As at the close of this UI pass. Current totals: `02-PROJECT-PLAN.md` §16.*

| | |
| --- | --- |
| API suite | 194 passing |
| Browser suite | 26 passing, no uncaught errors in any of three sessions |
| `tsc --noEmit` | clean across all three workspaces |
| Production build | 471 kB JS / 148 kB gzip · 45 kB CSS / 8 kB gzip |
| Screenshots | re-captured by `npm run shots` from clean seed data |

## 6.5 What was not done

- **No visual regression testing.** Screenshots are captured but not diffed, so a future change
  can alter the interface without any test objecting. The browser suite asserts behaviour, not
  appearance.
- **No token lint.** The rule that component CSS may not contain raw spacing or font-size
  values is stated in `tokens.css` and currently held by review alone. It should be a build gate.
- **Contrast is not measured.** Dark-mode surfaces were separated by eye against the 1.1:1 ratio
  the old theme shipped. The pairs should be computed and asserted.

---

## 6.6 Follow-up — horizontal space (24 Sep 2026)

Reported after running the rebuilt UI on a desktop display: the dashboard, board and list all
sat in a narrow left-heavy band with dead space to the right. Correct, and the audit had
missed it entirely — every screenshot in Parts 1–5 was taken at 1440px, where the constraint
does not bite.

The lesson is about the method, not the CSS: **a layout audited at one viewport is not
audited.** `qa/widths.mjs` now measures the rightmost painted pixel as a share of the viewport
at four widths, so this is a number rather than an impression.

| Viewport | Projects | Board | List |
| --- | --- | --- | --- |
| 1366 | 98% → **97%** | 100% → **97%** | 99% → **97%** |
| 1600 | 92% → **97%** | 99% → **97%** | 99% → **97%** |
| 1920 | 85% → **98%** | 90% → **98%** | 99% → **98%** |
| 2560 | 76% → **89%** | 67% → **98%** | 99% → **89%** |

Three independent causes, none of which would have been fixed by adjusting the others:

1. **`--page-max: 1120px`** capped every page. On a 1920px display that is 288px of dead
   space either side of the content. Raised to 1760px, which fills a 1920px desktop completely
   and only engages on ultra-wide.
2. **`repeat(auto-fill, …)`** on the project grid. `auto-fill` keeps empty tracks, so two
   projects rendered into the leftmost two of five columns with three columns of nothing beside
   them — exactly the "left-heavy" symptom reported. `auto-fit` collapses empty tracks, so the
   cards that exist spread across the row. This single character is most of the visual
   difference on the dashboard.
3. **`max-width: 360px` on board columns.** Four columns could never exceed 1440px however
   wide the display, which is why the board was the worst offender at 2560 (67%). Raised to
   560px, so columns stretch; `--column-w` dropped to 256px so the default four-column
   workflow still fits a 1366px laptop without scrolling.

Side gutters now scale with the viewport (`clamp(20px, 3vw, 48px)`) instead of staying at a
fixed 24px, and the list table keeps the page measure so a title never ends up a screen away
from its own status.

The 89% figures at 2560 are the `--page-max` cap doing its job: content is centred rather than
stretched, because a My Work row with its title at one edge and its due date 2.3 metres away is
not an improvement. The board is deliberately exempt and runs full-bleed.

**Not fixed:** a dashboard with few projects still has vertical emptiness below the grid. That
is a content-quantity problem, not a layout one — the seed now carries four projects rather
than two, which is what the grid was designed for.

## 6.7 Follow-up — the dashboard's vertical space (24 Sep 2026)

Reported after §6.6: the projects page still had dead space, now mostly *below* the cards, and
the grid still looked confined. §6.6 had measured width only, so the vertical half was invisible
to the check that was supposed to catch exactly this.

Three changes, of which only the first is a grid property:

1. **The measure became opt-in.** `.page__inner` capped every page at 1760px, including a page
   made of tiles and cards that tolerates any width. The cap now lives on `--measure` (My Work,
   Members) and the dashboard runs full-bleed. Projects at 2560: 89% → **98%**.
2. **The grid stretches explicitly.** `align-items: stretch` and `justify-items: stretch` on
   `.project-grid`, so cards fill their track and share a row height rather than sitting at
   their content height.
3. **The page got something to put below the fold.** No grid property fixes four cards above
   six hundred empty pixels — the page needed content. It now opens with a four-tile stat row
   (projects, cards, done, assigned to you) and closes with the viewer's own assigned work,
   both from endpoints the app already had. That is a dashboard rather than a list of projects
   with a heading.

**One thing worth recording as a mistake corrected mid-fix.** The assigned work was first built
as a card grid. With one item, `auto-fit` stretched that single card across the full page —
which reads as a layout fault, where the same content as a single row reads as a list with one
thing in it. `auto-fit` is right for the project grid, where every item deserves equal share,
and wrong for a work list, where items are rows. The same property is correct in one place and
wrong in the other; "use auto-fit" is not the lesson.

The demo owner was also given a realistic amount of assigned work — with one open card the new
section was technically correct and told the reader nothing.

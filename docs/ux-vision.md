# WikiRealms UX Vision & Interface Plan

**Date**: 2026-09-04
**Branch**: `interface-overhaul`
**Supersedes**: `docs/ui-analysis.md` (audit of the first-pass UI; kept only for history)

---

## 0. The one sentence

**WikiRealms is a vehicle, not a document viewer.** You are always *somewhere*, looking at it
*some way*, with instruments in reach. Every layout argument resolves against that metaphor: if a
control changes the world, it belongs near the world; if it describes the world, it belongs in the
ledger; if it configures the app, it is summoned and then goes away.

---

## 1. What was wrong

Not a style problem. Three structural problems, each of which produced a long tail of symptoms.

### 1.1 Two shells fighting

`Taskbar.vue` owned search / back / forward / view / info / settings. `App.vue`'s
`.app__nav-controls` owned a second floating panel with Export / Import / Info / Settings / Share.
Below 1024px the taskbar's utilities were hidden and the same commands reappeared inside the `⋯`
panel through `.app__nav-extra`. Same actions, two components, two visual languages, two code paths.

Symptoms: "Hide HUD" (`H`) hid `.hud` panels but not the taskbar, so immersive mode wasn't
immersive. The empty state said "search for an article **above**" while on mobile the search was
behind an icon. Taskbar's 4-column grid only survived narrow widths because a `position: fixed`
child dropped out of grid flow.

### 1.2 Three view axes conflated

| Axis | Where it lived | Control |
|---|---|---|
| Renderer | `App.vue` `viewMode: '3d'\|'2d'` | Taskbar "2D/3D" button, keys `1`/`3` |
| World shape | `useUIState` `worldShape: 'sphere'\|'flat'` | buried in Settings |
| Marker layers | `useUIState` `showSections/Portals/Foliage` | Settings |

So "Flat" named two unrelated things — the 2D canvas and the flat 3D map — and the axis the user
most wants (Planet ⇄ Flat) was the one hidden deepest.

### 1.3 The two high-stakes moments were the least designed

Portal travel — the entire point of the app — was a centered confirm dialog with no destination
context, no spatial relationship to the tapped portal, no `role="dialog"`, no Esc, and an instant
world swap. The cold open was one italic gray sentence.

### 1.4 Tail of consequences

- **Emoji as the icon system** (🔎 📖 ⚙️ ⋯ ⌃ ⌄ 🪐 🗺️ 🏔️ 🌀 🌲): no `currentColor`, no shared
  optical grid, per-OS rendering. The single biggest "amateur" tell.
- **Details panel had one binary** (`isArticlePanelCollapsed`): title-bar or 60vh scroller. No peek,
  no drag, no snap points; a 50vh slab at ≤640px.
- **Hover was load-bearing**: `SectionTooltip` and subsection reveal are `pointermove`-driven, so
  touch devices lost an entire information layer with no tap equivalent.
- **Two competing keyboard owners**: `useUIState` bound bare `s`/`i`/`?`/Esc, `App.vue` bound
  `h`/arrows/`1`/`3`. Esc closed Info/Settings but not the portal modal or search. No focus trap, no
  focus return, and the Shortcuts tab was hand-maintained fiction.
- **Contrast defeated by design**: `.hud { opacity: var(--hud-opacity) }` dimmed *text*, and
  `panelOpacity` shipped at `0.9` — every panel below its designed contrast by default, user-
  adjustable down to 0.5.
- **Responsive system existed only as intent**: breakpoints declared as CSS custom properties
  (unusable in media queries) while real queries were 640/767/1023/1199 chosen per component;
  `--spacing-*` redefined at mobile so the scale didn't hold; dead `.taskbar` rules in the global
  sheet against a `scoped` component; `100vh` everywhere; no landscape-phone case at all.
- **Share was broken**: `useShare` produced `?article=Title` and nothing ever read a URL param.
  The URL was not app state, so browser Back exited the app instead of retracing.
- **Path tree was blocked on the data model**: `useTraversal` is two flat stacks and going back then
  taking a different portal *destroys* the branch (`forwardstack = []`). Breadcrumb clicks called
  `navigateTo`, which pushed a new entry and wiped forward history — clicking your own history
  rewrote it.

---

## 2. Decisions taken

| # | Decision | Consequence |
|---|---|---|
| D1 | **Planet ⇄ Flat is one axis, both rendered in 3D.** The 2D canvas survives only as a rendering-quality fallback (`Settings › Rendering: High / Auto / Low`, auto-selected when WebGL is unavailable). | `viewMode` ref is deleted; `WorldView.vue` and its tests stay, reachable only through quality. |
| D2 | **Visual direction: expedition instrument.** Thin precise strokes, hairline rules, tabular numerals, restrained accent glow, wide geometric display face. Cinzel (fantasy-Roman) is retired. | New type stack and token set; see §5. |
| D3 | **The Ledger stays metadata + section index.** Reading happens on Wikipedia. | No content adapter, no sanitizer, no image handling in this overhaul. `full` mode is summary + stats + section list + outbound links. |
| D4 | **Travel = anchored preview + camera dive.** Tap portal → preview card anchored at the marker; confirm → camera dives in, accent wash, new world rises, and the transition masks fetch + generate. | Camera choreography work in `WorldView3D`; `prefers-reduced-motion` degrades to a crossfade. |

Decided without asking (reversible, low cost):

- Launch screen: full-screen hero with curated realm chips, `Random realm`, `Resume last journey`.
- Ledger default on arrival: `peek` on phones, `open` on desktop, remembered after first visit.
- Icons: **Lucide**, hand-copied into an inline SVG sprite (ISC, no dependency, `currentColor`).
- "Hide HUD" hides *all* chrome including the top scrim, with one ghost affordance to restore.
- `panelOpacity` slider is removed in favour of `Chrome: solid / translucent / minimal`, which never
  touches text opacity.

---

## 3. The surface model

Every pixel belongs to exactly one surface, and each surface has one rule.

| Surface | Rule |
|---|---|
| **Stage** — the world | Full-bleed always. Never resized by chrome. Persistent chrome may never cover the center, and never more than ~35% of either axis. |
| **Instruments** — persistent | Edge-anchored, icon-first, capped count. *Identical grouping and meaning at every breakpoint* — position may move, semantics never. |
| **Summons** — invoked | Search, Field Guide, Settings, Journey, Trail, portal preview. One at a time, one dismissal grammar (Esc / outside-tap / swipe-down), all through one primitive. |

### Priority ladder — what earns permanence

1. The world.
2. Where am I / how do I get out — realm title + Trail entry; portals live *in* the world, not in chrome.
3. **How am I looking at it** — Planet ⇄ Flat. Persistent, one gesture, ~120px.
4. What is this place — the Ledger, at a depth the user chooses.
5. Everything else — summoned. Settings, Field Guide, Share, Snapshots, and search-after-launch.

---

## 4. Layout

### 4.1 Named regions

- **Top scrim** — 48px, gradient-to-transparent, no panel edge. Left: mark + realm title + stale
  badge + Trail chevron. Right: utility icons (search, journey, guide, settings).
- **Ledger** — bottom-left on desktop, bottom sheet on phones. States:
  `hidden → peek (title + 4 stat pills, ~64px) → open (~40vh) → full (85vh, scrolls)`.
  Drag-resizable on desktop; snap points with rubber-banding on touch.
- **Helm** — bottom-right, thumb zone. Planet ⇄ Flat segmented control, recenter, later zoom.
  Deliberately beside the world rather than among the utility icons, because it changes the world.
- **Trail** — left rail, reserved now, built later (§10). Collapsed to the chevron beside the realm
  title; the breadcrumb becomes the tree's collapsed projection.
- **Center** — never occupied by persistent chrome. Only the travel moment and the launch screen.

```
DESKTOP (lg/xl)                            PHONE PORTRAIT (xs/sm)
┌────────────────────────────────────┐     ┌──────────────────┐
│ ◈ Realm Title      [⌕][↗][?][⚙]   │     │ ◈ Realm Title  ⌕⋯│  48px scrim
│                                    │     │                  │
│ ⌄                                  │     │                  │
│ T          ( the world )           │     │   ( the world )  │
│ r                                  │     │                  │
│ a                                  │     │            ┌────┐│  Helm floats
│ i                                  │     │            │🜨 ▤││  above peek
│ l   ┌──────────────┐   ┌────────┐  │     ├────━━━━━━━─┴────┤│
│     │ LEDGER       │   │ PLANET │  │     │ Ledger — peek    ││  drag handle
│     │ peek/open/full│  │  FLAT  │  │     │ Title · 4 stats  ││  3 snap points
└─────┴──────────────┴───┴────────┴──┘     └──────────────────┘
```

### 4.2 Dismissal: minimize, never vanish

A **summon** (settings, the field guide, the command palette, the journey menu) is dismissed and
gone; the viewer asked for it and can ask again from the top scrim. A **persistent surface** — the
Ledger, later the Trail — must never fully disappear on dismissal, because nothing on screen would
then explain how to get it back, and its own affordance went with it.

So for non-modal surfaces, "close" means **collapse to a compact trigger that reopens it**: a
header-only bar carrying the realm name, sitting where the surface was. That bar is both the state
and the way out of it. On touch the bottom sheet's lowest snap already is this; the desktop `panel`
needs the same idea, which is the one state `Sheet` does not yet have.

The rule that follows: *every persistent surface is reachable from something visible at all times* —
its own collapsed bar, or a control in the top scrim if it is hidden outright. `Sheet` gains a
`collapsed` state alongside its presentations when the Ledger is built, since the collapsed content
is the Ledger's to design and guessing at it in the abstract would be inventing an API.

### 4.3 Breakpoint ladder

One ladder, used everywhere, written as literals in media queries (never as custom properties):

| Name | Query | Shape |
|---|---|---|
| `xs` | `< 480px` | phone portrait; Ledger = bottom sheet, utilities behind `⋯` |
| `sm` | `480–767px` | large phone; same as `xs` with more room |
| `md` | `768–1023px` | tablet portrait; Ledger is a wide bottom sheet, utilities inline |
| `lg` | `1024–1439px` | desktop; full region layout |
| `xl` | `≥ 1440px` | desktop; Ledger may sit at `open` by default, wider max |
| `short` | `(max-height: 520px)` | **landscape phone**: Ledger flips to a right-side drawer, Helm moves to left edge. Height is the scarce axis; a bottom sheet is fatal here. |

Density comes from a single `--density` multiplier, not from redefining the spacing scale, so
`--space-4` means the same relative step everywhere.

---

## 5. Design tokens

`src/ui/design/tokens.css` becomes the single source; `src/style.css` drops to reset + base element
styles, with the dead `.taskbar` rules and the mobile `--spacing-*` overrides removed.

- **Surfaces**: `--surface-void` (stage), `--surface-1` (panel), `--surface-2` (raised),
  `--surface-scrim`. Translucency is a *property of the chrome setting*, not baked into each panel.
- **Ink**: `--ink-1` (≥7:1), `--ink-2` (≥4.5:1), `--ink-3` (≥3:1, non-text or large text only).
  Documented with measured ratios, not aspirational comments.
- **Edges**: `--edge-hair` (the instrument hairline), `--edge-line`, `--edge-accent`.
- **Accent**: `--accent` (cyan, interactive), `--accent-warm` (reserved semantically for *your
  trail* — history, visited, breadcrumbs), `--danger`.
- **Type**: display **Space Grotesk** (wide geometric), readouts **IBM Plex Mono** with
  `font-variant-numeric: tabular-nums`. The tabular figures are what actually sell "instrument".
  Body is Space Grotesk too — the shell mockup dropped Inter entirely and held up at 11.5–12.5px,
  which keeps the stack to two faces. Revisit only if the Ledger ever carries long prose (D3).
- **Motion**: `--dur-1 120ms`, `--dur-2 220ms`, `--dur-3 400ms`, `--dur-travel 900ms`, plus easing
  tokens. All gated behind `prefers-reduced-motion`.
- **Z-index ladder** (replaces today's ad-hoc 1 / 100 / 1000 / 2000 / 2100):
  `stage 0 · instruments 10 · sheets 100 · overlays 200 · toast 300`.
- **Elevation**, **radius**, and **hit target** (`--hit: 44px`, `48px` on touch).

`index.html` also gains `viewport-fit=cover` and `theme-color`, and the chrome respects
`env(safe-area-inset-*)`. `100vh` → `100dvh` throughout.

---

## 6. Components to build

**Primitives** (`src/ui/design/`)

| Component | Responsibility |
|---|---|
| `<Sheet>` | The one primitive behind Ledger, command palette, settings, field guide, journey, portal preview, and later Trail. Owns desktop-popover vs bottom-sheet presentation, snap points, drag, focus trap, focus return, Esc, scroll lock, `inert` background. |
| `<Icon>` | Inline SVG sprite, `currentColor`, 24px grid. ~19 symbols: search, share, guide, settings, chevrons ×4, globe, map, layers, crosshair, eye/eye-off, route, download, upload, close, external, alert. |
| `<IconButton>`, `<SegmentedControl>`, `<Chip>`, `<StatPill>`, `<Toast>`, `<Scrim>` | Button/state grammar, hit targets, focus rings, `aria-live` for toasts. |

**Composables**

- `useOverlays()` — one owner: at most one summon open, topmost-first Esc, scroll lock, focus
  restore. Replaces the ad-hoc `showInfoHub` / `showSettings` / `isSearchOpen` / `portalConfirmation`
  booleans.
- `useKeymap()` — a single registry replacing the two competing `keydown` listeners. It *generates*
  the shortcut list and tooltip hints, so the Field Guide can never drift from reality again.
- `useViewport()` — breakpoint, orientation, and `dvh` where CSS can't reach.

**Features** (`src/ui/components/`)

`TopScrim` · `Ledger` · `Helm` · `Launch` · `CommandPalette` · `PortalPreview` · `Legend` ·
`FieldGuide` (was `InfoHub`) · `SettingsSheet` · `JourneyMenu`.

**Two pieces that don't exist today and should**

1. **Legend** — nobody can currently know what halos, glyphs, sea level, or foliage mean. Make it
   *diegetic*: press `L`, the world dims and labels itself in place. Far better than a modal, and it
   is the cheapest large win in the whole plan.
2. **Journey menu** — gathers Share / Export / Import / Reset, which are currently loose buttons
   floating over the terrain.

---

## 7. Domain separation

`docs/architecture.md` sets three decoupled domains — fetching / article graph, procedural
generation, UI / presentation — and the UI layer "should only consume state and emit actions". The
overhaul respects that, and fixes two places where the current code doesn't.

### 7.1 Two existing leaks this work corrects

- **Traversal is domain-1 logic living in the UI.** `src/ui/composables/useTraversal.js` holds the
  navigation semantics that `architecture.md` assigns to the article-graph domain. The model moves
  to `src/core/traversal/` as pure logic, with a thin Vue-reactive composable left in `ui/` that
  only adapts it. This is also what makes the visit graph testable without mounting anything.
- **URL and clipboard are platform concerns in the UI.** `useShare` mints URLs and talks to
  `navigator.share` directly. Both belong in `adapters/` (`urlState.js`, `shareTarget.js`),
  alongside the existing `snapshotStorage.js` — which is already layered correctly and is the model
  to copy.

### 7.2 The rule inside the UI layer

The UI domain gets a three-way internal split, in strict dependency order:

| Directory | Knows about | Must never import |
|---|---|---|
| `src/ui/design/` | nothing but itself — tokens, `<Sheet>`, `<Icon>`, buttons | `engine/`, `core/`, `adapters/` |
| `src/ui/rendering/` | world data, three.js; no Vue | `adapters/`, Vue, `ui/content/` |
| `src/ui/content/` | the engine it describes, and `ui/rendering/` for its colours | `adapters/`, `ui/components/` |
| `src/ui/components/` | all of the above, plus composables | — |

`ui/content/` holds copy, and it reads the engine's own numbers and the renderer's own colours
rather than restating either. That fixes the direction: content depends on rendering, never the
reverse. A renderer that wanted the words for a band it had just classified — the section
tooltip did — returns the band id and lets the component look them up.

A `<Sheet>` that knows what an article is has failed. A design primitive is reusable precisely
because it is ignorant.

### 7.3 Enforced, not just intended

A boundary test (`tests/architecture/layerBoundaries.test.js`) scans imports and fails on a
forbidden direction. It is ~40 lines and it makes the rule survive contact with future work,
including work done by an agent that hasn't read this document.

Two more places the boundary needs watching, both of which the plan already routes correctly:

- **Camera choreography** (the travel dive) is presentation — `ui/rendering/`, never the engine.
- **Legend content** describes the generation algorithm, so it must *import* the engine's exported
  thresholds rather than restate them. UI → engine is the allowed direction; a hardcoded biome
  cutoff in `ui/content/` would silently drift the moment the engine is tuned.

The same rule governs the Storybook fixture: stories seed a canned **article** and call the real
`buildWorld`, rather than shipping hand-authored terrain. A fixture that bypasses the engine is a
story that lies.

---

## 8. Implementation sequence

Thirteen commits in five clusters, sized so the branch can go up as one PR with a Netlify preview
and still be reviewed a piece at a time. **Every commit builds and leaves the test suite green** —
intermediate commits get checked out, and the preview builds whatever the branch head is.

Tests move with the code that breaks them; `App.test.js` assertions migrate from `.app__*` class
selectors to roles and accessible names, which doubles as proof of the accessibility work.

Subjects follow the repository's existing voice — a descriptive sentence, no conventional-commit
prefix — and bodies follow its house structure: prose on *why*, ALL-CAPS sections, and a closing
`VERIFICATION` block that states the test count and says plainly what has **not** been seen in a
browser.

### Cluster A — Foundation (3 commits, no visible change to the app)

1. **`UX vision: the plan of record, and a shell mockup at three breakpoints`** — this document,
   the superseded banner on `ui-analysis.md`, and `design/` holding the `.dc.html` artboards and
   `canvas.json`; the 2.5 MB seeded payload is gitignored and re-seeded on demand.
2. **`Storybook workbench: real widgets at all six breakpoints`** — delete the scaffold's
   `src/stories/` examples, add a mirrored `stories/` tree (matching the existing `tests/`
   convention rather than co-locating), viewport presets for the §4.3 ladder, a11y defaults, a
   global token decorator, `stories/fixtures/`, and a `netlify.toml` that restates the current
   defaults and adds `/storybook` to deploy previews only.
3. **`Design tokens: retire the cosmic glass for the instrument palette`** —
   `src/ui/design/tokens.css`, `style.css` reduced to reset + base, dead `.taskbar` rules and
   mobile spacing overrides deleted, `100dvh`, fonts, safe-area insets, z-index ladder, `<Icon>` +
   sprite. Ships with a token/contrast story and the §7.3 boundary test.

### Cluster B — Primitives (2 commits)

4. **`Sheet primitive: one owner for every summoned surface`** — `useOverlays`, `useKeymap`,
   `useViewport`, `<Sheet>`, `<Scrim>`, with stories for every presentation and unit tests for Esc
   ordering and focus return.
5. **`Field guide and settings move onto the Sheet primitive`** — content unchanged. The cheapest
   possible proof the primitive is right before three more surfaces depend on it.

### Cluster C — State model (1 commit, must precede the shell)

6. **`Traversal into core: a visit graph, and the URL as state`** — §7.1's two moves, the **visit
   graph** (`{nodes, edges, currentId}` with a linear-history projection), snapshot v2 + migration,
   `?realm=` read on mount, `pushState` on navigate, `popstate` → traversal. Fixes the broken Share
   link and gives the browser Back button its journey.

   *Moved earlier than originally planned, and the visit graph pulled out of "deferred":* the shell,
   the Trail chevron, and the Ledger all bind to this state, so doing it after them means writing
   that binding twice. The Trail **panel** stays deferred; only the model lands here.

### Cluster D — The shell (3 commits — split so each leaves a working app)

7. **`Helm: one view axis — Planet or Flat — and 2D becomes a fallback`** — `<Helm>`, apply **D1**
   (delete `viewMode`, Planet ⇄ Flat on the Helm, `Rendering: High / Auto / Low` in settings with
   `Low` → `WorldView`).
8. **`Ledger: peek, open, full — and a drawer when the screen is short`** — four states, drag, snap
   points, the `short` breakpoint, and touch parity for the hover layer (a section tap focuses its
   card *and* shows a transient in-world label).
9. **`Top scrim replaces the taskbar; the second shell is gone`** — `<TopScrim>`, remove
   `Taskbar.vue`, `.app__nav-controls`, `.app__nav-extra`; `App.vue` drops to composition and state.

### Cluster E — Experience (4 commits)

10. **`Launch screen: choose a first realm, then search steps aside`** — `<Launch>` hero with
    curated realms (`ui/content/realms.js`), Random, Resume; search inverts into `⌘K` / `/`.
11. **`Portal travel: preview at the marker, then dive into the world`** — `<PortalPreview>`
    anchored via the existing `ui/rendering/projection.js`; camera dive, accent wash, world rise,
    masking fetch and generate; reduced-motion crossfade; the centered modal goes.
12. **`Legend, journey menu, and settings in two tiers`** — diegetic `Legend` (`L`), `JourneyMenu`
    (Share / Export / Import / Reset), settings split into quick popover and full sheet,
    `panelOpacity` retired per §2.
13. **`Accessibility and responsive pass across the new shell`** — whatever the final sweep turns
    up: `aria-live` for world-generation status, focus order, contrast measurements, real-device
    touch, WebGL performance, and the share/history round trip. With §9 in place the rest ran
    continuously.

---

## 9. Storybook as the build harness

A static mockup can settle *what it should look like*; it cannot tell us whether a bottom sheet
actually drags, whether the Helm stays clear of the sheet at 390px, or whether the Ledger's `full`
state scrolls without trapping the canvas. Storybook gives us the real widgets at real breakpoints,
which is what this overhaul needs to be reviewable rather than guessed at.

**What it buys us**

- **The breakpoint ladder becomes executable.** The viewport addon carries §4.3 as presets — `xs`
  390×844, `sm` 480, `md` 768, `lg` 1024, `xl` 1440×900, `short` 844×390 — so every story is
  checkable at all six instead of by hand-resizing a browser.
- **States become enumerable.** `Ledger` gets `hidden / peek / open / full` × the ladder; `Sheet`
  gets its desktop-popover and bottom-sheet presentations side by side; `Icon` gets a sprite sheet;
  tokens get a swatch-and-ramp page that makes a contrast regression visible.
- **A full-shell story.** One story composes `TopScrim + Ledger + Helm + Trail` over a real
  `WorldView3D` with a fixture world, so the whole thing can be played with — terrain and all —
  without the app, the network, or a search round trip.
- **Accessibility becomes continuous.** The a11y addon runs axe per story, so contrast, labels and
  roles are checked as each component lands rather than in a Phase 6 sweep.
- **Interaction tests.** Play functions can drive keyboard traversal, Esc ordering, and sheet snap
  points — the parts of `useOverlays` and `useKeymap` that unit tests can't reach and that the
  current two-listener setup gets wrong.

**What it requires**

- `storybook` + `@storybook/vue3-vite`, reusing the existing Vite 6 config. **Version needs
  confirming**: this sandbox blocks `registry.npmjs.org`, so the install and the Vite-6 peer check
  have to run in your own shell.
- **A deterministic fixture world.** `stories/fixtures/` holds a canned article (the `App.test.js`
  article fixture is the obvious seed) plus its `buildWorld` output, so the stage renders the same
  terrain every time and no story touches the Wikipedia API. Tests get to share it.
- **A global decorator** that mounts `tokens.css`, the two webfonts, and the stage background — so
  nothing ever renders against white — plus a fixed-size frame decorator per viewport.
- **One architectural consequence worth taking on purpose**: a component that reaches for a
  composable internally (today's `SearchBar` calls `useArticleSearch` itself) can't be storied
  without mocking the network. Feature components should take data and callbacks as props, with the
  composables wired at the `App.vue` level. That is better structure regardless, and Storybook is
  what forces the discipline.

Not in scope: hosted visual-regression snapshots. `@storybook/test-runner` in CI is a cheap later
add if the story set proves worth guarding.

## 10. Deferred, but designed for now

- ~~**Visit graph + Trail panel.**~~ Done, and twice: the model landed first as a tree of arrivals,
  which real journeys disproved. A realm reached by two routes appeared twice, and a loop —
  `Spacetime → Template talk → Physics → Spacetime` — could not be held at all. It is now a graph of
  realms with a separate history for back and forward, which is the split a browser makes, and the
  panel draws that graph. Snapshot 3.0, reading 2.0 and 1.0.
- **Section reader** (D3 reversed). Ledger `full` is built as a scroll surface, so a `Read` tab can
  drop in without re-architecting if the product ever wants prose in-app.
- **Journey share links** encoding a whole path, not just a realm — a natural extension of Phase 3's
  URL work once the visit graph exists.

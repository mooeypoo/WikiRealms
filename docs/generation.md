# Generation

## Goal

The generation engine should turn Wikipedia article data into a deterministic world.

## Versioning

Generation must be versioned independently from Wikipedia content.

Recommended world key inputs:

- article identity
- article revision identity
- generation engine version

Example conceptual form:

```text
worldKey = hash(articleIdentity + revisionIdentity + engineVersion)
```

## Feature vector idea

The generator can use article features as input signals, for example.
Status reflects the current codebase (see `src/engine/generation/`), so
this list stays a living reference as ideas evolve — not every property
needs to be used now, but it's worth capturing so nothing is forgotten.

### Identity features
- title — *fetched, unused as a generation signal*
- canonical page ID — *fetched (`pageId`), used to derive `articleId`, not a terrain signal*
- language edition — *fetched, unused as a generation signal*
- namespace — *fetched, unused*

### Content features
- summary length — *fetched + extracted, currently unused in terrain shaping*
- number of sections — *fetched from the rendered article HTML; section hierarchy drives the terrain*
- number of images — *fetched, currently unused in terrain shaping*
- presence of a primary image — *not fetched*
- outbound link count — *fetched for article context; per-section links drive portal generation*
- revision date — *fetched (`latestRevisionTimestamp`), not a generation signal*
- revision size — *not fetched*

### Structural features
- section tree: title, depth, own text size, subtree total size — each
  top-level section becomes a mountain and subsections become sub-peaks.
  Subtree size controls a peak footprint; a section's own prose controls
  its height.
- per-section outbound links — drives per-section portal placement (one
  portal per distinct link *per section*, so the same target can appear
  in multiple sections without being deduplicated away)
- per-section citation count and sentence count — parsed from inline
  reference markers and from prose punctuation plus list/table structure
  (see `countSentences.js`). Together they give each section a single
  lushness scalar in [0, 1] (see `lushness.js`), built from a shrinkage
  estimator, the article's own citation rate, a log-ratio against it and a
  smooth absolute ceiling. The dominant top-level section's lushness
  selects one of six land bands — dunes, steppe, light vegetation,
  meadow, woodland, jungle — and modulates how densely that land is
  planted. The comparison is WITHIN the article: a section reads greener
  than its neighbours when it cites better than they do, and the absolute
  ceiling stops a barely-sourced article looking green anywhere. Dunes is
  reserved for a section that cites nothing at all.
- section anchors (`#Section_Title`) — retained for future click-to-jump
  interactions
- templates (infoboxes, navboxes, citation lists, etc.) — not represented
  yet. When fetching rendered HTML (not wikitext — see below), templates
  are already expanded into normal HTML, so no special parsing is needed
  to "recognize" a template; the open question is only about *excluding*
  known non-prose wrapper classes (`infobox`, `navbox`, `reflist`,
  `metadata`) from section size measurements so they don't skew results.
  Revisit if/when a template's content itself should represent something
  (e.g. an infobox implying a specific landmark type).

### Semantic features
- categories — *fetched (count only today); planned to become a curated
  keyword-taxonomy → global visual style/palette, not a spatial/biome signal*
- article type or topic class — *not fetched*
- concreteness vs abstractness — *not fetched*
- domain or subject area — *not fetched*

### Graph features
- link density — *fetched (as a raw count), used*
- neighborhood similarity — *not fetched, not feasible without extra API work*
- centrality / prominence — *not fetched*

### Popularity features
- pageviews — *not fetched today (needs a separate Wikimedia REST API,
  `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/...`);
  explicitly deferred — earmarked for a later "settlement/landmark density"
  feature, not core to the section/peak terrain model*
- relative attention or traffic signals — *not fetched*

### Fetching notes
- Prefer parsed/cached HTML (`action=parse&prop=text`) over raw wikitext
  for section/link extraction: headings already carry the anchor IDs we
  need, links are plain `<a href="/wiki/...">` tags (parseable via the
  standard `DOMParser` API, no new dependency), and templates are already
  expanded — no wikitext-specific parsing edge cases to handle.
- **Do not use `action=parse`** — it is explicitly flagged as a
  resource-intensive operation in MediaWiki's own API:Etiquette
  guidance (especially when parsing by `revid`). Use the MediaWiki core
  REST API instead: `GET /w/rest.php/v1/page/{title}/with_html` returns
  `id`, `key`, `title`, `latest: {id, timestamp}`, and `html` in a single
  cacheable GET request — verified live against a real article.
- Confirmed from a live response: sections are wrapped as
  `<section data-mw-section-id="N" id="Heading_Text">`, giving a
  ready-made anchor with no encoding logic needed; internal links are
  `<a rel="mw:WikiLink" href="./Title">` (unambiguous vs. external links
  and file links).
- Categories *do* appear in this HTML as
  `<link rel="mw:PageProp/Category" href="./Category:X">`, but include
  maintenance/tracking categories injected by citation templates (e.g.
  `CS1: long volume value`, `Articles with short description`) mixed in
  with real topical categories — naively collecting all of them would be
  noisy. Prefer keeping categories on the existing `action=query`
  request with `clshow=!hidden` (a cheap, non-parsing, database-level
  filter), rather than trying to filter them out of HTML.
- Net plan: 2 requests total, neither is `action=parse` — the existing
  `action=query` (identity, revision, filtered categories, images) plus
  one new REST `with_html` request (sections, per-section links, anchors).
- Confirmed via a real browser `fetch()` call that the REST endpoint
  allows cross-origin requests with no `origin=*` workaround needed
  (unlike the action API).

### Division of responsibility between the two requests

Two different link needs must **not** be conflated:

- **Whole-article outbound link count/list** (feeds `linkDensity` in the
  feature vector today) stays on `action=query&prop=links` — a plain,
  cheap database query, already implemented. No reason to duplicate this
  via HTML parsing.
- **Per-section link membership** (needed for "one portal per section
  it's relevant to") can only come from something that understands
  document structure. `action=query&prop=links` has no concept of
  sections at all. A `generator=links` param does not help either — a
  generator expands a link list into a new query target set (fetching
  metadata *about the linked pages*), it carries no positional
  information about where in the *source* article a link occurs. The
  only real source for this is walking the `with_html` DOM: since that
  HTML is already being fetched for section titles/anchors, extracting
  each `<section>`'s `<a rel="mw:WikiLink">` children is effectively
  free — no extra request beyond the two above.

| Data | Source | Why |
|---|---|---|
| Identity, revision, filtered categories, whole-article link/image counts | `action=query` (existing) | Cheap, already implemented, no parsing needed |
| Section titles, count, anchors, per-section links | REST `with_html` (new) | Only source with section boundaries at all |

## Output mapping ideas

Feature signals currently influence:

- island size
- terrain roughness
- water ratio
- biome distribution: per-section lushness drives the six land bands;
  elevation still determines ocean, beach, mountain, and snow
- portal count and placement

## Section identity in generation output

Every peak (top-level section or subsection) knows the peaks-array index
of its owning top-level section via `peak.sectionIndex`. Top-level peaks
own themselves; subsection peaks inherit their parent's index.

The generated terrain grid additionally exposes a per-cell
`sectionOwnershipMap` (`Int32Array`, length `width * height`): each cell
stores the peaks-array index of the top-level section whose continental
Gaussian was largest at that cell — or `-1` if no section reached the
cell at all. This is what makes the biome derivation deterministic and
what lets renderers do O(1) "which section does this cell / marker /
raycast hit belong to" lookups without any distance math.

Portals are stamped with the same `sectionIndex` at generation time
(matching their top-level ancestor's peak, or `-1` for lead-section
portals), so a UI can link a portal to its owning range without any
title-string matching.

This is a data-side convention only; how (or whether) a renderer chooses
to react to the ownership map — hover halos, region highlights, biome
labels — is a UI concern that stays out of the generation engine.

## Portal Placement

A portal's region resolves most-specific-first: the section's own peak
(matched by heading anchor, so a subsection that survived peak folding
gets its own footprint), then its top-level ancestor's peak, then the
"Miscellaneous" aggregate when that ancestor was folded away. Lead-section
links have no mountain of their own and are placed in a region at the
middle of the map.

Within a region, portals are spread by sunflower spacing — the i-th of n
sits at radius proportional to sqrt((i + 1/2)/n) at successive golden
angles, with a seeded rotation and small jitter. Spacing by area rather
than by radius is what keeps a link-heavy section from piling most of its
portals near its own summit; the golden angle keeps a growing set from
falling into spokes or rings. Every portal lands between
`minFootprintFraction` and `maxFootprintFraction` of the region radius, so
it clears the section's summit marker and still reads as inside that
section's land.

The `maxPortals` cap is applied to a round-robin over sections rather than
to document order, so every linked section places its first portal before
any section places its second. In document order a link-heavy opening
section would otherwise swallow the entire budget.

Citation counts remain on peaks (own and subtree totals), alongside the
sentence counts and the derived `lushness` scalar, but are no longer
rendered as their own marker: they read through the land's lushness band
and its foliage density instead.

## Biome-Aware Foliage

The 3D renderer sparsely samples the generated biome grid using a stable
coordinate hash and adds lightweight point-sprite foliage above eligible
land cells. Desert cells receive scrub, light vegetation and meadow cells
receive grass, woodland cells receive conifers, and jungle cells receive
broad canopy. Ocean, beach, mountain, and snow cells deliberately receive
no foliage. These are presentation-only details: they consume the
deterministic terrain data and do not alter world generation.

## Generation pipeline

1. Normalize article identity
2. Fetch metadata and content features
3. Derive deterministic seed material
4. Generate terrain and biome structure
5. Place section-aware portals
6. Assemble final world model

## Design notes

- Prefer pure functions where possible
- Keep random generation deterministic from the seed
- Make it easy to swap or version individual generation rules
- Preserve enough metadata to explain how a world was produced

## Open questions

- Which article features should matter most?
- Should generation rely more on identity, content, or graph context?
- How much of the generation should be semantic vs purely structural?
- Should portals be generated for every link or only a curated subset?

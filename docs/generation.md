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
- summary length — *fetched + extracted, computed but currently unused in terrain shaping*
- number of sections — *not yet fetched; planned for section/peak-driven terrain (see brainstorm notes below)*
- number of images — *fetched, used (roughness/persistence modifier)*
- presence of a primary image — *not fetched*
- outbound link count — *fetched, used (terrain scale modifier + portal generation)*
- revision date — *fetched (`latestRevisionTimestamp`), not a generation signal*
- revision size — *not fetched*

### Structural features (planned, not yet implemented)
- section tree: title, depth, own text size, subtree total size — drives the
  section/peak terrain model being brainstormed (each top-level section
  becomes a mountain, subsections become sub-peaks, sized by subtree total)
- per-section outbound links — drives per-section portal placement (one
  portal per distinct link *per section*, so the same target can appear
  in multiple sections without being deduplicated away)
- section anchors (`#Section_Title`) — enables "click a peak, jump to
  that section" in the UI
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

Feature signals may influence:

- island size
- terrain roughness
- water ratio
- biome distribution
- landmark density
- portal count and placement
- color palette
- ambient visual style

## Generation pipeline

1. Normalize article identity
2. Fetch metadata and content features
3. Derive deterministic seed material
4. Generate terrain and biome structure
5. Place portals and landmarks
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

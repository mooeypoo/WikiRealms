# Roadmap

## Phase 1: Prototype

- Choose a single Wikipedia article as input
- Fetch summary, links, categories, and revision data
- Generate a deterministic island/world from article features
- Render a simple world view in the browser
- Allow clicking portals to move to linked articles
- Preserve back/forward navigation history

## Phase 2: World richness

- Add stronger semantic feature mapping
- Improve terrain and biome variation
- Use image count, pageviews, and section structure more meaningfully
- Add landmark and portal placement rules
- Cache nearby worlds for smoother navigation

## Phase 3: Session portability

- Add export/import of session snapshots
- Store snapshots in `localStorage`
- Allow shareable JSON world sessions

## Phase 4: Visual and UX improvements

- Improve the map and terrain visuals
- Add a minimap or breadcrumb trail
- Add article info panels and contextual metadata
- Explore better portal visualization

## Phase 5: Scaling decisions

- Reevaluate whether serverless is sufficient
- Consider a small backend service if caching or state needs grow
- Revisit persistence only if the experience demands it

## Open questions

- What is the best minimal world representation for the first playable version?
- How should article features be weighted into terrain generation?
- Which state belongs in memory, which belongs in snapshots, and which can be regenerated?
- What is the right threshold for introducing a backend service?

## Back burner

### Article evolution / revision timeline

Opt-in “watch this realm evolve” scrub across monthly Wikipedia revisions
(generate + rebuild one live world at a time; do **not** keep N concurrent
3D scenes). Feasible as sequential scrubbing with historical HTML fetch;
parked after stewardship field tasks + trail postcards. Revisit when sharing
and contribution CTAs have room to breathe — needs adapter work
(`revision/{id}/with_html`, date→revid) and mobile quality caps.

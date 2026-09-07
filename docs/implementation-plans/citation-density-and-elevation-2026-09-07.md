# Citation Density and Elevation: Implementation Plan

**Date:** 2026-09-07
**Version:** 1.0
**Based on:** Brainstorming session on GitHub issue #2 (citation density depiction)
**Supersedes:** Phase 1 of `terrain-improvements-phase1-2-2026-09-01.md` (the
citation-driven lushness system this plan replaces)

## Purpose

Issue #2 asks for three things: a more stable citation-density calculation, a
clearer visual separation between the mid and high lushness bands, and possibly
more bands. Measuring the current system first turned up a fourth, larger
problem that subsumes the other three — and a related one in the elevation
rules, where rock and snow currently delete the citation signal outright.

This plan replaces the band-threshold system with a single continuous lushness
scalar, makes elevation a second independent axis instead of a biome
replacement, and rebuilds the foliage layer so the top bands differ by form and
layering rather than by hue.

## Findings: what the current system actually does

Measured against the real parser and the real engine, on a five-section /
five-subsection fixture, sweeping the article's citations-per-sentence rate.
Figures are shares of land.

| rate | desert | light | meadow | woodland | jungle | rock+snow | foliage sprites |
|---|---|---|---|---|---|---|---|
| 0.00 | 76% | 0 | 0 | 0 | 0 | 24% | 100 |
| 0.05 | 52% | 24% | 0 | 0 | 0 | 24% | 210 |
| 0.15 | 13% | 46% | 16% | 0 | 0 | 24% | 353 |
| 0.25 | 13% | 39% | 24% | 0 | 0 | 24% | 396 |
| 0.40 | 13% | **0** | 39% | 24% | 0 | 24% | 524 |
| 0.60 | 0 | 13% | **0** | 46% | 16% | 24% | 652 |
| 0.90 | 0 | 13% | **0** | 20% | 42% | 24% | 718 |

1. **Never more than three of five bands render at once, usually two.** The
   issue's "dense and lush are not clearly separated" is downstream of this:
   they are almost never both on screen.
2. **Bands drop out non-adjacently.** At rate 0.60 meadow is 0% while light-veg
   and woodland flank it. The progression reads as arbitrary.
3. **The whole map slides with the article's absolute rate.** The fixture's
   relative structure is identical in every row, yet it reads all-desert at the
   top and all-jungle at the bottom. The map answers "is this article well
   cited" and loses "which section here is better cited" — the question a
   reader has while standing in one world.
4. **Foliage is 100–718 sprites for a whole planet** of 28,189 land cells.
   "Lush" is 2.5% ground coverage.

### Five independent causes of instability

1. **The sentence counter loses the last sentence of every block element.**
   `measureOwnText` uses `textContent`, so `"world."` butts against `"Next"`
   with no whitespace, and the regex in `parseSectionTree.js` requires
   `\s+[A-Z]`. Measured: `<p>Hello world.</p><p>Next thing.</p>` yields
   `sentenceCount = 1`; the same text in one `<p>` yields 2. A five-paragraph
   section loses roughly five sentences, and the inflation scales with
   paragraph structure rather than with citations.
2. **List-heavy sections count zero sentences.** Measured:
   `<p>Intro follows.</p><ul><li>First item</li><li>Second item</li></ul>`
   yields `sentenceCount = 0`. Filmographies, discographies, timelines and
   results tables go to 0/0, then cps 0, then desert, however well cited.
3. **No small-sample guard.** Measured: a one-sentence section with one
   citation gets cps 1.00 and classifies as jungle. The most extreme biome on
   the map comes from the least evidence, and such flukes are the only things
   that legitimately reach the top bands.
4. **The "article average" is an unweighted mean of ratios over all peaks,
   including subsections** (`sectionTerrain.js`). Subtree ratios are
   double-counted through nesting. Measured on one fixture: 0.401 against a
   true ratio-of-totals of 0.233 — 72% high, dragged up by two tiny outliers.
5. **That average is used only as a binary switch** at `m < 0.15`
   (`terrain.js`), choosing between two threshold sets. Two near-identical
   articles at 0.149 and 0.151 get visibly different worlds. Past the switch,
   bands are absolute cps thresholds, so "compared to the entire article" —
   what the issue asks for — is essentially absent from classification.

### Three sources of truth

`terrain.js` classifies on absolute thresholds (0.1/0.25/0.5/0.75),
`foliage.js` on ratio-to-average, and `sectionTooltip.js` on a third hardcoded
set (0.05/0.15/0.3/0.5). At cps 0.55 the tooltip says "lush" while the ground
is woodland. `legend.js` then renders those thresholds as percentages of the
article's citation density, which is not what any of them are — and that
module's own header notes that a legend which lies is worse than none.

### Why the top two bands look identical

- **One grid cell is one world unit** in both projections (`projection.js`'s
  stated contract). Tree sprites are `size: 3.8` and canopy `4.8` — 3.8 to 4.8
  cells wide, placed every 4 cells. At high density the result is a continuous
  overlapping mat, not trees. Woodland-mat and jungle-mat look the same because
  they are the same object.
- **Flat relief is 66.6 world units; planet relief is 12.2.** The same absolute
  sprite sizes are used in both, so on the globe a canopy sprite is 40% of the
  planet's entire vertical relief.
- **`THREE.Points` sprites are unlit and camera-facing.** No silhouette, no
  shading, no self-shadowing. The only channels separating woodland from jungle
  are hue (`0x3f793f` against `0x1f6937`, two near-identical dark greens) and
  count.
- **Sampling stride 4 caps density** at one sprite per 4×4 cells regardless of
  the multiplier; jungle's 0.80 × 1.6 is already clipped.

### What elevation costs

`height > 0.7` becomes `MOUNTAIN` and `> 0.85` becomes `SNOW`, discarding the
section's lushness, removing all foliage (no variants are registered for those
biomes), and drawing a hard contour line at exactly 0.7 on every peak.
Measured: rock and snow are 24% of land, and the 0.7 threshold sits at roughly
the 89th percentile of land height — it eats precisely the summits in view.

The structural blocker is that `biomeMap` is a single `Uint8` conflating two
independent axes, while `moistureMap` (a `Float64Array`) is used to smuggle
per-cell citations-per-sentence.

## Part A: one continuous lushness scalar

Four steps mapping onto the issue's "citations per sentence, then compared to
the entire article, divided by levels", plus a prerequisite.

**Step 0 (prerequisite) — fix sentence counting.** Serialize the clone with
`\n` after block elements instead of reading raw `textContent`. Count `<li>`
and `<td>` items as propositions in their own right rather than working around
them. Floor at 1 for any section with text. Nothing downstream is measurable
until this is right.

**Step 1 — per-section rate, with shrinkage.**

```
rate_s = (C_s + k * m) / (S_s + k)          k ~ 6 sentences
```

A one-sentence, one-citation section lands at approximately `m` — "typical for
this article", which is the honest reading of one data point. A sixty-sentence
section barely moves. Three lines of code, and the single biggest stability
win. Uses subtree counts, consistent with how peak height already uses
`subtreeSize`; the own-section rate is retained for the tooltip and ledger.

**Step 2 — article rate as a ratio of totals.**

```
m = totalCitations / totalSentences
```

Lead plus each top-level subtree, counted once. Removes both the double-count
and the outlier sensitivity of the mean-of-ratios.

**Step 3 — relative index.**

```
rel_s = rate_s / m      (0 when m == 0)
```

Centred on 1 by construction, so internal variation always shows.

**Step 4 — smooth absolute ceiling.**

```
lushness_s = (rel_s / (rel_s + 1)) * lerp(floor, 1, smoothstep(0, 0.35, m))
```

`rel/(rel+1)` is bounded and monotone with no clamp cliff, and maps `rel = 1`
to exactly 0.5. The ceiling replaces the entire `biasStrength` and
adjusted-threshold branch with one continuous curve: a poorly-cited article's
best section tops out mid-scale, a featured article's can reach the top, and
nothing anywhere is a step function.

The result is one number per section in [0, 1]. The renderer consumes it
continuously — colour becomes a gradient, foliage a continuous mix — while the
legend names bands. "Divided by levels" becomes cut points on a normalized
scalar rather than thresholds on a raw ratio.

## Part B: six bands

Decided: six, splitting the bottom.

| band | ground | vegetation |
|---|---|---|
| Uncited | dune desert | none at all |
| Sparse | dry steppe | scrub, dead grass |
| Light | pale green | scattered grass |
| Moderate | mid green | open meadow |
| Dense | forest green | one canopy layer, ground visible between trunks |
| Lush | deep green | closed canopy plus emergents breaking through it |

The added cut point carries real meaning: "this section has no sources" is a
different claim about an article than "this section has fewer sources than its
neighbours", and today both render as desert. Dense and Lush separate by canopy
closure and the emergent layer rather than by another shade of green.

Rejected: seven or eight bands. Per-band difference shrinks as band count
grows, and the measured problem is that only two of five bands render at once —
finer division does not fix that. With a continuous scalar the renderer is
already gradient-smooth; bands exist for the legend.

## Part C: two vegetation layers, two technologies

Bands read as distinct when several channels vary at once — ground hue,
understory density, canopy closure, tree form, height variance. Six bands
differing on four channels read far more clearly than eight differing on one.

**Understory** (grass, scrub) stays `THREE.Points`: cheap, high count, needs no
silhouette. Size capped at ≤1.5 cells, stride 2, budget roughly 10–20k.

**Canopy** becomes `InstancedMesh` with `MeshStandardMaterial`, so trees take
the scene's lighting and read as objects. Four to five low-poly archetypes —
conifer cone-plus-trunk (~24 tris), broadleaf (~40), tall emergent, shrub,
krummholz — with per-instance rotation, height jitter and hue jitter via
`instanceColor`.

**Sizing rule:** express foliage size in grid cells and convert per projection.
Today's absolute sizes violate `projection.js`'s own contract that grid-unit
tuning carries between views, which is why canopy sprites are 40% of relief on
the planet.

### Budget

- `InstancedMesh`: 64 B matrix plus 12 B colour, about 76 B per instance.
  20,000 trees is 1.5 MB. Geometry is shared; draw calls are one per archetype.
- Triangles: 20k × ~32 = 640k. The terrain mesh is already 262k tris at
  512×256, so this is the same order, on static geometry.
- Current foliage is 718 sprites, about 8.6 KB. Headroom is roughly 30×.
  Foliage is not where this app's memory goes.
- Build time matters more than memory: 20k matrix composes is a few ms against
  a 131k-cell loop that already runs.
- Planet view gates the canopy by camera distance and fades it in on descent —
  a perf win and a legibility win, since 20k lit trees are meaningless from
  orbit.

## Part D: elevation as a second axis

Stop treating elevation as a biome replacement. Two scalars per cell:

- `lushness ∈ [0, 1]` from Part A.
- `alpine` and `snowCover ∈ [0, 1]` from height via **smoothstep over a band**,
  not a step. These need no storage — they are pure functions of `heightMap[i]`.

Then:

- **Colour** is `lerp(lushColor(lushness), ROCK, alpine)` then
  `lerp(→ SNOW, snowCover)`. The contour line disappears, and a well-cited high
  peak becomes green-tinged rock while a barren one stays bare tan rock — the
  citation signal survives to the summit.
- **Foliage density** is multiplied by a treeline falloff. Trees thin and
  shorten as they climb instead of vanishing at a line.
- **Archetype shifts with altitude**: broadleaf, then conifer, then krummholz,
  then alpine cushion. The mountain is rocky-with-greenery, and *which*
  greenery reads as altitude while *how much* reads as citations — two signals
  on one slope.
- **The snow band keeps sparse dark conifers** at its lower edge, dusted white
  via a per-instance colour lerp, thinning to none at the top.
- **Lushness raises the treeline.** A well-cited section's trees climb higher
  than a barren one's. Physically plausible (moisture raises treelines), so it
  reads as geography rather than as a UI trick, and it is a second place the
  signal lands.

### Data model and memory

Replace the `Float64` `moistureMap` (1 MB) with a `Float32` `lushnessMap`
(512 KB): **net −512 KB per world while gaining an axis**. `biomeMap` survives
for the legend, tooltip and 2D fallback, but becomes *derived* from
(lushness band × altitude band), so nothing downstream breaks at once.
Snapshots do not serialize terrain, so there is no format concern.

## Sequencing

Six commits, each building green, per the one-PR/many-commits workflow. Part A
is a prerequisite for judging the rest by eye.

1. **Sentence counting** plus tests: block boundaries, list items, floor. Pure
   `core/`, no visual change to assess.
2. **Lushness scalar**: shrinkage, ratio-of-totals, relative index, smooth
   ceiling. Retires `classifyBiomeWithSentenceAwareness` and the whole
   `CITATION_PER_SENTENCE` adjusted-threshold block. Adds `lushnessMap`, keeps
   `biomeMap` derived. Tests cover monotonicity, absence of cliffs (small input
   delta produces small output delta), and the small-sample cases above as
   explicit regressions.
3. **Collapse the three sources of truth into one** and truth-up the legend.
   With a normalized scalar the legend's percentage language becomes accurate
   for the first time.
4. **Elevation blending**: smooth rock and snow mixing, treeline falloff,
   lushness-raises-treeline. Visual; tune in Storybook.
5. **Foliage overhaul**: grid-cell sizing, understory at stride 2, canopy
   `InstancedMesh` archetypes, altitude archetype shift, distance gating on the
   planet.
6. **Tuning pass**, keeping the band-histogram sweep as a test so "do all six
   bands appear on a normal article" stays a checkable claim.

## Acceptance criteria

- A typical multi-section article renders at least four of the six bands, in
  monotone order, with no band dropping out between two of its neighbours.
- Two articles differing by one citation produce visibly similar worlds (no
  cliff at any article-rate value).
- A one-sentence, one-citation section renders near the article's own average,
  not at an extreme.
- A list-heavy section's lushness reflects its citations rather than reading as
  uncited.
- Dense and Lush are distinguishable in silhouette, at distance, in greyscale.
- Rock and snow slopes carry visible vegetation that thins with altitude; no
  hard contour line at any height threshold.
- One lushness classifier, imported by terrain, foliage, tooltip and legend
  alike; the legend's stated numbers match what the engine computes.
- Per-world memory does not increase.

## Open questions — resolved

All three were the same dependency, and `scripts/calibrate-bands.mjs` closed
them by measuring live English Wikipedia. The environment turned out to permit
`en.wikipedia.org`, so this did not have to wait.

**Real-article calibration.** Measured over eight to ten articles from a list
article to a featured one:

| | min | median | max |
|---|---|---|---|
| article rate (citations/sentence) | 0.185 | 0.640 | 0.922 |
| within-article spread (doublings) | 0.00 | 1.01 | 3.61 |

**The working suspicion above was wrong, by about a factor of two.** Real
Wikipedia cites far more densely than "0.2–0.4 cps even for well-cited
articles" — Jupiter runs at 0.922 and Barack Obama at 0.849. Every consequence
of that estimate had to be revisited.

**Absolute saturation point.** Proposed at 0.35, shipped at **0.6**. At 0.35 it
sat *below the rate of the worst article in the sample*, so the ceiling never
engaged for anything and "List of Doctor Who episodes" — twelve references
across sixty-five sentences — could reach woodland. At 0.6 it tops out in
steppe, which is what it is. Saturation barely moves the band count, because it
scales every section of an article together; it is chosen on what it is *for*.

**Shrinkage constant `k`.** Proposed at 6 sentences, shipped at **6**. The
measurement supports it: Cyclone Tracy's "Records and meteorological
information" is 2 sentences carrying 5 citations, a raw rate 6.0× its article's,
and shrinkage lands it at 0.82 rather than clipping it to 1.0. Small sections
are held back without being flattened.

**Scale width.** Not an open question in the original plan, but the measurement
moved it. Swept 0.5 to 1.5 against the live articles, counting bands per world:
mean 3.63 at 0.5, 3.75 at 0.6, **3.88 at 0.7**, 3.50 at 0.8, 3.38 at 1.0, 2.50
at 1.5. Shipped at 0.7, against the 0.8 chosen in Phase 2 against the story
fixture — the direction of that sweep was right and the value slightly
overshot.

## As built

Where the implementation departed from the plan above, and why.

**Six bands, but dunes is not the bottom of the scale.** The plan cut the
scalar into six even sixths. That merged "cites nothing" into "cites very
little" — measured, a section with one citation in twenty-two sentences
computed to exactly 0 and rendered as bare dunes, a false statement about text
that had a citation. Shipped: 0 is a *reserved* value meaning "cites nothing",
and everything above it is cut into five even fifths among the sections that do
cite. `LUSHNESS.citedFloor` keeps a poorly-cited section off the reserved
value.

**Rock is two rocks.** The plan blended one rock colour over the band colour.
Shipped: rock lerps between a dry warm scree and a damp mossy stone by the
section's lushness, so even at *complete* cover a summit still says what its
section cites. That is what makes the phase's goal — a citation signal that
survives to the top — hold at full cover rather than only at partial.

**`BIOME.MOUNTAIN` is deleted.** The plan kept `biomeMap` and derived rock/snow
as an overlay. With rock as cover rather than ground, nothing produces a
mountain id, and a dead enum member is how phantom test references start (three
were found in passing tests during this work).

**Altitude bands were placed against measured land height**, not the plan's
sketch: land runs p50 0.50, p75 0.60, p90 0.72, p99 0.96, so the first cut's
treeline at 0.5 was thinning foliage on half the world rather than on
mountains.

**Vegetation came in well under the budget.** The plan estimated 20,000
instances and 1.5 MB. Measured: 8,000 understory sprites plus 1,800 canopy
instances, 117k triangles against a terrain mesh that is already 262k, in 0.23
MB and 7 to 8 draw calls.

**The story fixture was made representative**, which the plan did not call for.
It emitted one paragraph per section with empty citation markers, so it could
not exhibit either sentence-counting bug the parser was built against. A
fixture that cannot produce the failures the code survives is not exercising
the code.

## Still unverified

Nothing in this work has been checked in a browser. Every figure in it is a
cell count, an RGB distance, a bounding box or a triangle estimate, and none of
those establish that the result *looks* like anything. Specifically open:

- whether `MeshStandardMaterial` with `flatShading` reads as foliage or as
  faceted plastic under the current lighting;
- whether the frame rate holds with ~10,000 vegetation objects on a real GPU
  (the triangle counts are computed from segment counts, not profiled);
- whether `SPHERE_VIEW.foliageScale` of 0.42 is right, or the canopy reads as
  moss from the closest orbit the camera allows;
- whether the emergent layer is legible above a closed canopy rather than
  merely taller in the data;
- whether `ROCK_MOSSY` reads as stone rather than as dark grass on a lit,
  shaded surface;
- whether the tooltip's longer chips ("far above the article" against "lush")
  reflow badly in an 18rem tooltip at the narrowest width.

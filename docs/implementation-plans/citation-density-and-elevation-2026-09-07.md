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

## Open questions

- **Real-article calibration.** The rate sweep above is synthetic-fixture data.
  Before tuning cut points, run the band histogram against a handful of real
  articles — a stub, a list article, a GA, a featured article — to find where
  real Wikipedia prose actually sits. Working suspicion: 0.2–0.4 cps even for
  well-cited articles, which would mean today's woodland threshold of 0.5 is
  unreachable by legitimate prose. Not yet verified against a live article.
- **Shrinkage constant `k`.** Proposed at 6 sentences. Wants a look at the
  real-article distribution of section lengths before being fixed.
- **Absolute saturation point.** Proposed at 0.35 cps for the ceiling's
  `smoothstep`. Same dependency as above.

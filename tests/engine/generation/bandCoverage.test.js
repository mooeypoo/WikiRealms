import { describe, expect, it } from 'vitest'
import { parseSectionTree } from '../../../src/core/article/parseSectionTree.js'
import { buildParsoidHtml } from '../../../stories/fixtures/parsoidHtml.js'
import { BIOME_THRESHOLDS } from '../../../src/engine/generation/config.js'
import { generateWorld } from '../../../src/engine/generation/world.js'
import { BIOME, LUSHNESS_BANDS, lushnessBand } from '../../../src/engine/generation/terrain.js'
import { computeArticleCitationRate } from '../../../src/engine/generation/lushness.js'
import {
  FOLIAGE_SAMPLING,
  cellFoliageRolls,
  computeFoliageDensityScale,
  pickCanopyVariant,
  pickUnderstoryVariant,
  resolveArchetypeForAltitude,
} from '../../../src/ui/rendering/foliage.js'

/**
 * The regression harness for the whole citation-density line of work.
 *
 * Every claim it makes was, at some point, false and unnoticed. The
 * system this replaced rendered only TWO of its five bands on a healthy
 * article, dropped bands non-adjacently so the ramp read as arbitrary,
 * slid the entire map with the article's absolute citation rate, and
 * planted about 500 sprites on a planet of 26,000 land cells. None of
 * that was visible in a passing test suite, because nothing measured the
 * OUTPUT of a world — only the functions that build one.
 *
 * So this walks real articles through the real parser and the real engine
 * and counts what comes out. It is deliberately a coarse instrument:
 * shares of land per band, and vegetation totals. Those are the numbers
 * that were wrong.
 *
 * NOT A SUBSTITUTE FOR REAL ARTICLES. Everything here is synthetic,
 * generated from an outline, so it can only say the pipeline behaves
 * sensibly on the shapes it is given — not that those shapes match what
 * English Wikipedia actually looks like. See scripts/calibrate-bands.mjs
 * for the same measurement against live articles, and the open questions
 * in docs/implementation-plans/citation-density-and-elevation-2026-09-07.md.
 */

const BAND_NAMES = {
  [BIOME.DUNES]: 'dunes',
  [BIOME.STEPPE]: 'steppe',
  [BIOME.LIGHT_VEG]: 'light',
  [BIOME.MEADOW]: 'meadow',
  [BIOME.WOODLAND]: 'woodland',
  [BIOME.JUNGLE]: 'jungle',
}

/**
 * A section of `sentences` sentences citing `rate * multiplier` times per
 * sentence — so an outline can be described by how each section cites
 * RELATIVE to the article, which is what the scalar measures.
 */
function section(title, sentences, rate, multiplier = 1, extra = {}) {
  return {
    title,
    anchor: title.replace(/\s+/g, '_'),
    sentences,
    cites: Math.round(sentences * rate * multiplier),
    links: [],
    ...extra,
  }
}

/** Parses an outline and generates its world, through the real pipeline. */
function worldFor(outline) {
  const tree = parseSectionTree(buildParsoidHtml(outline))
  return { tree, world: generateWorld({ articleId: 'Harness', latestRevisionId: 1, sections: tree }) }
}

/**
 * Share of ARTICLE land in each band, plus which bands appear at all.
 *
 * The polar caps are excluded from the denominator. They are land, but
 * they belong to no section and say nothing about the article — and they
 * are a fixed ~2,900 cells whatever the article, so a stub's small world
 * is a fifth ice cap while a long article's is a tenth. Counting them
 * would make every share a function of article length.
 */
function bandProfile(terrain) {
  const counts = new Map(LUSHNESS_BANDS.map((band) => [band, 0]))
  let land = 0
  let polar = 0
  for (let i = 0; i < terrain.biomeMap.length; i++) {
    if (terrain.heightMap[i] <= BIOME_THRESHOLDS.beachMaxHeight) continue
    if (terrain.biomeMap[i] === BIOME.SNOW) {
      polar += 1
      continue
    }
    land += 1
    if (counts.has(terrain.biomeMap[i])) counts.set(terrain.biomeMap[i], counts.get(terrain.biomeMap[i]) + 1)
  }
  const shares = new Map([...counts].map(([band, count]) => [band, land > 0 ? count / land : 0]))
  return { land, polar, shares, present: LUSHNESS_BANDS.filter((band) => counts.get(band) > 0) }
}

/** Vegetation totals, counted the way the renderer places them. */
function vegetationProfile(world) {
  const t = world.terrain
  let understory = 0
  let canopy = 0
  const archetypes = new Set()

  for (let y = 1; y < t.height - 1; y += FOLIAGE_SAMPLING.understoryStride) {
    for (let x = 1; x < t.width - 1; x += FOLIAGE_SAMPLING.understoryStride) {
      const i = y * t.width + x
      const { variantRoll, densityRoll } = cellFoliageRolls(x, y, world.seed, 0)
      const variant = pickUnderstoryVariant(t.biomeMap[i], variantRoll)
      if (!variant) continue
      if (densityRoll >= variant.density * computeFoliageDensityScale(t.lushnessMap[i], t.heightMap[i])) continue
      understory += 1
    }
  }

  for (let y = 1; y < t.height - 1; y += FOLIAGE_SAMPLING.canopyStride) {
    for (let x = 1; x < t.width - 1; x += FOLIAGE_SAMPLING.canopyStride) {
      const i = y * t.width + x
      const { variantRoll, densityRoll } = cellFoliageRolls(x, y, world.seed, 1)
      const variant = pickCanopyVariant(t.biomeMap[i], variantRoll)
      if (!variant) continue
      if (densityRoll >= variant.density * computeFoliageDensityScale(t.lushnessMap[i], t.heightMap[i])) continue
      canopy += 1
      archetypes.add(resolveArchetypeForAltitude(variant.archetype, t.heightMap[i]))
    }
  }

  return { understory, canopy, archetypes }
}

/**
 * Citation rates taken from the live measurement in
 * scripts/calibrate-bands.mjs, not invented. Real English Wikipedia runs
 * 0.185 to 0.922 citations per sentence with a median of 0.640, which is
 * roughly DOUBLE what this project assumed before anyone measured it.
 *
 * Getting these wrong is not a cosmetic problem. The first cut of this
 * harness used 0.29 to 0.45 — below the median, and below the rate of the
 * worst real article in the sample — so every shape sat under the
 * absolute ceiling and the scale looked narrower than it is. The same
 * mistake, made with the story fixture, is what sent the Phase 2 sweep to
 * a slightly wrong answer for spanDoublings.
 */
const RATE = Object.freeze({
  none: 0,
  stub: 0.15,
  thin: 0.19, // a list article: measured at 0.185
  typical: 0.64, // the measured median
  featured: 0.9, // Jupiter runs 0.92, Barack Obama 0.85
})

/** The article shapes worth measuring, and why each one is here. */
const SHAPES = {
  // Nothing cited anywhere. Must be bare, and must not be dressed up by
  // the relative comparison finding "the best of a bad lot".
  uncited: {
    lead: { sentences: 5, cites: 0, links: ['A'] },
    sections: [
      section('One', 20, RATE.none),
      section('Two', 30, RATE.none),
      section('Three', 14, RATE.none),
    ],
  },
  // A stub: little text, one or two references.
  stub: {
    lead: { sentences: 3, cites: 1, links: ['A'] },
    sections: [section('History', 6, RATE.stub), section('Legacy', 4, RATE.stub * 0.6)],
  },
  // Every section citing at the same rate. The map SHOULD be uniform:
  // there is no internal variation to show, and inventing some would lie.
  uniform: {
    lead: { sentences: 6, cites: 2, links: ['A'] },
    sections: [
      section('Alpha', 24, RATE.typical),
      section('Beta', 30, RATE.typical),
      section('Gamma', 18, RATE.typical),
      section('Delta', 22, RATE.typical),
      section('Epsilon', 26, RATE.typical),
    ],
  },
  // The shape a real article has: sections citing from a fifth to nearly
  // double the article's own rate.
  varied: {
    lead: { sentences: 6, cites: 2, links: ['A'] },
    sections: [
      {
        ...section('Alpha', 18, RATE.typical, 0.4),
        children: [section('A1', 9, RATE.typical, 0.8), section('A2', 12, RATE.typical, 1.6)],
      },
      {
        ...section('Beta', 34, RATE.typical, 1.0),
        children: [section('B1', 14, RATE.typical, 1.4), section('B2', 21, RATE.typical, 0.6)],
      },
      section('Gamma', 26, RATE.typical, 1.8),
      section('Delta', 22, RATE.typical, 0.2),
      section('Epsilon', 14, RATE.typical, 1.2),
    ],
  },
  // Twelve sections spread evenly across the range, which is the only
  // shape that can populate every band at once — a world can never show
  // more bands than it has sections.
  spread: {
    lead: { sentences: 6, cites: 2, links: ['A'] },
    sections: Array.from({ length: 12 }, (_, i) =>
      section(`S${i}`, 20, RATE.typical, i === 0 ? 0 : 0.3 + i * 0.16),
    ),
  },
  // A filmography or discography: list items, no prose punctuation. Used
  // to count zero sentences and render as uncited whatever it referenced.
  listHeavy: {
    lead: { sentences: 5, cites: 2, links: ['A'] },
    sections: [
      section('Prose', 24, RATE.thin),
      { ...section('Filmography', 0, RATE.none), list: true, items: 20, cites: 8 },
      { ...section('Discography', 0, RATE.none), list: true, items: 14, cites: 2 },
    ],
  },
  // Deliberately hostile to the lushness blend: every parent has one very
  // lush child and one barren one, sitting a few cells apart. This is the
  // shape that decides LUSHNESS.blendSharpness, because it is where a
  // section's reading is most strongly pulled toward its neighbour's.
  hostile: {
    lead: { sentences: 8, cites: 5, links: ['A'] },
    sections: [
      {
        ...section('Overview', 30, RATE.typical, 0.35),
        children: [section('Deep dive', 18, RATE.typical, 1.9), section('Aside', 12, RATE.typical, 0.25)],
      },
      {
        ...section('History', 40, RATE.typical, 1.0),
        children: [section('Origins', 20, RATE.typical, 1.7), section('Decline', 16, RATE.typical, 0.4)],
      },
      section('Legacy', 22, RATE.typical, 1.1),
    ],
  },
  // Well cited throughout, which is what should unlock the top bands.
  featured: {
    lead: { sentences: 8, cites: 7, links: ['A'] },
    sections: [
      {
        ...section('Alpha', 40, RATE.featured, 0.5),
        children: [section('A1', 20, RATE.featured, 0.9)],
      },
      { ...section('Beta', 52, RATE.featured, 1.0), children: [section('B1', 24, RATE.featured, 1.3)] },
      section('Gamma', 36, RATE.featured, 1.7),
      section('Delta', 28, RATE.featured, 0.7),
      section('Epsilon', 30, RATE.featured, 1.4),
    ],
  },
}

const measured = Object.fromEntries(
  Object.entries(SHAPES).map(([name, outline]) => {
    const { tree, world } = worldFor(outline)
    return [
      name,
      {
        rate: computeArticleCitationRate(tree),
        ...bandProfile(world.terrain),
        vegetation: vegetationProfile(world),
      },
    ]
  }),
)

describe('band coverage', () => {
  it('reports the histogram for every article shape', () => {
    // Printed rather than asserted: the numbers are for a human tuning
    // the scale, and pinning them exactly would make every tuning change
    // look like a regression. The assertions below pin the PROPERTIES.
    for (const [name, m] of Object.entries(measured)) {
      const bands = LUSHNESS_BANDS.map(
        (band) => `${BAND_NAMES[band]}=${String(Math.round(m.shares.get(band) * 100)).padStart(2)}%`,
      ).join(' ')
      console.log(
        `  ${name.padEnd(10)} rate=${m.rate.toFixed(3)} ${bands} bands=${m.present.length}/6 ` +
          `land=${m.land} veg=${m.vegetation.understory}+${m.vegetation.canopy}`,
      )
    }

    expect(Object.keys(measured)).toHaveLength(Object.keys(SHAPES).length)
  })

  it('leaves an article that cites nothing entirely bare', () => {
    const m = measured.uncited

    expect(m.shares.get(BIOME.DUNES)).toBe(1)
    expect(m.present).toEqual([BIOME.DUNES])
    expect(m.vegetation.canopy).toBe(0)
    expect(m.vegetation.understory).toBe(0)
  })

  it('does not dress up a stub as well sourced', () => {
    // The absolute ceiling. Relative comparison alone would let a stub's
    // best section read as lush, since it is the best of what there is.
    const m = measured.stub

    expect(m.shares.get(BIOME.WOODLAND)).toBe(0)
    expect(m.shares.get(BIOME.JUNGLE)).toBe(0)
  })

  it('shows a uniformly cited article as uniform, rather than inventing variation', () => {
    // There is no internal difference to draw, and drawing one would lie.
    expect(measured.uniform.present.length).toBeLessThanOrEqual(2)
  })

  it('spreads a varied article across at least four bands', () => {
    // The measured failure this work exists to fix: two of five.
    expect(measured.varied.present.length).toBeGreaterThanOrEqual(4)
  })

  it('populates every band when an article has sections enough to fill them', () => {
    // A world can never show more bands than it has sections, so this is
    // the only shape that can prove the scale reaches end to end.
    expect(measured.spread.present).toEqual([...LUSHNESS_BANDS])
  })

  it('leaves no unreachable band in the middle of the scale', () => {
    // The other measured failure of the old system: meadow at 0% of land
    // with light vegetation and woodland on either side of it, so the
    // ramp read as arbitrary rather than as a scale.
    //
    // Asserted on `spread` ALONE, and that is not a weakening. A gap is
    // only a defect when a band is STRUCTURALLY unreachable; when it just
    // means "no section in this article cites at that rate", a gap is the
    // truth. Measured here: the stub jumps dunes → light because it has
    // exactly two sections, one of which cites nothing, and there is no
    // third section to stand in steppe. Asserting contiguity everywhere
    // would be asserting a property of the section distribution, not of
    // the scale — and would fail on honest articles.
    //
    // `spread` is the shape that tells the two apart: twelve sections
    // laid evenly across the range, so every band has a section that
    // belongs in it. Any gap there is the scale's fault.
    const indices = measured.spread.present.map((band) => LUSHNESS_BANDS.indexOf(band))

    for (let i = 1; i < indices.length; i++) {
      expect(indices[i] - indices[i - 1]).toBe(1)
    }
  })

  it('invents no band outside the range its sections actually occupy', () => {
    // The converse, so the reasoning above cannot rot.
    //
    // This used to assert something stronger — that every band on the map
    // belongs to some section — and that was true while a cell took its
    // owning section's band outright. It is not true now that lushness is
    // BLENDED across the boundary between a subsection and its parent: a
    // steppe subsection inside a meadow parent puts a few cells of light
    // vegetation in the transition, and no section is light vegetation.
    // That is the gradient doing its job, not a defect.
    //
    // What must still hold is that the gradient stays INSIDE the range
    // its sections span. A band above the best-cited section or below the
    // worst would be a claim the article does not support.
    for (const [name, m] of Object.entries(measured)) {
      const { world } = worldFor(SHAPES[name])
      const sectionBands = world.terrain.peaks.map((peak) => lushnessBand(peak.lushness))
      const lowest = Math.min(...sectionBands)
      const highest = Math.max(...sectionBands)

      for (const band of m.present) {
        expect(band, `${name}: ${BAND_NAMES[band]} above every section`).toBeLessThanOrEqual(highest)
        expect(band, `${name}: ${BAND_NAMES[band]} below every section`).toBeGreaterThanOrEqual(lowest)
      }
    }
  })

  it('puts every section’s own band on the ground, subsections included', () => {
    // The reported bug, pinned. Lushness came from a cell's TOP-LEVEL
    // owner, so a subsection painted NOTHING: measured on a fixture whose
    // children differ sharply from their parents, all four subsections
    // owned zero cells and all four fell in a different band from the one
    // drawn over them. Since halos and tooltips resolve subsections,
    // hovering one contradicted the ground beneath it every time.
    //
    // Asserted on the BAND rather than on the scalar, because the band is
    // what a reader sees and what the tooltip names. The scalar is pulled
    // a little toward a section's neighbours by the blend, and how far
    // depends on how close the two summits happen to land — which is a
    // function of the seed, so a tolerance on the scalar would be a test
    // that passes or fails by layout.
    for (const name of ['varied', 'hostile']) {
      const terrain = worldFor(SHAPES[name]).world.terrain
      const painted = new Set()
      for (let i = 0; i < terrain.biomeMap.length; i++) {
        if (terrain.heightMap[i] <= BIOME_THRESHOLDS.beachMaxHeight) continue
        painted.add(terrain.biomeMap[i])
      }

      expect(terrain.peaks.some((peak) => (peak.depth ?? 1) > 1)).toBe(true)

      for (const peak of terrain.peaks) {
        const band = lushnessBand(peak.lushness)
        expect(painted.has(band), `${name}: ${peak.title} (${BAND_NAMES[band]}) has no ground`).toBe(true)
      }
    }
  })

  it('keeps the ground reading as real section values, not as an average', () => {
    // The blend is there to soften a boundary, not to mix sections
    // together. If it mixed, a jungle subsection inside a steppe parent
    // would come out meadow, which is true of neither — so most land has
    // to sit ON some section's actual reading, with gradients only at the
    // edges. Measured across blend sharpness: 7.4% of land in a gradient
    // at k=4, 3.3% at k=10, 1.2% at k=24.
    const terrain = worldFor(SHAPES.varied).world.terrain
    const sectionValues = terrain.peaks.map((peak) => peak.lushness)
    let land = 0
    let inGradient = 0

    for (let i = 0; i < terrain.lushnessMap.length; i++) {
      if (terrain.heightMap[i] <= BIOME_THRESHOLDS.beachMaxHeight) continue
      land += 1
      const nearest = Math.min(...sectionValues.map((value) => Math.abs(value - terrain.lushnessMap[i])))
      if (nearest > 0.05) inGradient += 1
    }

    expect(inGradient / land).toBeLessThan(0.1)
    // And some gradient must exist, or the blend has become a hard edge
    // and the choice to blend at all was pointless.
    expect(inGradient).toBeGreaterThan(0)
  })

  it('measures a list-heavy section by its items rather than as uncited', () => {
    // A filmography counted zero sentences, so its citations divided by
    // nothing and it rendered as bare ground however well referenced.
    const m = measured.listHeavy

    expect(m.shares.get(BIOME.DUNES)).toBeLessThan(0.34)
    expect(m.present.length).toBeGreaterThanOrEqual(2)
  })

  it('lets a well-cited article reach the top of the scale', () => {
    expect(measured.featured.shares.get(BIOME.JUNGLE)).toBeGreaterThan(0)
  })

  it('plants an order of magnitude more vegetation than the layer it replaced', () => {
    // Measured before: 100 to 718 sprites for an entire planet of ~26,000
    // land cells, about 2.5% ground cover at the lushest.
    const total = measured.varied.vegetation.understory + measured.varied.vegetation.canopy

    expect(total).toBeGreaterThan(3000)
  })

  it('keeps the canopy within the instancing budget', () => {
    // The plan's headroom estimate was 20,000 instances at 1.5 MB.
    for (const [name, m] of Object.entries(measured)) {
      expect(m.vegetation.canopy, name).toBeLessThan(20000)
    }
  })

  it('grows more than one archetype on a varied article', () => {
    // If altitude substitution or the band tables collapse to a single
    // shape, every stand looks the same again.
    expect(measured.varied.vegetation.archetypes.size).toBeGreaterThanOrEqual(3)
  })
})

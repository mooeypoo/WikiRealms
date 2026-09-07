import { describe, expect, it } from 'vitest'
import { BIOME, LUSHNESS_BANDS, lushnessBand } from '../../../src/engine/generation/terrain.js'
import { biomeColor } from '../../../src/ui/rendering/biomeColor.js'
import { LUSHNESS_BAND_COPY, describeBand } from '../../../src/ui/content/lushnessBands.js'
import { GROUND_LEGEND } from '../../../src/ui/content/legend.js'
import { buildTooltipModel } from '../../../src/ui/rendering/sectionTooltip.js'

describe('LUSHNESS_BAND_COPY', () => {
  it('covers every band the engine can classify, and nothing else', () => {
    // A band without words would render an empty chip; words without a
    // band would be copy for something the engine cannot produce.
    const described = Object.keys(LUSHNESS_BAND_COPY).map(Number)

    expect(described.sort()).toEqual([...LUSHNESS_BANDS].sort())
  })

  it('gives every band a name and a detail', () => {
    for (const copy of Object.values(LUSHNESS_BAND_COPY)) {
      expect(copy.name.length).toBeGreaterThan(0)
      expect(copy.detail.length).toBeGreaterThan(0)
    }
  })

  it('states the comparison in the detail, where there is room for it', () => {
    // The scalar is relative, so every band except the bare one has to
    // say what it is relative TO. It used to say so in the NAME — "far
    // above the article", "typical for the article" — which was accurate
    // and unreadable, because a chip is not a sentence.
    for (const biome of LUSHNESS_BANDS) {
      if (biome === BIOME.DUNES) continue
      expect(LUSHNESS_BAND_COPY[biome].detail.toLowerCase()).toContain('average')
    }
  })

  it('compares rates rather than totals', () => {
    // "as many references as the rest of this article" describes a
    // TOTAL, and the scale compares rates: a section with five
    // references can sit exactly at the average of an article with two
    // hundred, because what is measured is references per sentence.
    // Counting language made that impossible to read correctly.
    for (const copy of Object.values(LUSHNESS_BAND_COPY)) {
      expect(copy.comparison).not.toMatch(/as many|fewer references|more references/)
    }
  })

  it('keeps a comparison short enough to sit on one line', () => {
    for (const copy of Object.values(LUSHNESS_BAND_COPY)) {
      expect(copy.comparison.length).toBeLessThanOrEqual(36)
    }
  })

  it('keeps names to a single word, short enough for a tooltip chip', () => {
    for (const copy of Object.values(LUSHNESS_BAND_COPY)) {
      expect(copy.name.split(/\s+/)).toHaveLength(1)
      expect(copy.name.length).toBeLessThanOrEqual(10)
    }
  })

  it('names the bands in an order a reader can rank without the legend', () => {
    // Barren to Lush is a scale on its face. "Dunes to Jungle" would name
    // the ground correctly and rank nothing.
    expect(LUSHNESS_BANDS.map((biome) => LUSHNESS_BAND_COPY[biome].name)).toEqual([
      'Barren',
      'Sparse',
      'Patchy',
      'Green',
      'Wooded',
      'Lush',
    ])
  })
})

describe('describeBand', () => {
  it('takes its colour from the terrain renderer rather than restating one', () => {
    expect(describeBand(BIOME.MEADOW).swatch).toBe(biomeColor(BIOME.MEADOW, 0.6))
  })

  it('is null for a biome that is not a lushness band', () => {
    expect(describeBand(BIOME.OCEAN)).toBeNull()
    expect(describeBand(BIOME.MOUNTAIN)).toBeNull()
    expect(describeBand(999)).toBeNull()
  })
})

describe('describeBand and the engine agree', () => {
  it('names the band the engine classifies a scalar into', () => {
    // Content names bands; it does not decide them. The engine's
    // lushnessBand is the only classifier.
    for (const lushness of [0, 0.1, 0.3, 0.5, 0.7, 0.95]) {
      expect(describeBand(lushnessBand(lushness))).not.toBeNull()
      expect(describeBand(lushnessBand(lushness)).biome).toBe(lushnessBand(lushness))
    }
  })
})

describe('one vocabulary', () => {
  /**
   * The failure this module exists to prevent: the engine, the foliage
   * layer and the tooltip each had their own idea of what "lush" meant,
   * and the tooltip could say "dense" while the ground under the cursor
   * was meadow.
   */
  it('sends the tooltip to the same band the legend row describes', () => {
    for (const entry of GROUND_LEGEND) {
      const model = buildTooltipModel({ title: 'x', lushness: midpointOf(entry.biome) }, [])

      expect(model.densityBand).toBe(entry.biome)
      expect(describeBand(model.densityBand).swatch).toBe(entry.swatch)
      expect(describeBand(model.densityBand).name).toBe(LUSHNESS_BAND_COPY[entry.biome].name)
    }
  })

  it('orders the legend the way the engine orders the bands', () => {
    expect(GROUND_LEGEND.map((entry) => entry.biome)).toEqual([...LUSHNESS_BANDS])
  })
})

/** A lushness value that lands squarely inside `biome`'s band. */
function midpointOf(biome) {
  if (biome === BIOME.DUNES) return 0
  const index = LUSHNESS_BANDS.indexOf(biome) - 1 // cited bands are fifths
  return (index + 0.5) / 5
}

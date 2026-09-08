/**
 * The one place the six lushness bands have names.
 *
 * There used to be three. The engine classified ground on absolute
 * citations-per-sentence thresholds, the foliage layer normalized the
 * same figure against the article's average, and the section tooltip
 * carried a third set of cut points plus its own five-colour palette
 * "mirroring the biome gradient" by hand. They disagreed: the tooltip
 * could say "dense" while the ground under the cursor was meadow, and
 * the legend printed percentages that belonged to no calculation the app
 * performed.
 *
 * So: the band comes from the engine (`lushnessBand`), the colour comes
 * from the renderer (`biomeColor`), and the words come from here. Nothing
 * restates anything.
 *
 * The names describe the GROUND, and the detail beside each one says what
 * that ground means. That split is deliberate, and it is the third
 * vocabulary this has had.
 *
 * The first was "dense" and "lush": short, but describing an absolute
 * quantity the app was not measuring, and needing the legend open to mean
 * anything at all.
 *
 * The second went the other way and put the comparison in the name —
 * "far above the article", "typical for the article". Accurate, and
 * unreadable: a chip is not a sentence, and a reader hovering a mountain
 * should not have to parse a clause.
 *
 * So: an ordered word for the ground, which is true of what you are
 * looking at and of how well it cites, and the comparison written out
 * underneath where there is room for it. The names avoid claiming an
 * absolute standard ("well sourced") that the middle bands cannot back —
 * a thinly-cited section of a superb article may still be better
 * referenced than most of Wikipedia.
 */
import { BIOME } from '../../engine/generation/terrain.js'
import { biomeColor } from '../rendering/biomeColor.js'

/**
 * Per band, in three pieces, because three surfaces need different
 * amounts of it:
 *
 * - `name` alone, for the tooltip chip, where there is room for a word.
 * - `name` + `comparison`, for a Ledger row: what you clicked, and what
 *   it means, without restating the terrain you can already see.
 * - `name` + `detail`, for the legend, which has to teach the colour to
 *   someone who has not met it yet — so it names the GROUND as well.
 *
 * `detail` is composed from the other two rather than written out again,
 * or the legend and the Ledger would drift the moment either was edited.
 *
 * Every comparison is against THIS ARTICLE, because that is what the
 * scalar measures. Neither surface prints a percentage: the tooltip and
 * the Ledger both give the section's own reference and sentence counts
 * instead, which is the part a reader can check by counting.
 *
 * The comparisons say "average" rather than naming what is averaged, and
 * they are short on purpose — they sit on one line in a narrow panel, and
 * the counts printed directly beneath them ("66 refs in 72 sentences")
 * are what says what is being averaged.
 *
 * They used to read "as many references as the rest of this article",
 * which describes a TOTAL. The scale compares rates: a section with five
 * references can sit exactly at the average of an article with two
 * hundred, because what is measured is references per sentence. Counting
 * language made that impossible to read correctly.
 */
const BANDS = {
  [BIOME.DUNES]: {
    name: 'Barren',
    ground: 'Bare ground',
    comparison: 'no references at all',
  },
  [BIOME.STEPPE]: {
    name: 'Sparse',
    ground: 'Scrub and dry grass',
    comparison: 'far below this article’s average',
  },
  [BIOME.LIGHT_VEG]: {
    name: 'Patchy',
    ground: 'Scattered green',
    comparison: 'below this article’s average',
  },
  [BIOME.MEADOW]: {
    name: 'Green',
    ground: 'Open meadow',
    comparison: 'about this article’s average',
  },
  [BIOME.WOODLAND]: {
    name: 'Wooded',
    ground: 'Trees, with ground still showing between them',
    comparison: 'above this article’s average',
  },
  [BIOME.JUNGLE]: {
    name: 'Lush',
    ground: 'Closed canopy',
    comparison: 'far above this article’s average',
  },
}

export const LUSHNESS_BAND_COPY = Object.freeze(
  Object.fromEntries(
    Object.entries(BANDS).map(([biome, copy]) => [
      biome,
      Object.freeze({
        ...copy,
        // Sentence-cased from the comparison, so the legend cannot say
        // something different from the Ledger about the same band.
        detail: `${copy.ground}: ${copy.comparison}.`,
      }),
    ]),
  ),
)

/** Height fed to biomeColor for swatches, mid-way up the land range. */
const SWATCH_HEIGHT = 0.6

/**
 * Everything a surface needs to describe one band: its biome id, its
 * words, and the colour the terrain renderer would actually paint it.
 *
 * Returns null for anything that is not a lushness band, so a caller
 * holding a null band (nothing hovered) or a rock/water cell renders
 * no chip rather than an empty one.
 *
 * @param {number} biome BIOME enum value
 * @param {number} [height] shading height for the swatch
 */
export function describeBand(biome, height = SWATCH_HEIGHT) {
  const copy = LUSHNESS_BAND_COPY[biome]
  if (!copy) return null
  return { biome, ...copy, swatch: biomeColor(biome, height) }
}

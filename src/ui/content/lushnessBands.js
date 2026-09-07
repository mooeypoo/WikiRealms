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
 * Per band: a `name` short enough for a tooltip chip and clear enough for
 * a legend row, and the `detail` that says what it means.
 *
 * Every detail states the comparison against THIS ARTICLE, because that
 * is what the scalar measures. The tooltip adds the section's own
 * reference and sentence counts beside the name, which is the part a
 * reader can check by opening the article and counting.
 */
export const LUSHNESS_BAND_COPY = Object.freeze({
  [BIOME.DUNES]: Object.freeze({
    name: 'Barren',
    detail: 'Bare ground: no references at all.',
  }),
  [BIOME.STEPPE]: Object.freeze({
    name: 'Sparse',
    detail: 'Scrub and dry grass. Far fewer references than the rest of this article.',
  }),
  [BIOME.LIGHT_VEG]: Object.freeze({
    name: 'Patchy',
    detail: 'Scattered green. Fewer references than the rest of this article.',
  }),
  [BIOME.MEADOW]: Object.freeze({
    name: 'Green',
    detail: 'Open meadow. About as many references as the rest of this article.',
  }),
  [BIOME.WOODLAND]: Object.freeze({
    name: 'Wooded',
    detail: 'Trees, with ground still showing between them. More references than the rest.',
  }),
  [BIOME.JUNGLE]: Object.freeze({
    name: 'Lush',
    detail: 'Closed canopy. Far more references than the rest — the best-sourced ground here.',
  }),
})

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

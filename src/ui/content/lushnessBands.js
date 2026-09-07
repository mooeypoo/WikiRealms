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
 * Every label is a COMPARISON, because the scalar behind it is one — a
 * section is greener than its neighbours when it cites better than they
 * do (see engine/generation/lushness.js). "Dense" and "lush" were the
 * old vocabulary and they described an absolute quantity the app was not
 * measuring.
 */
import { BIOME } from '../../engine/generation/terrain.js'
import { biomeColor } from '../rendering/biomeColor.js'

/**
 * Per band: a `chip` short enough for a tooltip, a `label` for the
 * legend's row, and the `detail` under it.
 *
 * The chips stand on their own — "far above the article" says what it
 * means without the legend open, where "lush" did not.
 */
export const LUSHNESS_BAND_COPY = Object.freeze({
  [BIOME.DUNES]: Object.freeze({
    chip: 'uncited',
    label: 'Cites nothing',
    detail: 'Bare ground. This section carries no references at all.',
  }),
  [BIOME.STEPPE]: Object.freeze({
    chip: 'far below the article',
    label: 'Cited far less than the rest',
    detail: 'Scrub and dry grass, well below what this article manages elsewhere.',
  }),
  [BIOME.LIGHT_VEG]: Object.freeze({
    chip: 'below the article',
    label: 'Cited less than the rest',
    detail: 'Scattered green, somewhat below the article’s own rate.',
  }),
  [BIOME.MEADOW]: Object.freeze({
    chip: 'typical for the article',
    label: 'Cited about as well as the rest',
    detail: 'Open meadow, at roughly the article’s own rate.',
  }),
  [BIOME.WOODLAND]: Object.freeze({
    chip: 'above the article',
    label: 'Cited better than the rest',
    detail: 'Trees, with ground still visible between them.',
  }),
  [BIOME.JUNGLE]: Object.freeze({
    chip: 'far above the article',
    label: 'Cited far better than the rest',
    detail: 'Closed canopy. The best-sourced ground in this world.',
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

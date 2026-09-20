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
 * Copy is resolved through banana-i18n so the chip, Ledger, and legend
 * stay on one vocabulary when the UI locale changes.
 */
import { BIOME } from '../../engine/generation/terrain.js'
import { biomeColor } from '../rendering/biomeColor.js'
import { t } from '../i18n/banana.js'

/**
 * Message keys per band. Resolved at read time so locale switches apply.
 *
 * Surfaces need different amounts:
 * - `name` alone, for the tooltip chip
 * - `name` + `comparison`, for a Ledger row
 * - `name` + `detail`, for the legend (detail composes ground + comparison)
 */
const BAND_KEYS = {
  [BIOME.DUNES]: {
    name: 'wikirealms-band-barren',
    ground: 'wikirealms-band-barren-ground',
    comparison: 'wikirealms-band-barren-comparison',
  },
  [BIOME.STEPPE]: {
    name: 'wikirealms-band-sparse',
    ground: 'wikirealms-band-sparse-ground',
    comparison: 'wikirealms-band-sparse-comparison',
  },
  [BIOME.LIGHT_VEG]: {
    name: 'wikirealms-band-patchy',
    ground: 'wikirealms-band-patchy-ground',
    comparison: 'wikirealms-band-patchy-comparison',
  },
  [BIOME.MEADOW]: {
    name: 'wikirealms-band-green',
    ground: 'wikirealms-band-green-ground',
    comparison: 'wikirealms-band-green-comparison',
  },
  [BIOME.WOODLAND]: {
    name: 'wikirealms-band-wooded',
    ground: 'wikirealms-band-wooded-ground',
    comparison: 'wikirealms-band-wooded-comparison',
  },
  [BIOME.JUNGLE]: {
    name: 'wikirealms-band-lush',
    ground: 'wikirealms-band-lush-ground',
    comparison: 'wikirealms-band-lush-comparison',
  },
}

function resolveBandCopy(keys) {
  const name = t(keys.name)
  const ground = t(keys.ground)
  const comparison = t(keys.comparison)
  return {
    name,
    ground,
    comparison,
    // Sentence-cased from the comparison, so the legend cannot say
    // something different from the Ledger about the same band.
    detail: `${ground}: ${comparison}.`,
  }
}

/**
 * Live band copy. Getters call `t` so English tests and locale switches both work.
 * @type {Readonly<Record<number, { name: string, ground: string, comparison: string, detail: string }>>}
 */
export const LUSHNESS_BAND_COPY = Object.freeze(
  Object.fromEntries(
    Object.entries(BAND_KEYS).map(([biome, keys]) => [
      biome,
      Object.freeze({
        get name() {
          return resolveBandCopy(keys).name
        },
        get ground() {
          return resolveBandCopy(keys).ground
        },
        get comparison() {
          return resolveBandCopy(keys).comparison
        },
        get detail() {
          return resolveBandCopy(keys).detail
        },
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
  const keys = BAND_KEYS[biome]
  if (!keys) return null
  return { biome, ...resolveBandCopy(keys), swatch: biomeColor(biome, height) }
}

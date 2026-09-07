import { BIOME_THRESHOLDS, PORTAL_LIMITS } from '../../engine/generation/config.js'
import { BIOME } from '../../engine/generation/terrain.js'
import { biomeColor } from '../rendering/biomeColor.js'

/**
 * What the world is telling you.
 *
 * Nobody could know any of this. Halos, glyphs, the colour of the ground
 * and where the water stops are all carrying meaning that has never been
 * written down anywhere in the interface — the info modal explains how a
 * world is BUILT, which is a different question from what you are looking
 * at right now.
 *
 * Everything here reads its numbers and its colours from the engine rather
 * than restating them (docs/ux-vision.md §7.3). A hardcoded threshold would
 * drift silently the first time generation is tuned, and a legend that lies
 * is worse than no legend.
 */

/**
 * The land, from least to most cited, with the engine's own colours.
 *
 * Every band is measured against THIS ARTICLE's own citation rate, not
 * against an absolute figure — that is the whole claim the ground makes,
 * and the previous legend stated it wrong. It described the bands as
 * percentages "of the article's citation density" while the engine was
 * comparing raw citations-per-sentence to fixed thresholds, so the
 * numbers on screen belonged to no calculation the app performed.
 *
 * There are no numbers here now, deliberately. The scalar behind the
 * bands is built from a shrinkage estimator, a log-ratio and a smooth
 * ceiling (see lushness.js); any single percentage printed against that
 * would be a number the reader cannot check and the engine does not use.
 * What a reader can act on is the ordering and the comparison, which is
 * what these say.
 */
export const GROUND_LEGEND = [
  {
    biome: BIOME.DUNES,
    label: 'Cites nothing',
    detail: 'Bare ground. This section carries no references at all.',
  },
  {
    biome: BIOME.STEPPE,
    label: 'Cited far less than the rest',
    detail: 'Scrub and dry grass, well below what this article manages elsewhere.',
  },
  {
    biome: BIOME.LIGHT_VEG,
    label: 'Cited less than the rest',
    detail: 'Scattered green, somewhat below the article’s own rate.',
  },
  {
    biome: BIOME.MEADOW,
    label: 'Cited about as well as the rest',
    detail: 'Open meadow, at roughly the article’s own rate.',
  },
  {
    biome: BIOME.WOODLAND,
    label: 'Cited better than the rest',
    detail: 'Trees, with ground still visible between them.',
  },
  {
    biome: BIOME.JUNGLE,
    label: 'Cited far better than the rest',
    detail: 'Closed canopy. The best-sourced ground in this world.',
  },
]

/**
 * How green a world can get at all, which is a separate question from
 * which section is greenest. An article that cites little stays dry
 * everywhere, however unevenly it cites.
 */
export const LUSHNESS_CEILING_NOTE =
  'These compare sections within one article. A poorly sourced article stays dry throughout, ' +
  'however uneven it is — the greens are only available to an article that cites well overall.'

/** Everything that is not the ground itself. */
export const FEATURE_LEGEND = [
  {
    id: 'range',
    label: 'A mountain range is a section',
    detail:
      'Its height comes from that section’s own prose, and its breadth from everything nested beneath it.',
  },
  {
    id: 'portal',
    label: 'A portal is an outbound link',
    // Not ALL of them: a long article has hundreds, and a world carrying
    // hundreds of markers is a world you cannot see. Saying "a portal is a
    // link" without saying "some of them" is the same overclaim the Links
    // readout was making.
    detail: `Up to ${PORTAL_LIMITS.maxPortals} of them, spread across the sections rather than taken from the top, and placed in the range whose section links there. Taking one starts a new world.`,
  },
  {
    id: 'water',
    label: 'The waterline is length',
    detail: 'A short article floods; a long, detailed one drains and shows more land.',
  },
  {
    id: 'snow',
    // "Altitude" alone left the chain broken in the middle: it named the
    // cause of the snow without saying what causes the altitude, so the
    // reader was told a fact about a fictional mountain rather than
    // something about their article.
    label: 'Rock and snow are how much was written',
    detail: `A section's own prose is what raises its peak. Push past ${percent(
      BIOME_THRESHOLDS.mountainMinHeight,
    )} of the world's height and the ground goes to bare rock; past ${percent(
      BIOME_THRESHOLDS.snowMinHeight,
    )} and it takes snow. The polar ice is the exception — every world has it.`,
  },
]

/** Swatch colour for a biome, straight from the renderer's own function. */
export function swatchFor(biome, height = 0.6) {
  return biomeColor(biome, height)
}

export const WATER_SWATCH = biomeColor(BIOME.OCEAN, 0.5)
export const SNOW_SWATCH = biomeColor(BIOME.SNOW, 0.95)

function percent(fraction) {
  return `${Math.round(fraction * 100)}%`
}

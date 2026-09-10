import { ALTITUDE, PORTAL_LIMITS } from '../../engine/generation/config.js'
import { BIOME, LUSHNESS_BANDS } from '../../engine/generation/terrain.js'
import { biomeColor } from '../rendering/biomeColor.js'
import { describeBand } from './lushnessBands.js'

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
 * The land, from least to most cited, in the engine's own band order and
 * with its own colours.
 *
 * Both the words and the ordering come from lushnessBands.js, which the
 * section tooltip reads too — one vocabulary, so the chip under the
 * cursor cannot disagree with the row in the legend. It used to: the
 * tooltip had its own thresholds and its own hand-copied palette.
 *
 * There are no numbers here, deliberately. The scalar behind the bands is
 * built from a shrinkage estimator, a log-ratio and a smooth ceiling (see
 * lushness.js); any single percentage printed against that would be a
 * number the reader cannot check and the engine does not use. The
 * previous legend printed exactly such numbers, as percentages "of the
 * article's citation density", while the engine was comparing raw
 * citations-per-sentence to fixed thresholds.
 */
export const GROUND_LEGEND = LUSHNESS_BANDS.map((biome) => describeBand(biome))

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
    detail:
      `A section's own prose is what raises its peak. Stone starts showing through at ` +
      `${percent(ALTITUDE.rockStart)} of the world's height and has covered the ground by ` +
      `${percent(ALTITUDE.rockFull)}; snow begins at ${percent(ALTITUDE.snowStart)}. Both come ` +
      `on gradually, and they tint rather than replace: a well-sourced section's high ground is ` +
      `damp, mossy stone where a barren one's is dry scree, and its trees climb higher before ` +
      `giving out. The polar ice is the exception — every world has it.`,
  },
  {
    id: 'foliage',
    label: 'Trees and grass grow from how well a section cites',
    detail:
      'Greener ground hosts denser understory and canopy. Altitude thins them toward the treeline; ' +
      'barren bands stay bare. The same lushness that paints the ground is what decides how much grows on it.',
  },
  {
    id: 'creatures',
    label: 'Blobs are the article’s topics — and how many people read it',
    detail:
      'Wikipedia categories pick which families roam (nature, science, arts, and the rest). ' +
      'Thirty-day pageviews set how many appear: quieter pages stay sparse, busier ones host denser fauna, ' +
      'and only the popular ones get sea leviathans.',
  },
]

export const WATER_SWATCH = biomeColor(BIOME.OCEAN, 0.5)
export const SNOW_SWATCH = biomeColor(BIOME.SNOW, 0.95)
/** Canopy green — matches woodland foliage rather than inventing a third green. */
export const FOLIAGE_SWATCH = biomeColor(BIOME.WOODLAND, 0.55)
/** Soft wanderer tint — a readable stand-in for the pudding blobs. */
export const CREATURE_SWATCH = '#b8a8d0'

function percent(fraction) {
  return `${Math.round(fraction * 100)}%`
}

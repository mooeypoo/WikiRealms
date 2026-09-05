import { BIOME_THRESHOLDS, CITATION_LUSHNESS } from '../../engine/generation/config.js'
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

/** The land, from least to most cited, with the engine's own colours. */
export const GROUND_LEGEND = [
  {
    biome: BIOME.DESERT,
    label: 'Barely cited',
    detail: `Under ${percent(CITATION_LUSHNESS.desertThreshold)} of the article's citation density`,
  },
  {
    biome: BIOME.LIGHT_VEG,
    label: 'Lightly cited',
    detail: `${percent(CITATION_LUSHNESS.desertThreshold)}–${percent(CITATION_LUSHNESS.lightVegThreshold)}`,
  },
  {
    biome: BIOME.MEADOW,
    label: 'Moderately cited',
    detail: `${percent(CITATION_LUSHNESS.lightVegThreshold)}–${percent(CITATION_LUSHNESS.meadowThreshold)}`,
  },
  {
    biome: BIOME.WOODLAND,
    label: 'Well cited',
    detail: `${percent(CITATION_LUSHNESS.meadowThreshold)}–${percent(CITATION_LUSHNESS.woodlandThreshold)}`,
  },
  {
    biome: BIOME.JUNGLE,
    label: 'Heavily cited',
    detail: `Over ${percent(CITATION_LUSHNESS.woodlandThreshold)}`,
  },
]

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
    detail: 'Placed inside the range whose section links there. Taking one starts a new world.',
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

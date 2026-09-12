import { ALTITUDE, PORTAL_LIMITS } from '../../engine/generation/config.js'
import { BIOME, LUSHNESS_BANDS } from '../../engine/generation/terrain.js'
import { biomeColor } from '../rendering/biomeColor.js'
import { t } from '../i18n/banana.js'
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
 *
 * Copy is resolved at call time so banana-i18n locale switches apply.
 */

/**
 * The land, from least to most cited, in the engine's own band order and
 * with its own colours.
 */
export function groundLegend() {
  return LUSHNESS_BANDS.map((biome) => describeBand(biome))
}

/**
 * How green a world can get at all, which is a separate question from
 * which section is greenest.
 */
export function lushnessCeilingNote() {
  return t('wikirealms-legend-ceiling-note')
}

/** Everything that is not the ground itself. */
export function featureLegend() {
  return [
    {
      id: 'range',
      label: t('wikirealms-legend-range-label'),
      detail: t('wikirealms-legend-range-detail'),
    },
    {
      id: 'portal',
      label: t('wikirealms-legend-portal-label'),
      detail: t(
        'wikirealms-legend-portal-detail',
        PORTAL_LIMITS.maxPortals,
        PORTAL_LIMITS.maxPerTopLevelSection,
      ),
    },
    {
      id: 'water',
      label: t('wikirealms-legend-water-label'),
      detail: t('wikirealms-legend-water-detail'),
    },
    {
      id: 'snow',
      label: t('wikirealms-legend-snow-label'),
      detail: t(
        'wikirealms-legend-snow-detail',
        percent(ALTITUDE.rockStart),
        percent(ALTITUDE.rockFull),
        percent(ALTITUDE.snowStart),
      ),
    },
    {
      id: 'foliage',
      label: t('wikirealms-legend-foliage-label'),
      detail: t('wikirealms-legend-foliage-detail'),
    },
    {
      id: 'creatures',
      label: t('wikirealms-legend-creatures-label'),
      detail: t('wikirealms-legend-creatures-detail'),
    },
  ]
}

export const WATER_SWATCH = biomeColor(BIOME.OCEAN, 0.5)
export const SNOW_SWATCH = biomeColor(BIOME.SNOW, 0.95)
/** Canopy green — matches woodland foliage rather than inventing a third green. */
export const FOLIAGE_SWATCH = biomeColor(BIOME.WOODLAND, 0.55)
/** Soft cyan — reads as water fauna on the legend swatch. */
export const CREATURE_SWATCH = '#5a9ec4'

function percent(fraction) {
  return `${Math.round(fraction * 100)}%`
}

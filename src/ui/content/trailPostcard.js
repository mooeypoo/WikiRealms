/**
 * Trail postcard model — structured expedition letter for text share and
 * the graphic postcard surface. Pure; URL building is injected.
 */
import { currentTitle, realmsOf } from '../../core/traversal/visitGraph.js'

const MAX_PATH_TITLES = 8

/**
 * @param {import('../../core/traversal/visitGraph.js').Journey | null | undefined} journey
 * @returns {string[]}
 */
export function expeditionPath(journey) {
  if (!journey?.history?.length || journey.cursor < 0) return []
  return journey.history
    .slice(0, journey.cursor + 1)
    .map((id) => journey.realms[id]?.title)
    .filter(Boolean)
}

/**
 * @param {string[]} titles
 * @param {number} [maxTitles]
 */
export function formatExpeditionPath(titles, maxTitles = MAX_PATH_TITLES) {
  if (!titles.length) return ''
  if (titles.length <= maxTitles) return titles.join(' → ')

  const head = Math.ceil((maxTitles - 1) / 2)
  const tail = maxTitles - 1 - head
  const skipped = titles.length - head - tail
  return [
    ...titles.slice(0, head),
    `…${skipped} more…`,
    ...titles.slice(titles.length - tail),
  ].join(' → ')
}

/**
 * Titles for the graphic card: same elision rules as the text route, but as
 * a list so the SVG can stack stops instead of wrapping one long arrow line.
 *
 * @param {string[]} titles
 * @param {number} [maxTitles]
 * @returns {string[]}
 */
export function postcardStops(titles, maxTitles = MAX_PATH_TITLES) {
  if (!titles.length) return []
  if (titles.length <= maxTitles) return [...titles]

  const head = Math.ceil((maxTitles - 1) / 2)
  const tail = maxTitles - 1 - head
  const skipped = titles.length - head - tail
  return [...titles.slice(0, head), `…${skipped} more…`, ...titles.slice(titles.length - tail)]
}

/**
 * @typedef {object} TrailPostcardModel
 * @property {string} title
 * @property {string} text
 * @property {string} url
 * @property {string} clipboardText
 * @property {string} here
 * @property {string[]} path full history titles through the cursor
 * @property {string[]} stops elided list for the graphic
 * @property {string} route arrow-joined stops
 * @property {number} realmCount
 * @property {number} portalCount
 */

/**
 * @param {import('../../core/traversal/visitGraph.js').Journey | null | undefined} journey
 * @param {{ realmUrl: (title: string) => string }} options
 * @returns {TrailPostcardModel | null}
 */
export function buildTrailPostcard(journey, options) {
  const path = expeditionPath(journey)
  if (path.length === 0) return null
  if (typeof options?.realmUrl !== 'function') {
    throw new Error('buildTrailPostcard requires options.realmUrl')
  }

  const here = currentTitle(journey) ?? path[path.length - 1]
  const url = options.realmUrl(here)
  const realmCount = realmsOf(journey).length
  const portalCount = journey.edges?.length ?? 0
  const stops = postcardStops(path)
  const route = formatExpeditionPath(path)

  const text = [
    `Expedition on WikiRealms:`,
    route,
    `${realmCount} realm${realmCount === 1 ? '' : 's'} · ${portalCount} portal${portalCount === 1 ? '' : 's'} walked`,
    '',
    'Every Wikipedia article is a world — explore knowledge as landscape, then grow the map on Wikipedia itself.',
  ].join('\n')

  return {
    title: 'WikiRealms expedition',
    text,
    url,
    clipboardText: `${text}\n${url}`,
    here,
    path,
    stops,
    route,
    realmCount,
    portalCount,
  }
}

/** Fixed artboard for the graphic postcard (portrait, share-friendly). */
export const POSTCARD_WIDTH = 840
export const POSTCARD_HEIGHT = 1100

/**
 * Wikipedia contribution CTAs — a developer-facing registry.
 *
 * Surfaces ask the resolver for at most one CTA. Copy, thresholds, URL
 * builders and kill switches live here so Ledger / tooltip / Field Guide
 * never hardcode barren/donate prose. Flip `WIKIPEDIA_CTA_CONFIG.enabled`
 * or a CTA's own `enabled` to mute without touching components.
 *
 * Kept in ui/content (not engine config): this is presentation policy,
 * not world math. Rendering modules must not import this file.
 */
import { BIOME } from '../../engine/generation/terrain.js'
import { LUSHNESS_BAND_COPY } from './lushnessBands.js'

/** Master switches and thresholds. Edit here to retune without UI prefs. */
export const WIKIPEDIA_CTA_CONFIG = Object.freeze({
  /** Kill every CTA at once. */
  enabled: true,
  /**
   * A realm is "small" when BOTH caps are met — short prose and few
   * sections. Either alone can be a long stub outline or a dense short
   * article; both together is the map that still looks unfinished.
   */
  smallRealm: Object.freeze({
    maxWords: 800,
    maxSections: 4,
  }),
  urls: Object.freeze({
    introduction: 'https://en.wikipedia.org/wiki/Help:Introduction',
    donate: 'https://donate.wikimedia.org/',
  }),
})

/** Surface ids surfaces pass to the resolver. */
export const WIKIPEDIA_CTA_SURFACES = Object.freeze({
  TOOLTIP_HINT: 'tooltip.hint',
  LEDGER_DETAIL: 'ledger.detail',
  LEDGER_FOOTER: 'ledger.footer',
  LEDGER_HEADER: 'ledger.header',
  FIELD_GUIDE_FOOTER: 'field-guide.footer',
})

/**
 * Bands below this article's citation average (same vocabulary as the
 * legend): Barren, Sparse, Patchy. Meadow is "about average" and is not
 * invited to grow citations here.
 */
export const CITE_CTA_BANDS = Object.freeze([
  BIOME.DUNES,
  BIOME.STEPPE,
  BIOME.LIGHT_VEG,
])

/**
 * Build a section view URL on Wikipedia (reading stays there; editing too).
 * @param {string} articleUrl
 * @param {string} [anchor]
 */
export function buildSectionViewUrl(articleUrl, anchor) {
  if (!articleUrl) return ''
  if (!anchor) return articleUrl
  return `${articleUrl}#${anchor}`
}

/**
 * Open the article's edit form on Wikipedia.
 * @param {string} articleUrl fullurl from the Action API
 */
export function buildArticleEditUrl(articleUrl) {
  if (!articleUrl) return ''
  try {
    const url = new URL(articleUrl)
    // /wiki/Title → /w/index.php?title=Title&action=edit
    const match = url.pathname.match(/^\/wiki\/(.+)$/)
    if (match) {
      const edit = new URL('/w/index.php', url.origin)
      edit.searchParams.set('title', decodeURIComponent(match[1].replace(/_/g, ' ')))
      edit.searchParams.set('action', 'edit')
      return edit.toString()
    }
    url.searchParams.set('action', 'edit')
    return url.toString()
  } catch {
    return articleUrl
  }
}

/**
 * @param {number | null | undefined} densityBand
 * @returns {boolean}
 */
export function isCiteCtaBand(densityBand) {
  return CITE_CTA_BANDS.includes(densityBand)
}

/**
 * Diegetic tooltip line for a below-average band.
 * @param {WikipediaCtaContext} ctx
 */
function citeNotice(ctx) {
  const copy = LUSHNESS_BAND_COPY[ctx.densityBand]
  if (!copy) return null
  return `${copy.name} — ${copy.comparison}. Select this peak in the Ledger for how to help.`
}

/**
 * Ledger action label for a below-average section.
 * @param {WikipediaCtaContext} ctx
 */
function citeLabel(ctx) {
  if (!ctx.anchor) return null
  const topic = ctx.sectionTitle ? `“${ctx.sectionTitle}”` : 'this section'
  if (ctx.densityBand === BIOME.DUNES) {
    return `Help seed ${topic} with citations on Wikipedia`
  }
  return `Help add citations to ${topic} on Wikipedia`
}

/**
 * @typedef {object} WikipediaCtaContext
 * @property {number | null} [densityBand]
 * @property {string} [anchor]
 * @property {string} [sectionTitle]
 * @property {boolean} [isAggregate]
 * @property {string} [articleUrl]
 * @property {number} [wordCount]
 * @property {number} [sectionCount]
 * @property {boolean} [stale]
 */

/**
 * @typedef {object} WikipediaCtaDef
 * @property {string} id
 * @property {boolean} enabled
 * @property {readonly string[]} surfaces
 * @property {number} priority lower wins when several match
 * @property {(ctx: WikipediaCtaContext) => boolean} match
 * @property {(ctx: WikipediaCtaContext) => string | null} [notice]
 * @property {(ctx: WikipediaCtaContext) => string | null} [label]
 * @property {(ctx: WikipediaCtaContext) => string | null} [href]
 * @property {(ctx: WikipediaCtaContext) => string | null} [prose] HTML for Field Guide tabs
 */

/** @type {readonly WikipediaCtaDef[]} */
export const WIKIPEDIA_CTAS = Object.freeze([
  Object.freeze({
    id: 'cite-below-average-section',
    enabled: true,
    surfaces: Object.freeze([
      WIKIPEDIA_CTA_SURFACES.TOOLTIP_HINT,
      WIKIPEDIA_CTA_SURFACES.LEDGER_DETAIL,
    ]),
    priority: 10,
    // Tooltip needs only the band; Ledger also needs an anchor to deep-link.
    match: (ctx) => isCiteCtaBand(ctx.densityBand) && !ctx.isAggregate,
    notice: citeNotice,
    label: citeLabel,
    href: (ctx) =>
      ctx.anchor ? buildSectionViewUrl(ctx.articleUrl ?? '', ctx.anchor) : null,
  }),

  Object.freeze({
    id: 'grow-small-realm',
    enabled: true,
    surfaces: Object.freeze([WIKIPEDIA_CTA_SURFACES.LEDGER_FOOTER]),
    priority: 20,
    match: (ctx) => {
      const { maxWords, maxSections } = WIKIPEDIA_CTA_CONFIG.smallRealm
      const words = ctx.wordCount ?? Infinity
      const sections = ctx.sectionCount ?? Infinity
      return Boolean(ctx.articleUrl) && words <= maxWords && sections <= maxSections
    },
    label: () => 'A small realm — enlarge the map on Wikipedia',
    href: (ctx) => buildArticleEditUrl(ctx.articleUrl ?? ''),
  }),

  Object.freeze({
    id: 'stale-realm-nudge',
    enabled: true,
    surfaces: Object.freeze([WIKIPEDIA_CTA_SURFACES.LEDGER_HEADER]),
    priority: 30,
    match: (ctx) => Boolean(ctx.stale && ctx.articleUrl),
    label: () => 'View the latest — or help keep it accurate',
    href: (ctx) => ctx.articleUrl ?? '',
  }),

  Object.freeze({
    id: 'field-guide-contribute',
    enabled: true,
    surfaces: Object.freeze([WIKIPEDIA_CTA_SURFACES.FIELD_GUIDE_FOOTER]),
    priority: 40,
    match: () => true,
    prose: () => `
      <p class="guide-cta__lead">Wikipedia is free because people fund and edit it.</p>
      <p class="guide-cta__actions">
        <a href="${WIKIPEDIA_CTA_CONFIG.urls.introduction}" target="_blank" rel="noopener noreferrer">Become an editor</a>
        <span class="guide-cta__sep" aria-hidden="true">·</span>
        <a href="${WIKIPEDIA_CTA_CONFIG.urls.donate}" target="_blank" rel="noopener noreferrer">Donate</a>
      </p>
    `.trim(),
  }),
])

/**
 * Resolve the single best CTA for a surface, or null.
 *
 * @param {string} surfaceId
 * @param {WikipediaCtaContext} [ctx]
 * @param {{ ctas?: readonly WikipediaCtaDef[], config?: typeof WIKIPEDIA_CTA_CONFIG }} [options] test overrides
 * @returns {{ id: string, notice: string | null, label: string | null, href: string | null, prose: string | null } | null}
 */
export function resolveWikipediaCta(surfaceId, ctx = {}, options = {}) {
  const config = options.config ?? WIKIPEDIA_CTA_CONFIG
  if (!config.enabled) return null

  const ctas = options.ctas ?? WIKIPEDIA_CTAS
  const matches = ctas.filter(
    (cta) =>
      cta.enabled &&
      cta.surfaces.includes(surfaceId) &&
      cta.match(ctx),
  )
  if (matches.length === 0) return null

  matches.sort((a, b) => a.priority - b.priority)
  const best = matches[0]
  return {
    id: best.id,
    notice: best.notice?.(ctx) ?? null,
    label: best.label?.(ctx) ?? null,
    href: best.href?.(ctx) ?? null,
    prose: best.prose?.(ctx) ?? null,
  }
}

/**
 * HTML fragment for a Field Guide tab, or empty string when muted.
 * @param {string} surfaceId
 */
export function fieldGuideCtaProse(surfaceId) {
  const resolved = resolveWikipediaCta(surfaceId, {})
  return resolved?.prose ?? ''
}

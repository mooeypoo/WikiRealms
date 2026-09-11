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
import { t } from '../i18n/banana.js'
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
  /**
   * Whole-article citation invite. Measured in citations per sentence —
   * the same absolute rate the lushness ceiling uses — not relative
   * section bands (those always produce "sparse" peaks inside even a
   * well-sourced article). At or below this rate the map reads as
   * mostly barren or scrub, and the Ledger asks for seeding.
   */
  sparseArticle: Object.freeze({
    maxCitationRate: 0.2,
  }),
  /**
   * Stewardship asks that wait for a real walk. Donate / become-editor
   * on the Trail only after this many portal hops — enough for the
   * landscape metaphor to land before we ask for support.
   */
  stewardship: Object.freeze({
    minPortalHops: 3,
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
  TRAIL_FOOTER: 'trail.footer',
})

/** Shared eyebrow for diegetic contribution invites (Ledger callouts). */
export function fieldTaskEyebrow() {
  return t('wikirealms-field-task-eyebrow')
}

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
  return t('wikirealms-cta-cite-tooltip', copy.name, copy.comparison)
}

/**
 * Ledger field-task body: what the slope means, then where to act.
 * @param {WikipediaCtaContext} ctx
 */
function citeFieldNotice(ctx) {
  const copy = LUSHNESS_BAND_COPY[ctx.densityBand]
  if (!copy) return null
  if (ctx.densityBand === BIOME.DUNES) {
    return t('wikirealms-cta-cite-field-barren', copy.name)
  }
  return t('wikirealms-cta-cite-field', copy.name, copy.comparison)
}

/**
 * Ledger action label for a below-average section.
 * @param {WikipediaCtaContext} ctx
 */
function citeLabel(ctx) {
  if (!ctx.anchor) return null
  const topic = ctx.sectionTitle
    ? t('wikirealms-cta-cite-topic-named', ctx.sectionTitle)
    : t('wikirealms-cta-cite-topic-section')
  if (ctx.densityBand === BIOME.DUNES) {
    return t('wikirealms-cta-cite-seed-section', topic)
  }
  return t('wikirealms-cta-cite-add-section', topic)
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
 * @property {number} [citationRate] article citations-per-sentence
 * @property {boolean} [stale]
 * @property {number} [portalHops] portal edges walked this session (Trail)
 */

/**
 * Absolute article rate is sparse enough to invite whole-realm seeding.
 * @param {WikipediaCtaContext} ctx
 */
function isSparseArticle(ctx) {
  const rate = ctx.citationRate
  if (typeof rate !== 'number' || !(rate >= 0)) return false
  return rate <= WIKIPEDIA_CTA_CONFIG.sparseArticle.maxCitationRate
}

/**
 * Ledger field-task body for a thinly cited article as a whole.
 * @param {WikipediaCtaContext} ctx
 */
function sparseArticleNotice(ctx) {
  if ((ctx.citationRate ?? 0) <= 0) {
    return t('wikirealms-cta-sparse-article-barren')
  }
  return t('wikirealms-cta-sparse-article')
}

/**
 * Ledger action label for a thinly cited article.
 * @param {WikipediaCtaContext} ctx
 */
function sparseArticleLabel(ctx) {
  if ((ctx.citationRate ?? 0) <= 0) {
    return t('wikirealms-cta-sparse-article-seed-label')
  }
  return t('wikirealms-cta-sparse-article-add-label')
}

/**
 * @typedef {object} WikipediaCtaDef
 * @property {string} id
 * @property {boolean} enabled
 * @property {readonly string[]} surfaces
 * @property {number} priority lower wins when several match
 * @property {(ctx: WikipediaCtaContext) => boolean} match
 * @property {(ctx: WikipediaCtaContext) => string | null} [eyebrow]
 * @property {(ctx: WikipediaCtaContext) => string | null} [notice]
 * @property {(ctx: WikipediaCtaContext) => string | null} [label]
 * @property {(ctx: WikipediaCtaContext) => string | null} [href]
 * @property {(ctx: WikipediaCtaContext) => string | null} [prose] HTML for Field Guide / Trail strips
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
    eyebrow: (ctx) =>
      // Field-task framing only where there is room for notice + action.
      ctx.anchor ? fieldTaskEyebrow() : null,
    notice: (ctx) => (ctx.anchor ? citeFieldNotice(ctx) : citeNotice(ctx)),
    label: citeLabel,
    href: (ctx) =>
      ctx.anchor ? buildSectionViewUrl(ctx.articleUrl ?? '', ctx.anchor) : null,
  }),

  Object.freeze({
    id: 'cite-sparse-article',
    enabled: true,
    surfaces: Object.freeze([WIKIPEDIA_CTA_SURFACES.LEDGER_FOOTER]),
    // Ahead of grow-small-realm: a short barren stub needs seeding as much
    // as land, and the citation invite matches the section field task.
    priority: 15,
    match: (ctx) => Boolean(ctx.articleUrl) && isSparseArticle(ctx),
    eyebrow: () => fieldTaskEyebrow(),
    notice: sparseArticleNotice,
    label: sparseArticleLabel,
    href: (ctx) => ctx.articleUrl ?? '',
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
    eyebrow: () => fieldTaskEyebrow(),
    notice: () => t('wikirealms-cta-grow-small-notice'),
    label: () => t('wikirealms-cta-grow-small-label'),
    href: (ctx) => buildArticleEditUrl(ctx.articleUrl ?? ''),
  }),

  Object.freeze({
    id: 'stale-realm-nudge',
    enabled: true,
    surfaces: Object.freeze([WIKIPEDIA_CTA_SURFACES.LEDGER_HEADER]),
    priority: 30,
    match: (ctx) => Boolean(ctx.stale && ctx.articleUrl),
    label: () => t('wikirealms-cta-stale-label'),
    href: (ctx) => ctx.articleUrl ?? '',
  }),

  Object.freeze({
    id: 'trail-stewardship',
    enabled: true,
    surfaces: Object.freeze([WIKIPEDIA_CTA_SURFACES.TRAIL_FOOTER]),
    priority: 35,
    match: (ctx) => {
      const min = WIKIPEDIA_CTA_CONFIG.stewardship.minPortalHops
      return (ctx.portalHops ?? 0) >= min
    },
    prose: () =>
      `<p class="trail-cta__lead">${t('wikirealms-cta-trail-lead')}</p>
      <p class="trail-cta__actions">
        <a href="${WIKIPEDIA_CTA_CONFIG.urls.introduction}" target="_blank" rel="noopener noreferrer">${t('wikirealms-cta-become-editor')}</a>
        <span class="trail-cta__sep" aria-hidden="true">·</span>
        <a href="${WIKIPEDIA_CTA_CONFIG.urls.donate}" target="_blank" rel="noopener noreferrer">${t('wikirealms-cta-donate')}</a>
      </p>`.trim(),
  }),

  Object.freeze({
    id: 'field-guide-contribute',
    enabled: true,
    surfaces: Object.freeze([WIKIPEDIA_CTA_SURFACES.FIELD_GUIDE_FOOTER]),
    priority: 40,
    match: () => true,
    prose: () =>
      `<p class="guide-cta__lead">${t('wikirealms-cta-guide-lead')}</p>
      <p class="guide-cta__actions">
        <a href="${WIKIPEDIA_CTA_CONFIG.urls.introduction}" target="_blank" rel="noopener noreferrer">${t('wikirealms-cta-become-editor')}</a>
        <span class="guide-cta__sep" aria-hidden="true">·</span>
        <a href="${WIKIPEDIA_CTA_CONFIG.urls.donate}" target="_blank" rel="noopener noreferrer">${t('wikirealms-cta-donate')}</a>
      </p>`.trim(),
  }),
])

/**
 * Resolve the single best CTA for a surface, or null.
 *
 * @param {string} surfaceId
 * @param {WikipediaCtaContext} [ctx]
 * @param {{ ctas?: readonly WikipediaCtaDef[], config?: typeof WIKIPEDIA_CTA_CONFIG }} [options] test overrides
 * @returns {{ id: string, eyebrow: string | null, notice: string | null, label: string | null, href: string | null, prose: string | null } | null}
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
    eyebrow: best.eyebrow?.(ctx) ?? null,
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

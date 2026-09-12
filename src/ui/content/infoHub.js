/**
 * Field Guide tab definitions.
 *
 * Titles and long prose resolve through banana-i18n so each Wikipedia
 * edition can ship its own guide. Markup and outbound URLs stay here;
 * translators get the sentences (and small trusted tags like <strong>,
 * <em>, <kbd> where the copy needs them).
 *
 * The Field Guide panel sets `dir` from the UI locale. Full sentences
 * inherit that direction so mixed copy like "WikiRealms הופך…" keeps the
 * period at the logical end. Bare `<bdi>` would auto-detect LTR from the
 * Latin brand and break that — so we only wrap a message in `<bdi>` when
 * the resolved text has no RTL letters (English fallback inside an RTL UI).
 * Short Latin proper names in links still use `tBdiHtml`.
 */
import { getUiDir, t, tBdiHtml } from '../i18n/banana.js'

/** Hebrew, Arabic, and neighbouring RTL script blocks. */
const RTL_LETTER = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0780-\u07BF\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/

/**
 * Message HTML for Field Guide prose. Inherits the panel `dir` unless the
 * string is still Latin-only (untranslated fallback), in which case `<bdi>`
 * isolates it as LTR inside an RTL panel.
 *
 * @param {string} key
 * @param {...unknown} params
 */
function proseMessage(key, ...params) {
  const html = t(key, ...params)
  if (getUiDir() !== 'rtl') return html
  const plain = html.replace(/<[^>]*>/g, '')
  if (RTL_LETTER.test(plain)) return html
  return `<bdi>${html}</bdi>`
}

function link(href, labelHtml) {
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${labelHtml}</a>`
}

function startHereHtml() {
  return `
      <p>${proseMessage('wikirealms-info-start-lead')}</p>
      <ul class="info-hub__bullets">
        <li>${proseMessage('wikirealms-info-start-peaks')}</li>
        <li>${proseMessage('wikirealms-info-start-water')}</li>
        <li>${proseMessage('wikirealms-info-start-fish')}</li>
        <li>${proseMessage('wikirealms-info-start-portals')}</li>
        <li>${proseMessage('wikirealms-info-start-trail')}</li>
      </ul>
      <p class="info-hub__callout">${proseMessage('wikirealms-info-start-callout')}</p>
    `
}

function journeyHtml() {
  return `
      <p>${proseMessage('wikirealms-info-journey-lead')}</p>
      <ul class="info-hub__bullets">
        <li>${proseMessage('wikirealms-info-journey-back')}</li>
        <li>${proseMessage('wikirealms-info-journey-open')}</li>
        <li>${proseMessage('wikirealms-info-journey-share')}</li>
      </ul>
    `
}

function howWorldsHtml() {
  return `
      <p>${proseMessage('wikirealms-info-how-lead')}</p>
      <details class="info-hub__details">
        <summary>${proseMessage('wikirealms-info-how-summary')}</summary>
        <ol>
          <li>${proseMessage('wikirealms-info-how-outline')}</li>
          <li>${proseMessage('wikirealms-info-how-scale')}</li>
          <li>${proseMessage('wikirealms-info-how-detail')}</li>
          <li>${proseMessage('wikirealms-info-how-sea')}</li>
          <li>${proseMessage('wikirealms-info-how-ground')}</li>
          <li>${proseMessage('wikirealms-info-how-weather')}</li>
        </ol>
      </details>
      <p>${proseMessage('wikirealms-info-how-portals')}</p>
    `
}

function aboutHtml() {
  const fishPack = link('https://quaternius.com', tBdiHtml('wikirealms-info-about-fish-pack'))
  const quaternius = link(
    'https://www.patreon.com/quaternius',
    tBdiHtml('wikirealms-info-about-quaternius'),
  )
  const townKit = link(
    'https://kenney.nl/assets/fantasy-town-kit',
    tBdiHtml('wikirealms-info-about-town-kit'),
  )
  const kenney = link('https://kenney.nl', tBdiHtml('wikirealms-info-about-kenney'))

  return `
      <p>${proseMessage('wikirealms-info-about-by')}</p>
      <p>${proseMessage('wikirealms-info-about-pitch')}</p>
      <ul class="info-hub__links">
        <li>${link(
          'https://github.com/mooeypoo/WikiRealms',
          tBdiHtml('wikirealms-info-about-source'),
        )}</li>
        <li>${link('https://moriel.tech', tBdiHtml('wikirealms-info-about-site'))}</li>
      </ul>
      <h3>${proseMessage('wikirealms-info-about-credits')}</h3>
      <p>${proseMessage(
        'wikirealms-info-about-credits-body',
        fishPack,
        quaternius,
        townKit,
        kenney,
      )}</p>
    `
}

function shortcutsHtml() {
  return `
      <p data-shortcuts>${proseMessage('wikirealms-info-shortcuts-lead')}</p>
    `
}

export const infoHubContent = {
  startHere: {
    id: 'start-here',
    titleKey: 'wikirealms-info-tab-start',
    icon: 'map',
    content: startHereHtml,
  },
  journey: {
    id: 'journey',
    titleKey: 'wikirealms-info-tab-journey',
    icon: 'trail',
    content: journeyHtml,
  },
  howWorlds: {
    id: 'how-worlds',
    titleKey: 'wikirealms-info-tab-how-worlds',
    icon: 'layers',
    content: howWorldsHtml,
  },
  about: {
    id: 'about',
    titleKey: 'wikirealms-info-tab-about',
    icon: 'mark',
    content: aboutHtml,
  },
  shortcuts: {
    id: 'shortcuts',
    titleKey: 'wikirealms-info-tab-keyboard',
    icon: 'legend',
    content: shortcutsHtml,
  },
}

export const infoTabs = Object.values(infoHubContent)

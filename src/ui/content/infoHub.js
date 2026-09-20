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
 * Proper names that must stay English (author name and site, asset packs,
 * artists, license codes) are hardcoded and wrapped with `bdiHtml`, not
 * message keys. Shortcut glyphs are inserted from the keymap.
 */
import {
  APP_AUTHOR_NAME,
  APP_AUTHOR_SITE_LABEL,
  APP_AUTHOR_SITE_URL,
  APP_REPOSITORY_URL,
  CC0_LICENSE,
} from '../../appInfo.js'
import { bdiHtml, getUiDir, t, tBdiHtml } from '../i18n/banana.js'
import { formatKeyHtml } from '../design/useKeymap.js'

/**
 * Credit names and URLs. English originals — not translation strings.
 * @type {Readonly<{ href: string, name: string }>}
 */
const FISH_PACK = Object.freeze({ href: 'https://quaternius.com', name: 'Cute Fish Pack' })
const QUATERNIUS = Object.freeze({
  href: 'https://www.patreon.com/quaternius',
  name: 'Quaternius',
})
const TOWN_KIT = Object.freeze({
  href: 'https://kenney.nl/assets/fantasy-town-kit',
  name: 'Fantasy Town Kit',
})
const KENNEY = Object.freeze({ href: 'https://kenney.nl', name: 'Kenney' })

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

/** Outbound link whose visible name is English and isolated for RTL. */
function namedLink({ href, name }) {
  return link(href, bdiHtml(name))
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
      <p class="info-hub__callout">${proseMessage('wikirealms-info-start-callout', formatKeyHtml('l'))}</p>
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
  const cc0 = namedLink({ href: CC0_LICENSE.url, name: CC0_LICENSE.code })
  return `
      <p>${proseMessage('wikirealms-info-about-by', bdiHtml(APP_AUTHOR_NAME))}</p>
      <p>${proseMessage('wikirealms-info-about-pitch')}</p>
      <ul class="info-hub__links">
        <li>${link(APP_REPOSITORY_URL, tBdiHtml('wikirealms-info-about-source'))}</li>
        <li>${link(APP_AUTHOR_SITE_URL, bdiHtml(APP_AUTHOR_SITE_LABEL))}</li>
      </ul>
      <h3>${proseMessage('wikirealms-info-about-credits')}</h3>
      <p>${proseMessage(
        'wikirealms-info-about-credits-body',
        namedLink(FISH_PACK),
        namedLink(QUATERNIUS),
        namedLink(TOWN_KIT),
        namedLink(KENNEY),
        cc0,
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

#!/usr/bin/env node
/**
 * Measures the lushness scale against REAL English Wikipedia articles.
 *
 * Everything in tests/engine/generation/bandCoverage.test.js is
 * synthetic: it proves the pipeline behaves sensibly on the article
 * shapes it is handed, but not that those shapes resemble Wikipedia. The
 * three tunables that decide what a world looks like —
 * LUSHNESS.shrinkageSentences, LUSHNESS.spanDoublings and
 * LUSHNESS.articleRateSaturation — were all chosen against the story
 * fixture, and the plan has recorded that as an open question since it
 * was written.
 *
 * It has now been run, and the current LUSHNESS values come from it. Both
 * figures it reports are printed against the configured tunable, so a
 * re-run says immediately whether the calibration still holds:
 *
 *   1. WHERE THE ARTICLE RATE SITS, against articleRateSaturation — the
 *      rate at which an article may use the whole scale. A well-cited
 *      article should sit at or above it. If the maximum in the sample is
 *      well below, every world in the app is being held under its
 *      ceiling; if the minimum is above, the ceiling never engages and
 *      a thinly-sourced article can look well sourced.
 *   2. HOW WIDE THE WITHIN-ARTICLE SPREAD IS, against spanDoublings * 2 —
 *      the width of the scale. The scale wants to be a little wider than
 *      the MEDIAN spread. Too wide and every world reads uniform; too
 *      narrow and every section clips to an end.
 *
 * The first run of this changed two values. It found real rates running
 * 0.185 to 0.922 with a median of 0.640 — close to double this project's
 * estimate before anyone measured — which put saturation below the rate
 * of the worst article in the sample, and it found spanDoublings 0.7
 * showing more bands than the 0.8 chosen against the story fixture.
 *
 * Usage:
 *   node scripts/calibrate-bands.mjs
 *   node scripts/calibrate-bands.mjs "Cassini Division" "Jupiter"
 *
 * NOT RUN IN CI: it is a network tool, it is subject to Wikimedia's rate
 * limits, and its output is a judgement for a human to make rather than
 * an assertion. tests/engine/generation/bandCoverage.test.js is the
 * offline half, and its article shapes use the rates measured here.
 */
import { JSDOM } from 'jsdom'

// parseSectionTree uses DOMParser, which Node does not have.
const dom = new JSDOM('')
globalThis.DOMParser = dom.window.DOMParser

const { parseSectionTree } = await import('../src/core/article/parseSectionTree.js')
const { LUSHNESS } = await import('../src/engine/generation/config.js')
const { BIOME, lushnessBand } = await import('../src/engine/generation/terrain.js')
const { computeArticleCitationRate, computeSectionLushness } = await import(
  '../src/engine/generation/lushness.js'
)

const BAND_NAMES = {
  [BIOME.DUNES]: 'dunes',
  [BIOME.STEPPE]: 'steppe',
  [BIOME.LIGHT_VEG]: 'light',
  [BIOME.MEADOW]: 'meadow',
  [BIOME.WOODLAND]: 'woodland',
  [BIOME.JUNGLE]: 'jungle',
}

/**
 * A spread chosen to bracket what the app will meet, not to be
 * representative of Wikipedia as a whole:
 * - a stub, where shrinkage matters most;
 * - list articles, which counted zero sentences before this work;
 * - good and featured articles, which decide where saturation belongs;
 * - a very long article, where section count hits the peak caps.
 */
const DEFAULT_TITLES = [
  'Cassini Division',
  'Zinc finger nuclease',
  'List of Doctor Who episodes',
  'Photosynthesis',
  'Cyclone Tracy',
  'Barack Obama',
  'Jupiter',
  'History of Poland',
]

const REST_BASE = 'https://en.wikipedia.org/w/rest.php/v1/page'
const USER_AGENT = 'WikiRealms-calibration/0.1 (https://github.com/mooeypoo/WikiRealms)'

/**
 * Wikimedia's REST endpoint rate-limits an unauthenticated caller, and a
 * back-to-back run of ten titles reliably takes 429s partway down the
 * list. A second between requests is enough and costs nothing on a tool
 * nobody waits for.
 */
const REQUEST_SPACING_MS = 1000

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchHtml(title) {
  const url = `${REST_BASE}/${encodeURIComponent(title.trim().replace(/ /g, '_'))}/with_html`
  const response = await fetch(url, { headers: { 'Api-User-Agent': USER_AGENT } })
  if (response.status === 429) {
    throw new Error(`rate limited (429) — raise REQUEST_SPACING_MS or run fewer titles`)
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${title}`)
  return (await response.json()).html
}

function flatten(nodes, out = []) {
  for (const node of nodes) {
    out.push(node)
    flatten(node.children, out)
  }
  return out
}

function report(title, html) {
  const tree = parseSectionTree(html)
  const rate = computeArticleCitationRate(tree)
  const topLevel = tree.sections

  console.log(`\n=== ${title}`)
  console.log(
    `  citations=${tree.citationCount} sentences=${tree.sentenceCount} ` +
      `rate=${rate.toFixed(3)} cites/sentence   sections=${topLevel.length}`,
  )

  const rows = topLevel.map((node) => {
    const citations = node.subtreeCitationCount ?? 0
    const sentences = node.subtreeSentenceCount ?? 0
    const lushness = computeSectionLushness({ citations, sentences }, rate)
    const raw = sentences > 0 ? citations / sentences : 0
    return {
      title: node.title,
      citations,
      sentences,
      raw,
      rel: rate > 0 ? raw / rate : 0,
      lushness,
      band: BAND_NAMES[lushnessBand(lushness)],
    }
  })

  for (const row of rows) {
    console.log(
      `    ${row.title.slice(0, 26).padEnd(26)} ` +
        `sent=${String(row.sentences).padStart(4)} cit=${String(row.citations).padStart(4)} ` +
        `raw=${row.raw.toFixed(3)} rel=${row.rel.toFixed(2)} ` +
        `lush=${row.lushness.toFixed(2)} ${row.band}`,
    )
  }

  const bands = new Set(rows.map((row) => row.band))
  const doublings = rows.filter((row) => row.rel > 0).map((row) => Math.log2(row.rel))
  const spread = doublings.length > 0 ? Math.max(...doublings) - Math.min(...doublings) : 0

  console.log(
    `  bands=${bands.size}/6 (${[...bands].join(',')})   ` +
      `within-article spread=${spread.toFixed(2)} doublings ` +
      `(scale covers ${(LUSHNESS.spanDoublings * 2).toFixed(2)})`,
  )

  return { title, rate, bands: bands.size, spread, sections: rows.length }
}

const titles = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_TITLES
const summary = []

for (const [index, title] of titles.entries()) {
  if (index > 0) await wait(REQUEST_SPACING_MS)
  try {
    summary.push(report(title, await fetchHtml(title)))
  } catch (error) {
    console.error(`\n=== ${title}\n  FAILED: ${error.message}`)
  }
}

if (summary.length > 0) {
  console.log('\n=== What to do with this')
  const rates = summary.map((s) => s.rate).sort((a, b) => a - b)
  const spreads = summary.map((s) => s.spread).sort((a, b) => a - b)
  const median = (xs) => xs[Math.floor(xs.length / 2)]

  console.log(`  article rate:   min=${rates[0].toFixed(3)} median=${median(rates).toFixed(3)} max=${rates.at(-1).toFixed(3)}`)
  console.log(`  configured saturation: ${LUSHNESS.articleRateSaturation}`)
  console.log(
    `    -> a well-cited article should sit AT or ABOVE saturation. If the max here is well below ` +
      `it, every world in the app is being held under its ceiling.`,
  )
  console.log(
    `  within-article spread: min=${spreads[0].toFixed(2)} median=${median(spreads).toFixed(2)} ` +
      `max=${spreads.at(-1).toFixed(2)} doublings`,
  )
  console.log(`  configured scale width: ${(LUSHNESS.spanDoublings * 2).toFixed(2)} doublings`)
  console.log(
    `    -> the scale should be a little WIDER than the median spread: too wide and every world ` +
      `reads uniform, too narrow and every section clips to an end.`,
  )
  console.log(`  bands shown: ${summary.map((s) => `${s.bands}`).join(' ')} (of 6, capped by section count)`)
}

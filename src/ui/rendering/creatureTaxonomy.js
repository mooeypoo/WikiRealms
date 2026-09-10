/**
 * Article categories → which blob families inhabit a world.
 *
 * Wikipedia category titles are noisy and multilingual; this module never
 * treats a raw title as a creature type. It matches keywords against a
 * closed set of topic families, then emits normalised mix weights the
 * scatter can roll against.
 *
 * Presentation-only: nothing here feeds worldId or generation. The same
 * categories always produce the same mix.
 */

export const CREATURE_FAMILY = Object.freeze({
  nature: 'nature',
  science: 'science',
  arts: 'arts',
  history: 'history',
  places: 'places',
  sport: 'sport',
  wanderer: 'wanderer',
})

/** Stable order for buffers, draw calls, and tests. */
export const CREATURE_FAMILIES = Object.freeze([
  CREATURE_FAMILY.nature,
  CREATURE_FAMILY.science,
  CREATURE_FAMILY.arts,
  CREATURE_FAMILY.history,
  CREATURE_FAMILY.places,
  CREATURE_FAMILY.sport,
  CREATURE_FAMILY.wanderer,
])

/**
 * Keyword stems per family. Matched as case-insensitive substrings of a
 * category title. Longer / more specific stems win when several families
 * hit the same title — see scoreCategory.
 *
 * Utility leftovers that sometimes slip past clshow=!hidden are listed
 * under IGNORE so they never tip the mix.
 */
const FAMILY_KEYWORDS = Object.freeze({
  [CREATURE_FAMILY.nature]: Object.freeze([
    'animal',
    'fauna',
    'flora',
    'plant',
    'biolog',
    'ecolog',
    'botan',
    'zoolog',
    'organism',
    'species',
    'wildlife',
    'mammals',
    'birds',
    'insect',
    'fungi',
    'trees',
    'forests',
  ]),
  [CREATURE_FAMILY.science]: Object.freeze([
    'physic',
    'chemist',
    'mathematic',
    'astronom',
    'scient',
    'technolog',
    'engineering',
    'comput',
    'planets',
    'galaxy',
    'galaxies',
    'quantum',
    'geolog',
    'meteorolog',
    'medicine',
    'medical',
  ]),
  [CREATURE_FAMILY.arts]: Object.freeze([
    'music',
    'film',
    'cinema',
    'literatur',
    'novel',
    'painting',
    'painter',
    'sculptur',
    'theatre',
    'theater',
    'poetry',
    'poet',
    'album',
    'song',
    'arts',
    'artist',
    'dance',
    'opera',
  ]),
  [CREATURE_FAMILY.history]: Object.freeze([
    'histor',
    'wars',
    'battle',
    'politic',
    'monarch',
    'royalty',
    'empire',
    'dynasty',
    'ancient',
    'medieval',
    'revolution',
    'military',
    'century births',
    'century deaths',
  ]),
  [CREATURE_FAMILY.places]: Object.freeze([
    'geograph',
    'cities',
    'countries',
    'buildings',
    'architecture',
    'landform',
    'mountains',
    'rivers',
    'islands',
    'regions',
    'populated places',
    'capitals',
  ]),
  [CREATURE_FAMILY.sport]: Object.freeze([
    'sport',
    'olympic',
    'football',
    'soccer',
    'baseball',
    'basketball',
    'tennis',
    'cricket',
    'athlet',
    'racing',
    'championship',
  ]),
})

const IGNORE_KEYWORDS = Object.freeze([
  'cs1',
  'short description',
  'articles with',
  'wikipedia',
  'wikidata',
  'pages using',
  'all stub',
  'stubs',
  'orphaned',
  'unreferenced',
  'cleanup',
])

/** Always keep a little wanderer so sparse or mismatched articles still feel inhabited. */
export const WANDERER_FLOOR = 0.12

/**
 * @param {string} title
 * @returns {boolean}
 */
function shouldIgnore(title) {
  const lower = title.toLowerCase()
  return IGNORE_KEYWORDS.some((stem) => lower.includes(stem))
}

/**
 * Best family for one category title, or null.
 * Prefers the longest matching stem so "mathematical physics" leans science
 * over a stray shorter hit elsewhere.
 *
 * @param {string} title
 * @returns {string|null} CREATURE_FAMILY id
 */
export function classifyCategory(title) {
  if (!title || shouldIgnore(title)) return null
  const lower = title.toLowerCase()
  let best = null
  let bestLen = -1
  for (const family of CREATURE_FAMILIES) {
    if (family === CREATURE_FAMILY.wanderer) continue
    const stems = FAMILY_KEYWORDS[family]
    for (const stem of stems) {
      if (stem.length > bestLen && lower.includes(stem)) {
        best = family
        bestLen = stem.length
      }
    }
  }
  return best
}

/**
 * Raw hit counts per family from an article's category list.
 *
 * @param {string[]} [categories]
 * @returns {Record<string, number>}
 */
export function countFamilyHits(categories = []) {
  const counts = Object.fromEntries(CREATURE_FAMILIES.map((id) => [id, 0]))
  for (const title of categories) {
    const family = classifyCategory(title)
    if (!family) continue
    counts[family] += 1
  }
  return counts
}

/**
 * Normalised mix weights summing to 1. Always includes wanderer at least
 * WANDERER_FLOOR. When nothing matches, wanderer takes the whole mix.
 *
 * @param {string[]} [categories]
 * @returns {Record<string, number>}
 */
export function computeCreatureMix(categories = []) {
  const counts = countFamilyHits(categories)
  const topical = CREATURE_FAMILIES.filter((id) => id !== CREATURE_FAMILY.wanderer)
  let topicalTotal = 0
  for (const id of topical) topicalTotal += counts[id]

  const mix = Object.fromEntries(CREATURE_FAMILIES.map((id) => [id, 0]))

  if (topicalTotal <= 0) {
    mix[CREATURE_FAMILY.wanderer] = 1
    return mix
  }

  const topicalShare = 1 - WANDERER_FLOOR
  for (const id of topical) {
    mix[id] = (counts[id] / topicalTotal) * topicalShare
  }
  mix[CREATURE_FAMILY.wanderer] = WANDERER_FLOOR
  return mix
}

/**
 * Picks a family from a unit roll against mix weights.
 *
 * @param {Record<string, number>} mix
 * @param {number} roll in [0, 1)
 * @returns {string}
 */
export function pickFamilyFromMix(mix, roll) {
  let cursor = 0
  for (const id of CREATURE_FAMILIES) {
    cursor += mix[id] ?? 0
    if (roll < cursor) return id
  }
  return CREATURE_FAMILY.wanderer
}

/**
 * The approved shelf: realms we are happy to hand a first-time viewer.
 *
 * Every entry is vetted rather than discovered. Wikipedia's random article
 * is a stub as often as not, and a stub generates a smooth featureless ball
 * — the worst possible first impression of an app whose whole claim is that
 * articles have shape. These are chosen for what they GENERATE: a
 * substantial, unevenly weighted section tree, so the world has ranges of
 * visibly different size and a useful number of portals.
 *
 * Hints are one plain line each. They are an invitation, not a summary —
 * the article says what the article says.
 */
export const CURATED_REALMS = [
  // Places with a lot of structure to them
  { title: 'Antarctica', hint: 'A continent under ice' },
  { title: 'Great Barrier Reef', hint: 'The largest coral reef system' },
  { title: 'Amazon rainforest', hint: 'Half the rainforest left on Earth' },
  { title: 'Sahara', hint: 'The largest hot desert' },
  { title: 'Mount Everest', hint: 'The highest point above sea level' },
  { title: 'Mariana Trench', hint: 'The deepest part of the ocean' },
  { title: 'Yellowstone National Park', hint: 'A caldera with a park on top' },
  { title: 'Krakatoa', hint: 'A volcano that rearranged itself' },

  // Processes and phenomena
  { title: 'Bioluminescence', hint: 'Light made by living things' },
  { title: 'Photosynthesis', hint: 'How light becomes food' },
  { title: 'Plate tectonics', hint: 'Why the map keeps moving' },
  { title: 'Aurora', hint: 'The solar wind, made visible' },
  { title: 'Antimicrobial resistance', hint: 'Evolution, happening quickly' },

  // Out there
  { title: 'Saturn', hint: 'The sixth planet, and its rings' },
  { title: 'Black hole', hint: 'Where gravity wins' },
  { title: 'Voyager 1', hint: 'The furthest human-made object' },
  { title: 'Apollo 11', hint: 'The first crewed Moon landing' },

  // Made things
  { title: 'Silk Road', hint: 'Trade routes across Eurasia' },
  { title: 'Printing press', hint: 'The machine that copied ideas' },
  { title: 'Library of Alexandria', hint: "Antiquity's most famous library" },
  { title: 'Cartography', hint: 'The making of maps' },
  { title: 'Bauhaus', hint: 'A school that reshaped design' },
  { title: 'Jazz', hint: 'A music built on improvisation' },
  { title: 'Chess', hint: 'A game with nothing hidden' },
  { title: 'Origami', hint: 'Paper, folded' },
  { title: 'Esperanto', hint: 'A language built on purpose' },
]

/** How many of the shelf to show at once. Six fills the grid without crowding. */
export const SUGGESTION_COUNT = 6

/**
 * A sample of the shelf, in random order.
 *
 * Drawn fresh each time the launch screen mounts, so returning to it shows
 * somewhere new rather than the same six forever — which is the whole
 * reason for keeping a shelf larger than the grid.
 */
export function pickRealms(count = SUGGESTION_COUNT, random = Math.random) {
  const pool = [...CURATED_REALMS]

  // Fisher-Yates, stopping once we have enough: an unbiased sample without
  // shuffling twenty-six entries to show six.
  for (let index = 0; index < Math.min(count, pool.length - 1); index += 1) {
    const pick = index + Math.floor(random() * (pool.length - index))
    ;[pool[index], pool[pick]] = [pool[pick], pool[index]]
  }

  return pool.slice(0, count)
}

/**
 * One realm from the shelf, excluding any already on screen — so "surprise
 * me" reaches past what the viewer can already see rather than offering
 * them something they just declined.
 *
 * @param {string[]} exclude titles currently shown
 */
export function randomRealm(exclude = [], random = Math.random) {
  const excluded = new Set(Array.isArray(exclude) ? exclude : [exclude])
  const options = CURATED_REALMS.filter((realm) => !excluded.has(realm.title))
  const pool = options.length > 0 ? options : CURATED_REALMS

  return pool[Math.floor(random() * pool.length)]
}

/**
 * Realms offered on the launch screen.
 *
 * Chosen for what they generate rather than for what they are about: each
 * has a substantial, unevenly weighted section tree, so the world that comes
 * out has ranges of visibly different size and a useful number of portals. A
 * stub would produce a smooth ball and teach a first-time viewer nothing
 * about what this is.
 *
 * Descriptions are one plain line each. They are an invitation, not a
 * summary — the article says what the article says.
 */
export const CURATED_REALMS = [
  { title: 'Antarctica', hint: 'A continent under ice' },
  { title: 'Krakatoa', hint: 'A volcano that rearranged itself' },
  { title: 'Bioluminescence', hint: 'Light made by living things' },
  { title: 'Silk Road', hint: 'Trade routes across Eurasia' },
  { title: 'Great Barrier Reef', hint: 'The largest coral reef system' },
  { title: 'Jazz', hint: 'A music built on improvisation' },
]

/**
 * Picks one of the above at random, avoiding a title already on screen so
 * "surprise me" always actually changes something.
 *
 * It draws from this list rather than from Wikipedia's random article,
 * which would need an adapter that does not exist — and which would land
 * a first-time viewer on a stub as often as not.
 */
export function randomRealm(exclude = null, random = Math.random) {
  const options = CURATED_REALMS.filter((realm) => realm.title !== exclude)
  return options[Math.floor(random() * options.length)]
}

/**
 * Deterministic seeding utilities for the generation engine.
 *
 * All world generation must be reproducible from
 * (articleId, revisionId, engineVersion). This module turns that identity
 * into a numeric seed, and the seed into a seeded pseudo-random generator.
 */

/**
 * Hashes a string into a 32-bit unsigned integer using FNV-1a.
 * Deterministic: the same string always produces the same hash.
 * @param {string} input
 * @returns {number}
 */
export function hashStringToSeed(input) {
  let hash = 0x811c9dc5 // FNV offset basis

  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) // FNV prime
  }

  return hash >>> 0
}

/**
 * Derives a deterministic numeric seed from a world's generation identity.
 * @param {{ articleId: string, revisionId: string|number, engineVersion: string }} identity
 * @returns {number}
 */
export function deriveSeed({ articleId, revisionId, engineVersion }) {
  return hashStringToSeed(`${articleId}@${revisionId}:${engineVersion}`)
}

/**
 * Creates a deterministic pseudo-random number generator seeded by a
 * 32-bit integer. Uses the mulberry32 algorithm: fast, small, and
 * produces the same sequence of floats in [0, 1) for the same seed.
 * @param {number} seed
 * @returns {() => number}
 */
export function createRng(seed) {
  let state = seed >>> 0

  return function next() {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

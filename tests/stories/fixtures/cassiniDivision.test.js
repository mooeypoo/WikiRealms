import { describe, expect, it } from 'vitest'
import { GRID } from '../../../src/engine/generation/config.js'
import { generateWorld } from '../../../src/engine/generation/world.js'
import {
  cassiniDivisionArticle,
  cassiniDivisionHtml,
  cassiniDivisionWorld,
} from '../../../stories/fixtures/cassiniDivision.js'

/**
 * The story fixture is the only realm Storybook ever renders, and Storybook
 * itself cannot run in CI here, so these tests are what keep the fixture
 * honest: that it still parses, still generates a world worth looking at, and
 * still exercises the range of the generator the stories claim to show.
 *
 * A fixture that quietly degrades to a featureless blob would leave every
 * story looking fine and showing nothing.
 */
describe('Cassini Division story fixture', () => {
  it('parses its outline through the real section parser', () => {
    const tree = cassiniDivisionArticle.sections

    expect(tree.sections).toHaveLength(7)
    expect(tree.citationCount).toBeGreaterThan(50)
    // Subtree sizes are the parser's, not hand-written: proof the fixture
    // goes through parseSectionTree rather than restating its output.
    expect(tree.totalSize).toBe(
      tree.lead.ownSize + tree.sections.reduce((sum, section) => sum + section.subtreeSize, 0),
    )
  })

  it('spans the weight range the terrain generator branches on', () => {
    const bySize = [...cassiniDivisionArticle.sections.sections].sort((a, b) => b.subtreeSize - a.subtreeSize)

    expect(bySize[0].title).toBe('Structure')
    expect(bySize.at(-1).title).toBe('In popular culture')
    // A heaviest range at least ten times the lightest, so peak height and
    // footprint extent visibly differ across the world.
    expect(bySize[0].subtreeSize / bySize.at(-1).subtreeSize).toBeGreaterThan(10)
    // Both the nested-ridge and the bare-peak paths are present.
    expect(bySize.some((section) => section.children.length > 0)).toBe(true)
    expect(bySize.some((section) => section.children.length === 0)).toBe(true)
  })

  it('generates a world with enough portals to navigate', () => {
    expect(cassiniDivisionWorld.terrain.width).toBe(GRID.width)
    expect(cassiniDivisionWorld.terrain.height).toBe(GRID.height)
    expect(cassiniDivisionWorld.terrain.peaks.length).toBeGreaterThan(0)
    expect(cassiniDivisionWorld.portals.length).toBeGreaterThan(10)
  })

  it('is byte-stable across regeneration apart from generatedAt', () => {
    const again = generateWorld(cassiniDivisionArticle, { now: () => '2026-09-04T00:00:00.000Z' })

    expect(again.seed).toBe(cassiniDivisionWorld.seed)
    expect(again.worldId).toBe(cassiniDivisionWorld.worldId)
    expect(Array.from(again.terrain.heightMap)).toEqual(Array.from(cassiniDivisionWorld.terrain.heightMap))
    expect(again.portals).toEqual(cassiniDivisionWorld.portals)
  })

  it('builds HTML the parser recognises as Parsoid output', () => {
    expect(cassiniDivisionHtml).toContain('rel="mw:WikiLink"')
    expect(cassiniDivisionHtml).toContain('<sup class="mw-ref">')
    // Nested <section> elements, so a parent's ownSize excludes its children.
    expect(cassiniDivisionHtml).toContain('<section><h3 id="Early_observations">')
  })
})

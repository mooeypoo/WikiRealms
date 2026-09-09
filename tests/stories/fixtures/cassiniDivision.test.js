import { describe, expect, it } from 'vitest'
import { GRID } from '../../../src/engine/generation/config.js'
import { frostCover } from '../../../src/engine/generation/terrain.js'
import { generateWorld } from '../../../src/engine/generation/world.js'
import { scatterFoliage } from '../../../src/ui/rendering/foliageScatter.js'
import { flatProjection } from '../../../src/ui/rendering/projection.js'
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

  it('grows trees high enough to actually carry snow', () => {
    // The regression this exists for: snow on crowns shipped correct and
    // invisible. The shader worked, the attribute was right, the unit
    // tests passed — and on this world exactly 0 of 517 trees stood
    // anywhere a cap would be drawn, because the treeline ended at 0.86
    // and the ground's snow band did not begin in earnest until well
    // above it. Every test asked whether the mechanism worked. None
    // asked whether anything reached it.
    //
    // So this one counts pixels-worth of effect on a real world, which
    // is the only kind of assertion that could have failed back then.
    const terrain = cassiniDivisionWorld.terrain
    const { canopy } = scatterFoliage(terrain, cassiniDivisionWorld.seed, {
      projection: flatProjection,
      heightScale: flatProjection.heightScale(terrain),
      cellScale: 1,
    })

    const heights = canopy.flatMap((layer) => Array.from(layer.heights))
    const capped = heights.filter((height) => frostCover(height) > 0.25)

    expect(heights.length).toBeGreaterThan(100)
    // 38 at the time of writing. The floor is low enough to survive the
    // fixture's prose being edited and high enough that a band change
    // which quietly re-strands the effect fails here.
    expect(capped.length).toBeGreaterThan(15)
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
    expect(cassiniDivisionHtml).toContain('typeof="mw:Extension/ref"')
    // Nested <section> elements, so a parent's ownSize excludes its children.
    expect(cassiniDivisionHtml).toContain('<section><h3 id="Early_observations">')
  })

  it('emits the markup shapes the parser has to survive', () => {
    // The fixture used to emit one paragraph per section with EMPTY
    // citation markers, so it could not exhibit either sentence-counting
    // bug the parser was built against: a paragraph boundary swallowing
    // its last sentence, and a marker's own text hiding the full stop it
    // follows. A fixture that cannot produce those is not exercising the
    // parser.
    expect(cassiniDivisionHtml.match(/<p>/g).length).toBeGreaterThan(
      cassiniDivisionArticle.sections.sections.length,
    )
    expect(cassiniDivisionHtml).toContain('mw-reflink-text')
    // A marker landing directly after a full stop, which is where a
    // citation actually goes and what defeats a naive sentence pattern.
    expect(cassiniDivisionHtml).toMatch(/\.<sup/)
  })

  it('counts more sentences than it has paragraphs, so none were lost', () => {
    // The bug this guards: textContent runs "world.Next" together at a
    // block boundary, so every paragraph used to lose its last sentence.
    const tree = cassiniDivisionArticle.sections
    const paragraphs = cassiniDivisionHtml.match(/<p>/g).length

    expect(tree.sentenceCount).toBeGreaterThan(paragraphs)
  })
})

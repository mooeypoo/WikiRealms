import { describe, expect, it } from 'vitest'
import {
  createVisitGraph,
  goBack,
  jump,
  visit,
} from '../../../src/core/traversal/visitGraph.js'
import {
  buildTrailPostcard,
  expeditionPath,
  formatExpeditionPath,
  postcardStops,
} from '../../../src/ui/content/trailPostcard.js'

function sampleJourney() {
  let journey = jump(createVisitGraph(), 'Spacetime diagram')
  journey = visit(journey, 'Spacetime')
  journey = visit(journey, 'Physics')
  return journey
}

describe('expeditionPath', () => {
  it('follows history through the cursor, not layout order', () => {
    expect(expeditionPath(sampleJourney())).toEqual([
      'Spacetime diagram',
      'Spacetime',
      'Physics',
    ])
  })

  it('stops at the cursor when the viewer has gone back', () => {
    const journey = goBack(sampleJourney())
    expect(expeditionPath(journey)).toEqual(['Spacetime diagram', 'Spacetime'])
  })

  it('is empty before anywhere has been reached', () => {
    expect(expeditionPath(createVisitGraph())).toEqual([])
    expect(expeditionPath(null)).toEqual([])
  })
})

describe('formatExpeditionPath', () => {
  it('joins short trails with arrows', () => {
    expect(formatExpeditionPath(['A', 'B', 'C'])).toBe('A → B → C')
  })

  it('elides the middle of long trails', () => {
    const titles = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
    const formatted = formatExpeditionPath(titles, 6)
    expect(formatted).toContain('A →')
    expect(formatted).toContain('→ J')
    expect(formatted).toMatch(/…\d+ more…/)
    expect(formatted.split(' → ')).toHaveLength(6)
  })
})

describe('postcardStops', () => {
  it('keeps short trails intact for the graphic stack', () => {
    expect(postcardStops(['A', 'B', 'C'])).toEqual(['A', 'B', 'C'])
  })

  it('elides the middle as its own stop', () => {
    const titles = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
    expect(postcardStops(titles, 6)).toEqual(['A', 'B', 'C', '…5 more…', 'I', 'J'])
  })
})

describe('buildTrailPostcard', () => {
  const realmUrl = (title) => `https://example.test/?realm=${encodeURIComponent(title)}`

  it('returns null when there is nowhere to write from', () => {
    expect(buildTrailPostcard(createVisitGraph(), { realmUrl })).toBeNull()
  })

  it('requires a realm URL builder', () => {
    expect(() => buildTrailPostcard(sampleJourney())).toThrow(/realmUrl/)
  })

  it('builds a letter with route, counts, mission line, and a realm door', () => {
    const postcard = buildTrailPostcard(sampleJourney(), { realmUrl })

    expect(postcard.title).toBe('WikiRealms expedition')
    expect(postcard.url).toBe('https://example.test/?realm=Physics')
    expect(postcard.here).toBe('Physics')
    expect(postcard.stops).toEqual(['Spacetime diagram', 'Spacetime', 'Physics'])
    expect(postcard.text).toContain('Spacetime diagram → Spacetime → Physics')
    expect(postcard.text).toContain('3 realms')
    expect(postcard.text).toContain('2 portals')
    expect(postcard.text).toMatch(/Wikipedia/)
    expect(postcard.clipboardText).toContain(postcard.url)
    expect(postcard.clipboardText.startsWith(postcard.text)).toBe(true)
  })
})

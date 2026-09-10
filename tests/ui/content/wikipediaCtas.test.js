import { describe, expect, it } from 'vitest'
import { BIOME } from '../../../src/engine/generation/terrain.js'
import {
  CITE_CTA_BANDS,
  WIKIPEDIA_CTA_CONFIG,
  WIKIPEDIA_CTA_SURFACES,
  WIKIPEDIA_CTAS,
  buildArticleEditUrl,
  buildSectionViewUrl,
  fieldGuideCtaProse,
  isCiteCtaBand,
  resolveWikipediaCta,
} from '../../../src/ui/content/wikipediaCtas.js'

const ARTICLE = 'https://en.wikipedia.org/wiki/Test_Article'

describe('URL builders', () => {
  it('builds a section view URL with an anchor', () => {
    expect(buildSectionViewUrl(ARTICLE, 'History')).toBe(`${ARTICLE}#History`)
  })

  it('returns the article URL when there is no anchor', () => {
    expect(buildSectionViewUrl(ARTICLE)).toBe(ARTICLE)
    expect(buildSectionViewUrl('')).toBe('')
  })

  it('builds an edit URL from a /wiki/ fullurl', () => {
    expect(buildArticleEditUrl(ARTICLE)).toBe(
      'https://en.wikipedia.org/w/index.php?title=Test+Article&action=edit',
    )
  })

  it('decodes percent-encoded titles for the edit form', () => {
    expect(buildArticleEditUrl('https://en.wikipedia.org/wiki/Caf%C3%A9')).toBe(
      'https://en.wikipedia.org/w/index.php?title=Caf%C3%A9&action=edit',
    )
  })
})

describe('CITE_CTA_BANDS', () => {
  it('covers every band below this article’s average, and not Meadow+', () => {
    expect([...CITE_CTA_BANDS]).toEqual([BIOME.DUNES, BIOME.STEPPE, BIOME.LIGHT_VEG])
    expect(isCiteCtaBand(BIOME.MEADOW)).toBe(false)
    expect(isCiteCtaBand(BIOME.WOODLAND)).toBe(false)
    expect(isCiteCtaBand(BIOME.JUNGLE)).toBe(false)
  })
})

describe('resolveWikipediaCta', () => {
  it('returns null when the master switch is off', () => {
    const resolved = resolveWikipediaCta(
      WIKIPEDIA_CTA_SURFACES.LEDGER_DETAIL,
      { densityBand: BIOME.DUNES, anchor: 'A', articleUrl: ARTICLE },
      { config: { ...WIKIPEDIA_CTA_CONFIG, enabled: false } },
    )
    expect(resolved).toBeNull()
  })

  it('returns null when the CTA itself is disabled', () => {
    const disabled = WIKIPEDIA_CTAS.map((cta) =>
      cta.id === 'cite-below-average-section' ? { ...cta, enabled: false } : cta,
    )
    const resolved = resolveWikipediaCta(
      WIKIPEDIA_CTA_SURFACES.LEDGER_DETAIL,
      { densityBand: BIOME.DUNES, anchor: 'A', articleUrl: ARTICLE },
      { ctas: disabled },
    )
    expect(resolved).toBeNull()
  })

  it.each([
    [BIOME.DUNES, /seed/],
    [BIOME.STEPPE, /add citations/],
    [BIOME.LIGHT_VEG, /add citations/],
  ])('resolves cite CTA for below-average band %s on ledger.detail', (band, labelPattern) => {
    const resolved = resolveWikipediaCta(WIKIPEDIA_CTA_SURFACES.LEDGER_DETAIL, {
      densityBand: band,
      anchor: 'Early_life',
      sectionTitle: 'Early life',
      articleUrl: ARTICLE,
    })
    expect(resolved?.id).toBe('cite-below-average-section')
    expect(resolved?.label).toMatch(labelPattern)
    expect(resolved?.label).toContain('Early life')
    expect(resolved?.href).toBe(`${ARTICLE}#Early_life`)
  })

  it('resolves a tooltip notice for below-average peaks without an anchor', () => {
    const barren = resolveWikipediaCta(WIKIPEDIA_CTA_SURFACES.TOOLTIP_HINT, {
      densityBand: BIOME.DUNES,
    })
    expect(barren?.id).toBe('cite-below-average-section')
    expect(barren?.notice).toMatch(/Barren/)
    expect(barren?.notice).toMatch(/Ledger/)
    expect(barren?.href).toBeNull()
    expect(barren?.label).toBeNull()

    const sparse = resolveWikipediaCta(WIKIPEDIA_CTA_SURFACES.TOOLTIP_HINT, {
      densityBand: BIOME.STEPPE,
    })
    expect(sparse?.notice).toMatch(/Sparse/)
    expect(sparse?.notice).toMatch(/below/)
  })

  it('does not match cite CTA for average-or-better bands', () => {
    for (const band of [BIOME.MEADOW, BIOME.WOODLAND, BIOME.JUNGLE]) {
      expect(
        resolveWikipediaCta(WIKIPEDIA_CTA_SURFACES.LEDGER_DETAIL, {
          densityBand: band,
          anchor: 'A',
          articleUrl: ARTICLE,
        }),
      ).toBeNull()
    }
  })

  it('does not match cite CTA for aggregate rows', () => {
    expect(
      resolveWikipediaCta(WIKIPEDIA_CTA_SURFACES.LEDGER_DETAIL, {
        densityBand: BIOME.DUNES,
        anchor: 'A',
        isAggregate: true,
        articleUrl: ARTICLE,
      }),
    ).toBeNull()
  })

  it('resolves grow-small-realm only when both caps are met', () => {
    const small = resolveWikipediaCta(WIKIPEDIA_CTA_SURFACES.LEDGER_FOOTER, {
      articleUrl: ARTICLE,
      wordCount: 400,
      sectionCount: 3,
    })
    expect(small?.id).toBe('grow-small-realm')
    expect(small?.eyebrow).toBe('Field task')
    expect(small?.notice).toMatch(/flooding/)
    expect(small?.label).toMatch(/Enlarge the map/)
    expect(small?.href).toContain('action=edit')

    expect(
      resolveWikipediaCta(WIKIPEDIA_CTA_SURFACES.LEDGER_FOOTER, {
        articleUrl: ARTICLE,
        wordCount: 400,
        sectionCount: 12,
      }),
    ).toBeNull()

    expect(
      resolveWikipediaCta(WIKIPEDIA_CTA_SURFACES.LEDGER_FOOTER, {
        articleUrl: ARTICLE,
        wordCount: 5000,
        sectionCount: 2,
      }),
    ).toBeNull()
  })

  it('frames cite CTAs on the Ledger as field tasks', () => {
    const resolved = resolveWikipediaCta(WIKIPEDIA_CTA_SURFACES.LEDGER_DETAIL, {
      densityBand: BIOME.DUNES,
      anchor: 'Early_life',
      sectionTitle: 'Early life',
      articleUrl: ARTICLE,
    })
    expect(resolved?.eyebrow).toBe('Field task')
    expect(resolved?.notice).toMatch(/no references/)
    expect(resolved?.label).toMatch(/seed/)
  })

  it('waits for real portal hops before inviting stewardship on the Trail', () => {
    expect(
      resolveWikipediaCta(WIKIPEDIA_CTA_SURFACES.TRAIL_FOOTER, { portalHops: 2 }),
    ).toBeNull()

    const ready = resolveWikipediaCta(WIKIPEDIA_CTA_SURFACES.TRAIL_FOOTER, {
      portalHops: WIKIPEDIA_CTA_CONFIG.stewardship.minPortalHops,
    })
    expect(ready?.id).toBe('trail-stewardship')
    expect(ready?.prose).toContain('donate.wikimedia.org')
    expect(ready?.prose).toContain('Help:Introduction')
  })

  it('resolves stale-realm-nudge only when stale', () => {
    expect(
      resolveWikipediaCta(WIKIPEDIA_CTA_SURFACES.LEDGER_HEADER, {
        stale: true,
        articleUrl: ARTICLE,
      })?.id,
    ).toBe('stale-realm-nudge')

    expect(
      resolveWikipediaCta(WIKIPEDIA_CTA_SURFACES.LEDGER_HEADER, {
        stale: false,
        articleUrl: ARTICLE,
      }),
    ).toBeNull()
  })

  it('picks the lower-priority CTA when several match the same surface', () => {
    const ctas = [
      {
        id: 'later',
        enabled: true,
        surfaces: ['test'],
        priority: 50,
        match: () => true,
        label: () => 'later',
        href: () => 'https://example.com/later',
      },
      {
        id: 'earlier',
        enabled: true,
        surfaces: ['test'],
        priority: 10,
        match: () => true,
        label: () => 'earlier',
        href: () => 'https://example.com/earlier',
      },
    ]
    expect(resolveWikipediaCta('test', {}, { ctas })?.id).toBe('earlier')
  })
})

describe('fieldGuideCtaProse', () => {
  it('returns the sticky footer contribute strip', () => {
    const footer = fieldGuideCtaProse(WIKIPEDIA_CTA_SURFACES.FIELD_GUIDE_FOOTER)
    expect(footer).toContain('Help:Introduction')
    expect(footer).toContain('donate.wikimedia.org')
    expect(footer).toContain('Become an editor')
    expect(footer).toContain('Donate')
    expect(footer).toMatch(/Barren slopes|citations/i)
  })
})

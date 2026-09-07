import { describe, expect, it } from 'vitest'
import { parseSectionTree } from '../../../src/core/article/parseSectionTree.js'

function html(sectionsHtml) {
  return `<html><body>${sectionsHtml}</body></html>`
}

describe('parseSectionTree', () => {
  it('captures the lead section separately from headed sections', () => {
    const { lead } = parseSectionTree(
      html(`
        <section data-mw-section-id="0" id="mwAQ">
          <p>Lead text with a <a rel="mw:WikiLink" href="./Pet">link</a>.</p>
        </section>
      `),
    )

    expect(lead.links).toEqual(['Pet'])
    expect(lead.ownSize).toBeGreaterThan(0)
  })

  it('builds a flat list of top-level sections in document order', () => {
    const { sections } = parseSectionTree(
      html(`
        <section data-mw-section-id="1"><h2 id="Purpose">Purpose</h2><p>Purpose text.</p></section>
        <section data-mw-section-id="2"><h2 id="Features">Features</h2><p>Features text.</p></section>
      `),
    )

    expect(sections.map((s) => s.title)).toEqual(['Purpose', 'Features'])
    expect(sections.every((s) => s.depth === 1)).toBe(true)
    expect(sections.every((s) => s.children.length === 0)).toBe(true)
  })

  it('nests a deeper heading under the preceding shallower heading', () => {
    const { sections } = parseSectionTree(
      html(`
        <section data-mw-section-id="1"><h2 id="Features">Features</h2><p>Features text.</p></section>
        <section data-mw-section-id="2"><h3 id="SubFeature">Sub Feature</h3><p>Sub text.</p></section>
        <section data-mw-section-id="3"><h2 id="History">History</h2><p>History text.</p></section>
      `),
    )

    expect(sections).toHaveLength(2)
    expect(sections[0].title).toBe('Features')
    expect(sections[0].children).toHaveLength(1)
    expect(sections[0].children[0].title).toBe('Sub Feature')
    expect(sections[0].children[0].depth).toBe(2)
    expect(sections[1].title).toBe('History')
    expect(sections[1].children).toHaveLength(0)
  })

  it('reads subsections nested inside REST section elements', () => {
    const { sections } = parseSectionTree(
      html(`
        <section data-mw-section-id="1"><h2 id="Life">Life</h2><p>Life text.</p>
          <section data-mw-section-id="2"><h3 id="Youth">Youth</h3><p>Youth text.</p></section>
          <section data-mw-section-id="3"><h3 id="Career">Career</h3><p>Career text.</p></section>
        </section>
      `),
    )

    expect(sections).toHaveLength(1)
    expect(sections[0].children.map((section) => section.title)).toEqual(['Youth', 'Career'])
  })

  it('computes subtreeSize as own size plus all descendant sizes', () => {
    const { sections } = parseSectionTree(
      html(`
        <section data-mw-section-id="1"><h2 id="Features">Features</h2><p>abcde</p></section>
        <section data-mw-section-id="2"><h3 id="Sub">Sub</h3><p>abcdefghij</p></section>
      `),
    )

    const [features] = sections
    const [sub] = features.children

    expect(sub.subtreeSize).toBe(sub.ownSize)
    expect(features.subtreeSize).toBe(features.ownSize + sub.subtreeSize)
  })

  it('measures nested REST section prose only in the nested subsection', () => {
    const { sections } = parseSectionTree(
      html(`
        <section data-mw-section-id="1"><h2 id="Parent">Parent</h2><p>parent prose</p>
          <section data-mw-section-id="2"><h3 id="Child">Child</h3><p>child prose is much longer</p></section>
        </section>
      `),
    )

    const [parent] = sections
    expect(parent.ownSize).toBe('Parentparent prose'.length)
    expect(parent.children[0].ownSize).toBe('Childchild prose is much longer'.length)
  })

  it('excludes non-prose content (citation lists) from ownSize', () => {
    const { sections } = parseSectionTree(
      html(`
        <section data-mw-section-id="1">
          <h2 id="Body">Body</h2>
          <p>short</p>
          <div class="mw-references-wrap"><ol><li>a very long citation blob that should not count</li></ol></div>
        </section>
      `),
    )

    // "short" plus the heading text, not the long citation blob
    expect(sections[0].ownSize).toBeLessThan(30)
  })

  it('extracts unique internal wiki links, excluding non-article namespaces', () => {
    const { sections } = parseSectionTree(
      html(`
        <section data-mw-section-id="1">
          <h2 id="Body">Body</h2>
          <p>
            <a rel="mw:WikiLink" href="./Physics">Physics</a>
            <a rel="mw:WikiLink" href="./Physics">Physics again</a>
            <a rel="mw:WikiLink" href="./Category:Science">a category</a>
          </p>
        </section>
      `),
    )

    expect(sections[0].links).toEqual(['Physics'])
  })

  it('ignores red links, which point at an article nobody has written', () => {
    // Reported from a real world: a portal labelled
    // "Politics South?action=edit&redlink=1". Two bugs in one — the portal
    // led to a page that does not exist, and the query string was being
    // read as part of the title because only "#" was stripped.
    const { sections } = parseSectionTree(
      html(`
        <section data-mw-section-id="1">
          <h2 id="Body">Body</h2>
          <p>
            <a rel="mw:WikiLink" href="./Physics">Physics</a>
            <a rel="mw:WikiLink" href="./Politics_South?action=edit&amp;redlink=1"
               class="new" title="Politics South (page does not exist)">Politics South</a>
          </p>
        </section>
      `),
    )

    expect(sections[0].links).toEqual(['Physics'])
  })

  it('drops a query-string href even when class="new" is missing', () => {
    // The two signals are independent, and the href is the one that
    // produced the garbled title.
    const { sections } = parseSectionTree(
      html(`
        <section data-mw-section-id="1">
          <h2 id="Body">Body</h2>
          <p><a rel="mw:WikiLink" href="./Politics_South?action=edit&amp;redlink=1">Politics South</a></p>
        </section>
      `),
    )

    expect(sections[0].links).toEqual([])
  })

  it('keeps a title that really does end in a question mark', () => {
    // %3F is a "?" in the name; a bare "?" is a query. Rejecting the wrong
    // one would quietly delete portals to real articles.
    const { sections } = parseSectionTree(
      html(`
        <section data-mw-section-id="1">
          <h2 id="Body">Body</h2>
          <p><a rel="mw:WikiLink" href="./Who_Framed_Roger_Rabbit%3F">film</a></p>
        </section>
      `),
    )

    expect(sections[0].links).toEqual(['Who Framed Roger Rabbit?'])
  })

  it('ignores citation backlinks and external links, not just categories', () => {
    const { sections } = parseSectionTree(
      html(`
        <section data-mw-section-id="1">
          <h2 id="Body">Body</h2>
          <p>
            Text<sup><a href="./Body#cite_note-1" rel="mw:referencedBy">1</a></sup>
            <a href="https://example.com" rel="mw:ExtLink nofollow">external</a>
          </p>
        </section>
      `),
    )

    expect(sections[0].links).toEqual([])
  })

  it('counts in-text citation markers and normalizes them by section prose', () => {
    const { lead, sections } = parseSectionTree(
      html(`
        <section data-mw-section-id="0"><p>Longer lead prose<sup class="reference"><a href="./X#cite_note-1">1</a></sup></p></section>
        <section data-mw-section-id="1"><h2 id="Body">Body</h2><p>Text<sup class="reference"><a href="./X#cite_note-2">2</a></sup><sup class="reference"><a href="./X#cite_note-3">3</a></sup></p></section>
      `),
    )

    expect(lead.citationCount).toBe(1)
    expect(sections[0].citationCount).toBe(2)
    expect(sections[0].citationDensity).toBeGreaterThan(lead.citationDensity)
  })

  it('counts every paragraph’s last sentence, which textContent runs together', () => {
    const { sections } = parseSectionTree(
      html(`
        <section data-mw-section-id="1"><h2 id="Body">Body</h2>
          <p>First paragraph ends here.</p><p>Second one ends here.</p><p>Third one ends here.</p>
        </section>
      `),
    )

    expect(sections[0].sentenceCount).toBe(3)
  })

  it('measures a list-only section by its items rather than reporting no sentences', () => {
    const { sections } = parseSectionTree(
      html(`
        <section data-mw-section-id="1"><h2 id="Films">Films</h2>
          <ul><li>Alpha film</li><li>Beta film</li><li>Gamma film</li></ul>
          <p>Every entry is sourced.<sup class="reference"><a>1</a></sup></p>
        </section>
      `),
    )

    // Measured before the fix: sentenceCount 0, so citationsPerSentence
    // was 0 and the section rendered as barren whatever it cited.
    expect(sections[0].sentenceCount).toBe(4)
    expect(sections[0].citationsPerSentence).toBeCloseTo(0.25)
  })

  it('keeps ownSize a count of prose characters, not of block separators', () => {
    const { sections } = parseSectionTree(
      html(`<section data-mw-section-id="1"><h2 id="B">B</h2><p>One.</p><p>Two.</p></section>`),
    )

    // "B" + "One." + "Two." — the newlines the sentence counter needs are
    // not prose and must not inflate the height signal.
    expect(sections[0].ownSize).toBe(9)
  })

  it('keeps nested-section citations out of the parent count and totals them for the article', () => {
    const { sections, citationCount } = parseSectionTree(
      html(`
        <section data-mw-section-id="1"><h2 id="Parent">Parent</h2><p>Parent<sup class="reference"><a>1</a></sup></p>
          <section data-mw-section-id="2"><h3 id="Child">Child</h3><p>Child<sup class="reference"><a>2</a></sup></p></section>
        </section>
      `),
    )

    expect(sections[0].citationCount).toBe(1)
    expect(sections[0].children[0].citationCount).toBe(1)
    expect(sections[0].subtreeCitationCount).toBe(2)
    expect(sections[0].children[0].subtreeCitationCount).toBe(1)
    expect(citationCount).toBe(2)
  })

  it('counts either supported inline citation marker form exactly once', () => {
    const { sections } = parseSectionTree(
      html(`
        <section data-mw-section-id="1"><h2 id="Body">Body</h2><p>
          <sup class="reference">1</sup><sup class="mw-ref">2</sup><sup typeof="mw:Extension/ref">3</sup>
        </p></section>
      `),
    )

    expect(sections[0].citationCount).toBe(3)
  })

  it('excludes known boilerplate section titles entirely, case-insensitively', () => {
    const { sections, totalSize } = parseSectionTree(
      html(`
        <section data-mw-section-id="1"><h2 id="Body">Body</h2><p>real content</p></section>
        <section data-mw-section-id="2"><h2 id="References">REFERENCES</h2><p>citation junk</p></section>
      `),
    )

    expect(sections.map((s) => s.title)).toEqual(['Body'])
    expect(totalSize).toBe(sections[0].subtreeSize)
  })

  it('stores the heading id as the section anchor', () => {
    const { sections } = parseSectionTree(
      html(`<section data-mw-section-id="1"><h2 id="Early_life">Early life</h2><p>text</p></section>`),
    )

    expect(sections[0].anchor).toBe('Early_life')
  })
})

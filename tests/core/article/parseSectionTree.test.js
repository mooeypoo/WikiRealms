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

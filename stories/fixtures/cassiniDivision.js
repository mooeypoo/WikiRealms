import { parseSectionTree } from '../../src/core/article/parseSectionTree.js'
import { generateWorld } from '../../src/engine/generation/world.js'
import { buildParsoidHtml, prose } from './parsoidHtml.js'

/**
 * The fixture realm every world story renders.
 *
 * Chosen to exercise the generator rather than to be pretty: seven top-level
 * sections of unequal weight (so ranges differ in height and extent), nested
 * subsections on some and none on others (so both the ridge and the bare-peak
 * paths are drawn), citation counts spanning sparse to dense (so biomes span
 * desert through jungle), and enough distinct outbound links to place a
 * useful number of portals.
 */
const outline = {
  lead: {
    sentences: 6,
    cites: 3,
    links: ['Saturn', 'Rings of Saturn', 'Giovanni Cassini'],
  },
  sections: [
    {
      title: 'Discovery',
      anchor: 'Discovery',
      sentences: 18,
      cites: 6,
      links: ['Giovanni Cassini', 'Paris Observatory'],
      children: [
        { title: 'Early observations', anchor: 'Early_observations', sentences: 9, cites: 2, links: ['Refracting telescope'] },
        { title: 'Naming', anchor: 'Naming', sentences: 5, cites: 1, links: [] },
      ],
    },
    {
      title: 'Structure',
      anchor: 'Structure',
      sentences: 34,
      cites: 9,
      links: ['A Ring', 'B Ring', 'Huygens Ringlet'],
      children: [
        { title: 'Inner edge', anchor: 'Inner_edge', sentences: 14, cites: 4, links: ['Orbital resonance'] },
        { title: 'Ringlets', anchor: 'Ringlets', sentences: 21, cites: 7, links: ['Optical depth'] },
        { title: 'Outer boundary', anchor: 'Outer_boundary', sentences: 11, cites: 3, links: [] },
        { title: 'Composition', anchor: 'Composition', sentences: 16, cites: 5, links: ['Water ice'] },
      ],
    },
    {
      title: 'Ring dynamics',
      anchor: 'Ring_dynamics',
      sentences: 26,
      cites: 5,
      links: ['Density wave', 'Mimas', 'Orbital resonance'],
      children: [{ title: 'Resonances', anchor: 'Resonances', sentences: 12, cites: 4, links: ['Mimas'] }],
    },
    {
      title: 'Exploration',
      anchor: 'Exploration',
      sentences: 22,
      cites: 4,
      links: ['Voyager 1', 'Voyager 2', 'Cassini–Huygens'],
      children: [
        { title: 'Voyager era', anchor: 'Voyager_era', sentences: 10, cites: 2, links: ['Voyager 2'] },
        { title: 'Cassini mission', anchor: 'Cassini_mission', sentences: 19, cites: 6, links: ['Cassini–Huygens', 'Grand Finale'] },
      ],
    },
    // Deliberately light: a stub-weight section, to prove small ranges still
    // read as land rather than vanishing under the waterline.
    { title: 'Visibility from Earth', anchor: 'Visibility_from_Earth', sentences: 7, cites: 1, links: ['Amateur astronomy'] },
    { title: 'In popular culture', anchor: 'In_popular_culture', sentences: 4, cites: 0, links: [] },
    {
      title: 'Comparison with other gaps',
      anchor: 'Comparison_with_other_gaps',
      sentences: 15,
      cites: 3,
      links: ['Encke Gap', 'Keeler Gap', 'Roche Division'],
    },
  ],
}

export const cassiniDivisionHtml = buildParsoidHtml(outline)

export const cassiniDivisionArticle = {
  articleId: 'en:1129051',
  title: 'Cassini Division',
  language: 'en',
  pageId: 1129051,
  url: 'https://en.wikipedia.org/wiki/Cassini_Division',
  namespace: 0,
  latestRevisionId: 1183920477,
  latestRevisionTimestamp: '2026-07-18T09:14:03Z',
  summary: `The Cassini Division is a 4,800-kilometre-wide region between Saturn's A Ring and B Ring, named for Giovanni Cassini, who observed it in 1675. ${prose(3)}`,
  categories: ['Rings of Saturn', 'Astronomical objects discovered in 1675'],
  links: [],
  images: [],
  pageviews: null,
  sectionCount: null,
  sections: parseSectionTree(cassiniDivisionHtml),
}

// `links` at the article level mirrors what the section tree exposes, the way
// the real adapter's response does.
cassiniDivisionArticle.links = Array.from(
  new Set([
    ...cassiniDivisionArticle.sections.lead.links,
    ...collectSectionLinks(cassiniDivisionArticle.sections.sections),
  ]),
)

function collectSectionLinks(sections) {
  return sections.flatMap((section) => [...section.links, ...collectSectionLinks(section.children ?? [])])
}

/**
 * The generated world. `now` is pinned so the fixture is byte-identical
 * between runs — the world is already deterministic in everything else,
 * `generatedAt` being the sole exception.
 */
export const cassiniDivisionWorld = generateWorld(cassiniDivisionArticle, {
  now: () => '2026-09-04T00:00:00.000Z',
})

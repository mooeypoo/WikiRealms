<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import Icon from '../design/Icon.vue'
import Sheet from '../design/Sheet.vue'
import { prefersReducedMotion } from '../design/prefersReducedMotion.js'
import { LEDGER_SNAP_POINTS as SNAP_POINTS, LEDGER_STATES as STATES } from './ledgerStates.js'
import { LUSHNESS_BANDS, lushnessBand } from '../../engine/generation/terrain.js'
import { describeBand } from '../content/lushnessBands.js'
import { buildSectionRows } from '../rendering/sectionRows.js'
import {
  estimateWordCount,
  formatCount,
  formatPageviews,
  formatPortals,
  formatSources,
  formatSubsections,
  formatWords,
} from '../rendering/sectionStats.js'

/**
 * What this place is.
 *
 * Fourth on the priority ladder (docs/ux-vision.md §3) and the one surface
 * whose depth the viewer chooses. The panel it replaces had a single binary
 * — a title bar, or a 60vh scroller — so there was no way to read a little
 * and still see the world, which is most of what someone actually wants
 * while turning a planet around.
 *
 * Four states. `collapsed` is a bar, not an absence (§4.2): this surface is
 * persistent, so closing it outright would take its own way back with it.
 */
const props = defineProps({
  article: { type: Object, required: true },
  world: { type: Object, default: null },
  /** collapsed | peek | open | full */
  state: { type: String, default: 'open' },
  /** The article has a newer revision than when its world was generated. */
  stale: { type: Boolean, default: false },
  /**
   * Peaks-array index of the selected section, or null.
   *
   * A peak index rather than a heading anchor, because it names every row
   * the list can hold and an anchor does not: the synthetic aggregate
   * range has no heading on Wikipedia, so under the old anchor-keyed
   * scheme clicking that mountain did nothing at all.
   */
  selectedPeak: { type: Number, default: null },
})

const emit = defineEmits(['update:state', 'share', 'select'])

/**
 * Below this many rows the whole tree is shown expanded, above it every
 * range starts closed.
 *
 * Neither default is right for both shapes of article. A six-section
 * article collapsed is a list that hides most of itself for no reason; a
 * sixteen-range article with every summit showing is eighty rows in a
 * panel that is 42dvh at `open`. The threshold is roughly what fits in
 * `full` on a phone without the list becoming a scroll for its own sake.
 */
const AUTO_EXPAND_LIMIT = 24

const body = ref(null)
const summaryExpanded = ref(false)

const snap = computed(() => Math.max(0, STATES.indexOf(props.state) - 1))

/**
 * The list is built from the WORLD, not from the parsed article — see
 * sectionRows.js for why those are different trees and which one the
 * reader is actually looking at.
 */
const model = computed(() => buildSectionRows(props.article, props.world))
const rows = computed(() => model.value.rows)

const stats = computed(() => [
  { label: 'Sections', value: countSections(props.article.sections) },
  { label: 'Citations', value: props.article.sections?.citationCount ?? 0 },
  { label: 'Portals', value: props.world?.portals?.length ?? 0, accent: true },
  // Was "Links", which read 500 for almost every article — that being the
  // API's page limit for an anonymous request, which nothing here follows
  // past. A number that describes our query rather than the article has no
  // business in an instrument panel, and sitting beside Portals it invited
  // a comparison between two things that are not comparable.
  //
  // Words is uncapped, is a fact about the article, and is the one the
  // world visibly answers to: length is what sets the waterline.
  { label: 'Words', value: compactCount(estimateWordCount(props.article.sections?.totalSize ?? 0)) },
  // 30-day user pageviews from AQS — how busy the article is. Drives how
  // many creatures roam the realm; shown here so that signal is readable.
  { label: 'Views', value: formatPageviews(props.article.pageviews) },
])

/**
 * Bare compact number for a readout tile, which carries its own label and
 * is too narrow for "12,345 words". The section rows below spell counts
 * out instead, because there the number has to say what it counts.
 */
function compactCount(count) {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count)
}

function countSections(tree) {
  if (!tree?.sections) return 0
  const count = (nodes) => nodes.reduce((total, node) => total + 1 + count(node.children ?? []), 0)
  return count(tree.sections)
}

function setState(next) {
  if (next !== props.state) emit('update:state', next)
}

function onSnap(index) {
  setState(STATES[index + 1])
}

/** The chevron steps through the states rather than jumping to an extreme. */
function step(direction) {
  const index = STATES.indexOf(props.state)
  setState(STATES[Math.min(STATES.length - 1, Math.max(0, index + direction))])
}

/* ── the list ──────────────────────────────────────────────────────────── */

/**
 * Which ranges are open, as deviations from the default rather than as
 * the state itself — so the default can change with the article without
 * having to be rebuilt, and so an expansion the reader chose survives a
 * selection that would otherwise have closed it.
 */
const expansion = ref(new Map())
const expandedByDefault = computed(() => model.value.count <= AUTO_EXPAND_LIMIT)

function isExpanded(row) {
  if (row.children.length === 0) return false
  return expansion.value.get(row.key) ?? expandedByDefault.value
}

function toggle(row) {
  const next = new Map(expansion.value)
  next.set(row.key, !isExpanded(row))
  expansion.value = next
}

/** The tree flattened to what is currently on screen, parents before children. */
const visibleRows = computed(() => {
  const out = []
  const walk = (list, hidden) => {
    for (const row of list) {
      if (!hidden) out.push(row)
      walk(row.children, hidden || !isExpanded(row))
    }
  }
  walk(rows.value, false)
  return out
})

const listSummary = computed(() => {
  const ranges = rows.value.length
  const summits = model.value.count - ranges
  const parts = [`${ranges} range${ranges === 1 ? '' : 's'}`]
  if (summits > 0) parts.push(`${summits} summit${summits === 1 ? '' : 's'}`)
  return parts.join(' · ')
})

/** The band a row's ground is painted in, or null when it has none. */
function bandFor(row) {
  if (!row.hasGround) return null
  return describeBand(lushnessBand(row.lushness))
}

/**
 * Where the meter's fill ends and where its tick sits, both as
 * percentages.
 *
 * The tick is the article's own average, and it is the whole point of
 * showing a bar rather than only a band name: six names cannot say
 * whether a section is a little above average or enormously above it,
 * and the scalar the engine computes knows. `average` is null for an
 * article that cites nothing, where there is no average to mark.
 */
function meterFor(row) {
  return {
    fill: `${Math.round(Math.min(1, Math.max(0, row.lushness ?? 0)) * 100)}%`,
    tick: model.value.average === null ? null : `${Math.round(model.value.average * 100)}%`,
  }
}

/**
 * "3 subsections", plus the range of their bands when they do not all
 * agree — "3 subsections, Sparse to Lush".
 *
 * Kept from when subsections had no rows of their own, because it is now
 * what a CLOSED range says about the summits it is hiding: a reader who
 * sees a lush patch inside an otherwise dry range needs to know there is
 * something in there worth opening.
 */
function subsectionSummary(row) {
  const label = formatSubsections(row.children.length)
  if (!label) return ''

  const bands = row.children.map(bandFor).filter(Boolean)
  if (bands.length < 2) return label

  const order = bands.map((band) => LUSHNESS_BANDS.indexOf(band.biome))
  const lowest = Math.min(...order)
  const highest = Math.max(...order)
  if (lowest === highest) return label

  const nameAt = (index) => describeBand(LUSHNESS_BANDS[index]).name
  return `${label}, ${nameAt(lowest)} to ${nameAt(highest)}`
}

/**
 * The sentences the opened row spells out.
 *
 * The list itself gives bare figures under column headings, which is what
 * makes forty rows scannable; this is where they are said in words, once,
 * for the one row being read. The old panel printed this for every row —
 * the same six comparison strings repeated down the page, a full line
 * each — which is how a list can be both sparse and heavy at once.
 */
function detailFor(row) {
  const facts = [formatWords(estimateWordCount(row.subtreeSize)), formatSources(row.refs, row.sentences)]
  // Only when the two differ. On a leaf they are the same number, and
  // printing "of which 520 its own" under "520 words" is noise.
  if (row.hasNestedProse) {
    facts.push(`${formatWords(estimateWordCount(row.ownSize))} of its own`)
  }
  facts.push(formatPortals(row.portals))
  if (!isExpanded(row)) facts.push(subsectionSummary(row))
  return facts.filter(Boolean)
}

/* ── selection ─────────────────────────────────────────────────────────── */

function isSelected(row) {
  return row.hasGround && row.peakIndex === props.selectedPeak
}

/** Clicking the selected row again clears it, so the map goes quiet too. */
function onRowClick(row) {
  emit('select', isSelected(row) ? null : row.peakIndex)
}

/** Ancestors of the row holding `peakIndex`, so a selection can open its way in. */
function ancestorsOf(peakIndex) {
  const trail = []
  const find = (list, path) => {
    for (const row of list) {
      if (row.peakIndex === peakIndex) {
        trail.push(...path)
        return true
      }
      if (find(row.children, [...path, row])) return true
    }
    return false
  }
  find(rows.value, [])
  return trail
}

watch(
  () => props.selectedPeak,
  async (peakIndex) => {
    if (peakIndex === null || peakIndex === undefined) return

    // A click on the map is a request to see the section, so the surface
    // opens far enough to show it, and the range it lives in opens too.
    if (props.state === 'collapsed' || props.state === 'peek') setState('open')
    const closed = ancestorsOf(peakIndex).filter((row) => !isExpanded(row))
    if (closed.length) {
      const next = new Map(expansion.value)
      for (const row of closed) next.set(row.key, true)
      expansion.value = next
    }

    // Twice: once for the expansion to render the row, once for the
    // state change to resize the surface around it. Scrolling before
    // either has laid out puts the row somewhere it is about to leave.
    await nextTick()
    await nextTick()
    body.value
      ?.querySelector(`[data-peak="${peakIndex}"]`)
      ?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' })
  },
)

watch(
  () => props.article,
  () => {
    summaryExpanded.value = false
    expansion.value = new Map()
    emit('select', null)
  },
)
</script>

<template>
  <Sheet
    id="ledger"
    :open="true"
    :modal="false"
    :dismissible="false"
    :collapsed="state === 'collapsed'"
    :snap-points="SNAP_POINTS"
    :snap="snap"
    :label="`About ${article.title}`"
    side="left"
    @update:snap="onSnap"
  >
    <!-- Minimised: a bar that names where you are and takes you back in. -->
    <template #collapsed>
      <button class="ledger__restore" type="button" @click="setState('peek')">
        <span class="ledger__restore-title">{{ article.title }}</span>
        <span class="ledger__restore-stats tabular">
          {{ stats[0].value }} · {{ stats[2].value }}
        </span>
        <Icon name="chevron-up" :size="16" />
      </button>
    </template>

    <template #header>
      <div class="ledger__head">
        <div class="ledger__identity">
          <h2 class="ledger__title">{{ article.title }}</h2>
          <p class="ledger__origin tabular">
            EN.WIKIPEDIA · REV {{ article.latestRevisionId }}
          </p>
        </div>

        <div class="ledger__controls">
          <span class="ledger__meter" :title="`Panel is ${state}`" aria-hidden="true">
            <span v-for="level in [1, 2, 3]" :key="level" :class="['ledger__bar', { 'is-on': snap + 1 === level }]" />
          </span>
          <button
            v-if="state !== 'full'"
            class="ledger__step"
            type="button"
            aria-label="Show more of this panel"
            @click="step(1)"
          >
            <Icon name="chevron-up" :size="16" />
          </button>
          <button class="ledger__step" type="button" aria-label="Show less of this panel" @click="step(-1)">
            <Icon name="chevron-down" :size="16" />
          </button>
        </div>
      </div>

      <p v-if="stale" class="ledger__stale">
        <Icon name="alert" :size="14" />
        Updated on Wikipedia since this world was made
      </p>

      <dl class="ledger__stats">
        <div v-for="stat in stats" :key="stat.label">
          <dt>{{ stat.label }}</dt>
          <dd class="tabular" :class="{ 'is-accent': stat.accent }">{{ stat.value }}</dd>
        </div>
      </dl>
    </template>

    <div ref="body" class="ledger__body">
      <template v-if="state !== 'peek'">
        <div v-if="article.summary" class="ledger__summary">
          <p :class="{ 'is-clamped': !summaryExpanded }">{{ article.summary }}</p>
          <button class="ledger__more" type="button" @click="summaryExpanded = !summaryExpanded">
            {{ summaryExpanded ? 'Show less' : 'Show more' }}
          </button>
        </div>
        <p v-else class="ledger__empty">No summary for this article.</p>

        <section v-if="rows.length" class="ledger__sections">
          <h3 class="ledger__sections-head">
            Sections
            <span class="tabular">{{ listSummary }}</span>
          </h3>

          <!-- One heading line for the whole list, so the rows can carry
               bare numbers. Forty rows each spelling out "1,240 words"
               is forty repetitions of a noun that only has to be said
               once, and it is what left no room for the figures that
               actually vary. -->
          <div class="ledger__columns" aria-hidden="true">
            <span>Range</span>
            <span>Words</span>
            <span>Refs</span>
            <span>Ground</span>
          </div>

          <ul class="ledger__list">
            <li v-for="row in visibleRows" :key="row.key" class="ledger__item">
              <div
                class="ledger__row"
                :class="{
                  'is-selected': isSelected(row),
                  'is-summit': row.depth > 1,
                  'is-groundless': !row.hasGround,
                }"
                :style="{ '--depth': row.depth - 1 }"
              >
                <button
                  v-if="row.children.length"
                  class="ledger__twist"
                  type="button"
                  :aria-expanded="isExpanded(row)"
                  :aria-label="`${isExpanded(row) ? 'Hide' : 'Show'} the summits in ${row.title}`"
                  @click="toggle(row)"
                >
                  <Icon :name="isExpanded(row) ? 'chevron-down' : 'chevron-right'" :size="13" />
                </button>
                <span v-else class="ledger__twist ledger__twist--empty" aria-hidden="true" />

                <!-- Ground is what makes a row a place. A folded section
                     has none — its prose raised the aggregate's height
                     and its citations coloured it, but no patch of the
                     map is its own — so it is stated rather than
                     offered, and cannot be selected or pointed at. -->
                <component
                  :is="row.hasGround ? 'button' : 'span'"
                  class="ledger__cells"
                  :type="row.hasGround ? 'button' : undefined"
                  :aria-pressed="row.hasGround ? isSelected(row) : undefined"
                  :data-peak="row.hasGround ? row.peakIndex : undefined"
                  @click="row.hasGround && onRowClick(row)"
                >
                  <span class="ledger__row-title">{{ row.title }}</span>
                  <span class="ledger__row-figure tabular">{{ formatCount(estimateWordCount(row.subtreeSize)) }}</span>
                  <span class="ledger__row-figure tabular">{{ formatCount(row.refs) }}</span>

                  <!-- The bar is the swatch. Two objects saying the same
                       thing cost a column the narrowest breakpoint does
                       not have, and the band name alone cannot say
                       whether a section is a little above its article's
                       average or enormously above it — which is most of
                       what the scalar knows and all of what the six
                       names throw away. -->
                  <span v-if="bandFor(row)" class="ledger__ground">
                    <span class="ledger__meter" aria-hidden="true">
                      <span
                        class="ledger__meter-fill"
                        :style="{ width: meterFor(row).fill, background: bandFor(row).swatch }"
                      />
                      <span
                        v-if="meterFor(row).tick"
                        class="ledger__meter-tick"
                        :style="{ left: meterFor(row).tick }"
                      />
                    </span>
                    <span class="ledger__band">{{ bandFor(row).name }}</span>
                  </span>
                  <span v-else class="ledger__ground ledger__ground--none">—</span>
                </component>
              </div>

              <!-- What the row means, for the one row being read. -->
              <div v-if="isSelected(row)" class="ledger__detail">
                <p v-if="row.isAggregate" class="ledger__detail-why">
                  Everything too small for a range of its own, gathered into one.
                </p>
                <p v-else-if="bandFor(row)" class="ledger__detail-why">
                  {{ bandFor(row).comparison }}
                </p>
                <p class="ledger__detail-stats">{{ detailFor(row).join(' · ') }}</p>
                <a
                  v-if="article.url && row.anchor"
                  class="ledger__link"
                  :href="`${article.url}#${row.anchor}`"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Read {{ row.title }}
                  <Icon name="external" :size="12" />
                </a>
              </div>
            </li>
          </ul>
        </section>
      </template>
    </div>

    <!-- Not at peek. That state is 16dvh, the header alone is most of it,
         and the footer was rendering below the fold — visible enough to
         look like a control and clipped enough to be unclickable, which is
         the worst of both. Peek is where you are and four readouts;
         actions belong with the content they act on. -->
    <template v-if="state !== 'peek'" #footer>
      <div class="ledger__footer">
        <a v-if="article.url" :href="article.url" target="_blank" rel="noopener noreferrer" class="ledger__link">
          View on Wikipedia
          <Icon name="external" :size="12" />
        </a>
        <button class="ledger__link" type="button" @click="$emit('share')">
          <Icon name="share" :size="13" />
          Share
        </button>
      </div>
    </template>
  </Sheet>
</template>

<style scoped>
.ledger__restore {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  width: 100%;
  min-height: var(--hit);
  padding: 0 var(--spacing-md);
  border: none;
  background: transparent;
  color: var(--ink-1);
  text-align: left;
}

.ledger__restore:hover {
  color: var(--accent);
}

.ledger__restore-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: var(--text-md);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ledger__restore-stats {
  color: var(--ink-3);
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
}

.ledger__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-md);
}

.ledger__identity {
  min-width: 0;
}

.ledger__title {
  margin: 0;
  font-size: var(--text-lg);
}

.ledger__origin {
  margin: 2px 0 0;
  color: var(--ink-3);
  font-size: 9px;
  letter-spacing: var(--tracking-label);
}

.ledger__controls {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

/* Three ascending bars: which of peek / open / full you are in. */
.ledger__meter {
  display: flex;
  align-items: flex-end;
  gap: 2px;
}

.ledger__bar {
  width: 3px;
  background: rgba(var(--edge-rgb), 0.28);
}

.ledger__bar:nth-child(1) { height: 5px; }
.ledger__bar:nth-child(2) { height: 9px; }
.ledger__bar:nth-child(3) { height: 13px; }

.ledger__bar.is-on {
  background: var(--accent);
}

.ledger__step {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--edge-hair);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-2);
}

.ledger__step:hover {
  border-color: var(--edge-accent);
  color: var(--accent);
}

.ledger__stale {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin: var(--spacing-sm) 0 0;
  color: var(--trail);
  font-size: var(--text-xs);
}

.ledger__stats {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--spacing-sm);
  margin: var(--spacing-md) 0 0;
  padding-top: var(--spacing-sm);
  border-top: 1px solid var(--edge-hair);
}

.ledger__stats div {
  display: grid;
  gap: 2px;
}

.ledger__stats dt {
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
}

.ledger__stats dd {
  margin: 0;
  color: var(--ink-1);
  font-size: 17px;
}

.ledger__stats dd.is-accent {
  color: var(--accent);
}

.ledger__body {
  display: grid;
  gap: var(--spacing-md);
}

.ledger__summary p {
  margin: 0;
  color: var(--ink-2);
  font-size: var(--text-sm);
  line-height: 1.55;
}

.ledger__summary p.is-clamped {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  overflow: hidden;
}

.ledger__more,
.ledger__link {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.ledger__more {
  margin-top: var(--spacing-sm);
}

.ledger__empty {
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-sm);
}

.ledger__sections-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 0 0 var(--spacing-sm);
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 400;
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
}

/* The four columns every row and the heading line share. The title
   takes what is left, so the figures and the ground stay in a straight
   column however long the headings are — which is what lets the list be
   read downwards instead of row by row. */
.ledger__columns,
.ledger__cells {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 3.4rem 2.2rem 6.6rem;
  align-items: center;
  gap: var(--spacing-sm);
}

.ledger__columns {
  padding: 0 0 3px 22px;
  border-bottom: 1px solid var(--edge-hair);
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
}

.ledger__columns span:nth-child(2),
.ledger__columns span:nth-child(3) {
  text-align: right;
}

.ledger__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.ledger__row {
  /* Nesting level, overridden per row inline. Declared here so a row
     always has one and the indent never resolves to nothing. */
  --depth: 0;

  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  align-items: center;
  border-bottom: 1px solid var(--edge-hair);
}

/* A summit is indented, but only its TITLE is — the figures and the
   meter stay where they were. Indenting the whole row would step the
   ground column in and out down the page and destroy the one thing the
   column is for. */
.ledger__row-title {
  padding-left: calc(var(--depth) * 13px);
  overflow: hidden;
  font-size: var(--text-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The rail that says these summits belong to the range above them. */
.ledger__row.is-summit .ledger__row-title {
  position: relative;
  color: var(--ink-2);
}

.ledger__row.is-summit .ledger__row-title::before {
  content: '';
  position: absolute;
  top: -6px;
  bottom: -6px;
  left: calc(var(--depth) * 13px - 7px);
  border-left: 1px solid var(--edge-hair);
}

.ledger__row.is-groundless .ledger__row-title,
.ledger__row.is-groundless .ledger__row-figure {
  color: var(--ink-3);
}

.ledger__twist {
  display: grid;
  place-items: center;
  width: 22px;
  height: 26px;
  padding: 0;
  border: none;
  background: none;
  color: var(--ink-3);
}

.ledger__twist:hover {
  color: var(--accent);
}

.ledger__cells {
  width: 100%;
  min-height: 26px;
  padding: 3px 0;
  border: none;
  background: none;
  color: var(--ink-1);
  font: inherit;
  text-align: left;
}

button.ledger__cells:hover .ledger__row-title {
  color: var(--accent);
}

.ledger__row.is-selected,
.ledger__detail {
  background: var(--accent-wash);
  box-shadow: inset 2px 0 0 var(--accent);
}

/* The detail belongs to the row above it, so the rule between them goes:
   with it there, the row and its own explanation read as two entries. */
.ledger__row.is-selected {
  border-bottom-color: transparent;
}

.ledger__row-figure {
  color: var(--ink-2);
  font-size: var(--text-xs);
  text-align: right;
}

.ledger__ground {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.ledger__ground--none {
  color: var(--ink-3);
}

.ledger__meter {
  position: relative;
  flex: none;
  width: 34px;
  height: 6px;
  border: 1px solid rgba(var(--edge-rgb), 0.28);
  border-radius: 1px;
}

.ledger__meter-fill {
  display: block;
  height: 100%;
}

/* This article's own average. Without it the bar is a quantity with no
   scale; with it, every bar in the list is read against the same mark. */
.ledger__meter-tick {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 1px;
  background: var(--ink-2);
}

.ledger__band {
  overflow: hidden;
  color: var(--ink-2);
  font-size: var(--text-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ledger__detail {
  padding: 2px var(--spacing-sm) var(--spacing-sm) 22px;
  border-bottom: 1px solid var(--edge-hair);
}

.ledger__detail-why {
  margin: 0;
  color: var(--ink-2);
  font-size: var(--text-xs);
  line-height: 1.45;
}

/* Deliberately NOT .tabular. That class sets font-family to the mono
   stack, which is right for a short run of digits in a column and wrong
   for a sentence: at the same 11px, monospace renders visibly wider and
   heavier than the body face, so this line read as a different and
   larger typeface than the one above it. */
.ledger__detail-stats {
  margin: 2px 0 0;
  color: var(--ink-3);
  font-size: var(--text-xs);
  line-height: 1.45;
  font-variant-numeric: tabular-nums;
}

.ledger__detail .ledger__link {
  margin-top: var(--spacing-sm);
}

/* Narrow: the band name goes and the meter carries the ground alone.
   Its fill is the colour of the ground itself, and the selected row
   spells the name out — so what is lost is a label, not a fact. */
@media (max-width: 479px) {
  .ledger__columns,
  .ledger__cells {
    grid-template-columns: minmax(0, 1fr) 3rem 2rem 2.4rem;
  }

  .ledger__columns span:nth-child(4) {
    font-size: 0;
  }

  .ledger__band {
    display: none;
  }
}

.ledger__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
}
</style>

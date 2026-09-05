<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import Icon from '../design/Icon.vue'
import Sheet from '../design/Sheet.vue'
import { LEDGER_SNAP_POINTS as SNAP_POINTS, LEDGER_STATES as STATES } from './ledgerStates.js'

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
  /** Anchor of a section to scroll to and flash, set by a click on the map. */
  focusedSection: { type: String, default: null },
})

const emit = defineEmits(['update:state', 'share'])


const body = ref(null)
const summaryExpanded = ref(false)

const snap = computed(() => Math.max(0, STATES.indexOf(props.state) - 1))
const sections = computed(() => props.article.sections?.sections ?? [])

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
  { label: 'Words', value: formatWords(Math.round((props.article.sections?.totalSize ?? 0) / 5.5)) },
])

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

function wordCount(section) {
  // The parser measures characters; ~5.5 per word is close enough for a
  // reading-length signal, and a precise count would imply precision the
  // measurement does not have.
  return Math.round((section.subtreeSize || section.ownSize || 0) / 5.5)
}

function formatWords(count) {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count)
}

/* ── focusing a section clicked on the map ─────────────────────────────── */

const FLASH_CLASS = 'ledger__section--flash'
let flashed = null
let flashTimer = null

watch(
  () => props.focusedSection,
  async (anchor) => {
    if (!anchor) return
    // A click on the map is a request to see the section, so the surface
    // opens far enough to show it before scrolling.
    if (props.state === 'collapsed' || props.state === 'peek') setState('open')

    await nextTick()
    // Matched rather than selected: a section anchor is Wikipedia's, so it
    // can hold characters a selector would need escaping for, and CSS.escape
    // is not everywhere (jsdom has none at all).
    const element = [...(body.value?.querySelectorAll('[data-anchor]') ?? [])].find(
      (candidate) => candidate.dataset.anchor === anchor,
    )
    if (!element) return

    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    flash(element)
  },
)

function flash(element) {
  clearTimeout(flashTimer)
  flashed?.classList.remove(FLASH_CLASS)

  element.classList.remove(FLASH_CLASS)
  void element.offsetWidth // restart the animation on a repeat click
  element.classList.add(FLASH_CLASS)
  flashed = element

  flashTimer = setTimeout(() => {
    element.classList.remove(FLASH_CLASS)
    flashed = null
  }, 1500)
}

onBeforeUnmount(() => clearTimeout(flashTimer))

watch(
  () => props.article,
  () => {
    summaryExpanded.value = false
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

        <section v-if="sections.length" class="ledger__sections">
          <h3 class="ledger__sections-head">
            Sections
            <span class="tabular">{{ sections.length }} ranges</span>
          </h3>

          <article
            v-for="section in sections"
            :key="section.anchor || section.title"
            :data-anchor="section.anchor || undefined"
            class="ledger__section"
          >
            <div class="ledger__section-head">
              <h4>{{ section.title }}</h4>
              <a
                v-if="article.url && section.anchor"
                :href="`${article.url}#${section.anchor}`"
                target="_blank"
                rel="noopener noreferrer"
                :aria-label="`Read ${section.title} on Wikipedia`"
              >
                <Icon name="external" :size="13" />
              </a>
            </div>
            <ul class="ledger__chips tabular">
              <li v-if="section.children?.length">{{ section.children.length }} sub</li>
              <li>{{ formatWords(wordCount(section)) }} w</li>
              <li v-if="(section.subtreeCitationCount ?? section.citationCount ?? 0) > 0">
                {{ section.subtreeCitationCount ?? section.citationCount }} c
              </li>
            </ul>
          </article>
        </section>
      </template>
    </div>

    <template #footer>
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
  grid-template-columns: repeat(4, minmax(0, 1fr));
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

.ledger__section {
  padding: var(--spacing-sm) 0;
  border-top: 1px solid var(--edge-hair);
  transition: background var(--dur-1) var(--ease-out);
}

.ledger__section--flash {
  background: var(--accent-wash);
  box-shadow: inset 2px 0 0 var(--accent);
}

.ledger__section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

.ledger__section-head h4 {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 400;
}

.ledger__section-head a {
  color: var(--ink-3);
}

.ledger__section-head a:hover {
  color: var(--accent);
}

.ledger__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
  margin: var(--spacing-xs) 0 0;
  padding: 0;
  list-style: none;
}

.ledger__chips li {
  padding: 1px 5px;
  border: 1px solid var(--edge-hair);
  border-radius: var(--radius-sm);
  color: var(--ink-2);
  font-size: 9px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.ledger__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
}
</style>

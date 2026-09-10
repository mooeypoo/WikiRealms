<script setup>
import { computed } from 'vue'
import Icon from '../design/Icon.vue'
import Sheet from '../design/Sheet.vue'
import { NODE_HEIGHT, NODE_WIDTH, layoutJourney } from '../rendering/trailLayout.js'
import {
  WIKIPEDIA_CTA_SURFACES,
  resolveWikipediaCta,
} from '../content/wikipediaCtas.js'

/**
 * The map of where you have been.
 *
 * It was a flat list, then an indented tree, and real journeys broke both:
 * a realm reached by two routes appeared twice, and a loop could not be
 * drawn at all. One node per realm now, with an edge for every portal
 * actually taken — which is what the app has claimed all along, since two
 * arrivals at one article generate the byte-identical world.
 *
 * SVG rather than the 3D scene. The third axis would carry no information
 * for a graph like this; titles have to stay real, selectable text; and a
 * canvas is opaque to a screen reader, which is the wrong trade for the
 * one panel that exists to navigate. The node list beneath the map is not
 * a fallback — it is how this is read without a pointer.
 */
const props = defineProps({
  show: Boolean,
  graph: { type: Object, default: null },
  canShare: { type: Boolean, default: false },
})

const emit = defineEmits(['select', 'home', 'share', 'clear', 'export', 'import', 'close'])

function onFile(event) {
  const file = event.target.files?.[0]
  event.target.value = '' // let the same file be chosen again later
  if (file) emit('import', file)
}

const layout = computed(() => layoutJourney(props.graph))

const viewBox = computed(() => `0 0 ${layout.value.width} ${layout.value.height}`)

const nodeById = computed(() => new Map(layout.value.nodes.map((node) => [node.id, node])))

/** More than the realm underfoot — otherwise Clear would be a no-op. */
const canClear = computed(() => {
  const realms = layout.value.nodes.length
  const portals = props.graph?.edges?.length ?? 0
  const steps = props.graph?.history?.length ?? 0
  return realms > 1 || portals > 0 || steps > 1
})

/** Stewardship invite after a real walk — copy lives in wikipediaCtas. */
const stewardshipCta = computed(() =>
  resolveWikipediaCta(WIKIPEDIA_CTA_SURFACES.TRAIL_FOOTER, {
    portalHops: props.graph?.edges?.length ?? 0,
  }),
)

/**
 * A curve rather than a line, and a wide detour for an edge that runs back
 * up the ranks: a straight line between distant rows reads as a mistake,
 * where a bowed one reads as a return.
 */
function pathFor(link) {
  const from = nodeById.value.get(link.from)
  const to = nodeById.value.get(link.to)
  if (!from || !to) return ''

  const x1 = from.x + NODE_WIDTH / 2
  const y1 = from.y + NODE_HEIGHT
  const x2 = to.x + NODE_WIDTH / 2
  const y2 = to.y

  if (!link.isBackEdge) {
    const bend = (y2 - y1) / 2
    return `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`
  }

  const sweep = Math.max(70, Math.abs(y1 - y2) * 0.45)
  return `M ${x1} ${from.y} C ${x1 - sweep} ${from.y}, ${x2 - sweep} ${y2 + NODE_HEIGHT}, ${x2} ${y2 + NODE_HEIGHT}`
}
</script>

<template>
  <Sheet id="trail" :open="show" label="Your trail" :snap-points="[0.6, 0.92]" :snap="1" @close="$emit('close')">
    <template #header>
      <div class="trail__bar">
        <h2 class="trail__title">Your trail</h2>
        <span class="trail__count tabular">
          {{ layout.nodes.length }} realms · {{ layout.links.length }} portals
        </span>
      </div>
    </template>

    <p v-if="layout.nodes.length === 0" class="trail__empty">Nowhere yet.</p>

    <template v-else>
      <div class="trail__map">
        <!-- Hidden from assistive technology on purpose: the list below is
             the same map in a form a screen reader and a keyboard can walk,
             and exposing both would announce every realm twice. The shapes
             are a pointer affordance, so they take clicks but no tab stop. -->
        <svg :viewBox="viewBox" :width="layout.width" :height="layout.height" aria-hidden="true">
          <g class="trail__links">
            <path
              v-for="link in layout.links"
              :key="`${link.from}->${link.to}`"
              :d="pathFor(link)"
              :class="{ 'is-return': link.isBackEdge }"
            />
          </g>

          <g
            v-for="node in layout.nodes"
            :key="node.id"
            class="trail__node"
            :class="{
              'is-current': node.isCurrent,
              'is-junction': node.routesIn > 1,
              'is-start': node.isStart,
            }"
            @click="$emit('select', node.id)"
          >
            <!-- A cap on a realm nothing leads to: it was searched for, or
                 opened from a link. Unmarked, an unconnected box reads as a
                 drawing that failed rather than as a journey beginning. -->
            <line
              v-if="node.isStart"
              class="trail__cap"
              :x1="node.x + 10"
              :y1="node.y - 5"
              :x2="node.x + NODE_WIDTH - 10"
              :y2="node.y - 5"
            />
            <rect :x="node.x" :y="node.y" :width="NODE_WIDTH" :height="NODE_HEIGHT" rx="6" />
            <text :x="node.x + NODE_WIDTH / 2" :y="node.y + NODE_HEIGHT / 2 + 4">
              {{ node.title.length > 16 ? `${node.title.slice(0, 15)}…` : node.title }}
              <title>{{ node.title }}</title>
            </text>

            <!-- A count, not a heavier border. Two routes in and three
                 routes in are different facts, and a stroke width cannot
                 say which — nor can anyone read 1.5px against 2px. -->
            <g v-if="node.routesIn > 1" class="trail__badge">
              <circle :cx="node.x + NODE_WIDTH - 8" :cy="node.y" r="8" />
              <text :x="node.x + NODE_WIDTH - 8" :y="node.y + 3.5">{{ node.routesIn }}</text>
            </g>
          </g>
        </svg>
      </div>

      <p class="trail__key">
        <span><span class="trail__key-mark is-current" /> where you are</span>
        <span><span class="trail__key-mark is-junction" /> more than one way in</span>
        <span><span class="trail__key-mark is-start" /> searched for, not walked to</span>
      </p>

      <!-- The same map, reachable without a pointer. Ordered by rank so it
           reads down the way the drawing does. -->
      <ul class="trail__list">
        <li v-for="node in layout.nodes" :key="node.id">
          <button
            class="trail__stop"
            :class="{ 'trail__stop--current': node.isCurrent }"
            type="button"
            :aria-current="node.isCurrent ? 'true' : undefined"
            @click="$emit('select', node.id)"
          >
            <span class="trail__dot" :class="{ 'is-junction': node.routesIn > 1 }" />
            <span class="trail__name">{{ node.title }}</span>
            <!-- Independent facts: the realm you are standing in may well
                 be the one several routes led to, and that is the more
                 interesting half. -->
            <span v-if="node.routesIn > 1" class="trail__routes tabular">{{ node.routesIn }} ways in</span>
            <span v-else-if="node.isStart" class="trail__routes tabular">searched</span>
            <Icon v-if="node.isCurrent" name="crosshair" :size="13" class="trail__here" />
          </button>
        </li>
      </ul>
    </template>

    <!-- What you can do WITH a journey, on the panel that shows it. They
         were a separate "Journey" surface reached from its own button in
         the top bar, which put two things called the journey one click
         apart and spent a primary control on end-of-session actions. -->
    <template #footer>
      <div
        v-if="stewardshipCta?.prose"
        class="trail__stewardship"
        v-html="stewardshipCta.prose"
      />
      <div class="trail__actions">
        <button type="button" @click="$emit('home')">
          <Icon name="mark" :size="15" />
          <span>Somewhere new</span>
        </button>
        <button type="button" :disabled="!canShare" @click="$emit('share')">
          <Icon name="share" :size="15" />
          <span>Postcard</span>
        </button>
        <button type="button" :disabled="!canClear" @click="$emit('clear')">
          <Icon name="renew" :size="15" />
          <span>Clear trail</span>
        </button>
        <button type="button" @click="$emit('export')">
          <Icon name="download" :size="15" />
          <span>Save</span>
        </button>
        <label>
          <Icon name="upload" :size="15" />
          <span>Load</span>
          <input type="file" accept="application/json" @change="onFile" />
        </label>
      </div>
    </template>
  </Sheet>
</template>

<style scoped>
.trail__bar {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--spacing-md);
}

.trail__title {
  margin: 0;
  font-size: var(--text-lg);
}

.trail__count,
.trail__routes {
  color: var(--ink-3);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-label);
}

.trail__empty {
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-sm);
}

.trail__map {
  margin-bottom: var(--spacing-md);
  padding-bottom: var(--spacing-sm);
  overflow: auto;
  border-bottom: 1px solid var(--edge-hair);
}

.trail__links path {
  fill: none;
  stroke: rgba(var(--trail-rgb), 0.45);
  stroke-width: 1.2;
}

/* A loop closing. Dashed, because it is a return rather than a step. */
.trail__links path.is-return {
  stroke: rgba(var(--trail-rgb), 0.3);
  stroke-dasharray: 4 4;
}

.trail__node {
  cursor: pointer;
}

.trail__node:hover rect {
  fill: var(--surface-1-solid);
  stroke: var(--trail);
}

.trail__node:hover text {
  fill: var(--ink-1);
}

.trail__node rect {
  fill: var(--surface-2);
  stroke: rgba(var(--trail-rgb), 0.35);
  stroke-width: 1;
}

.trail__node text {
  fill: var(--ink-2);
  font-family: var(--font-body);
  font-size: 11px;
  text-anchor: middle;
}

/* The one you are standing in: filled, so it differs in KIND from every
   other node rather than by a stroke width nobody can measure by eye. */
.trail__node.is-current rect {
  fill: var(--trail);
  stroke: var(--trail);
}

.trail__node.is-current text {
  fill: var(--surface-void);
}

/* More than one route leads here — the thing a flat list could never show.
   Said with a number, because two ways in and five ways in are different
   facts and a border can only say "some". */
.trail__cap {
  stroke: rgba(var(--trail-rgb), 0.55);
  stroke-width: 2;
  stroke-linecap: round;
}

.trail__badge circle {
  fill: var(--trail);
  stroke: var(--surface-1-solid);
  stroke-width: 1.5;
}

.trail__badge text {
  fill: var(--surface-void);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  text-anchor: middle;
}

.trail__key {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-md);
  margin: 0 0 var(--spacing-sm);
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
}

.trail__key span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.trail__key-mark {
  width: 10px;
  height: 10px;
  border: 1px solid var(--trail);
  border-radius: 2px;
}

.trail__key-mark.is-current {
  background: var(--trail);
}

.trail__key-mark.is-junction {
  border-radius: 50%;
  background: var(--trail);
}

.trail__key-mark.is-start {
  height: 2px;
  border: none;
  border-radius: 1px;
  background: rgba(var(--trail-rgb), 0.55);
}

.trail__list {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.trail__stop {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  min-height: 34px;
  padding: 0 var(--spacing-sm);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-2);
  font: inherit;
  font-size: var(--text-sm);
  text-align: left;
}

.trail__stop:hover {
  background: rgba(var(--edge-rgb), 0.06);
  color: var(--ink-1);
}

.trail__dot {
  flex: none;
  width: 8px;
  height: 8px;
  border: 1px solid var(--trail);
  border-radius: 50%;
}

.trail__dot.is-junction {
  background: rgba(var(--trail-rgb), 0.45);
}

.trail__stop--current {
  color: var(--ink-1);
}

.trail__stop--current .trail__dot {
  background: var(--trail);
  box-shadow: 0 0 0 3px var(--trail-wash);
}

.trail__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trail__here {
  flex: none;
  color: var(--trail);
}

.trail__actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: var(--spacing-xs);
}

.trail__stewardship {
  margin: 0 0 var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  background: rgba(var(--accent-rgb), 0.14);
  border: 1px solid rgba(var(--accent-rgb), 0.28);
  color: var(--ink-2);
  font-size: var(--text-sm);
  line-height: 1.45;
}

.trail__stewardship :deep(.trail-cta__lead) {
  margin: 0 0 var(--spacing-xs);
}

.trail__stewardship :deep(.trail-cta__actions) {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.trail__stewardship :deep(a) {
  color: var(--accent);
  text-decoration: none;
}

.trail__stewardship :deep(a:hover) {
  text-decoration: underline;
}

.trail__stewardship :deep(.trail-cta__sep) {
  margin: 0 0.35em;
  color: var(--ink-3);
}

.trail__actions button,
.trail__actions label {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-height: var(--hit);
  padding: var(--spacing-sm) var(--spacing-xs);
  border: 1px solid var(--edge-hair);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-2);
  font: inherit;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
  cursor: pointer;
}

.trail__actions button:hover:not(:disabled),
.trail__actions label:hover {
  border-color: var(--edge-accent);
  color: var(--accent);
}

.trail__actions button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* The input covers its label, so the whole tile is the target. */
.trail__actions input[type='file'] {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
</style>

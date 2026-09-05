<script setup>
import { computed } from 'vue'
import Icon from '../design/Icon.vue'
import Sheet from '../design/Sheet.vue'
import { layoutTrail } from '../rendering/trailLayout.js'

/**
 * Everywhere you have been, and the way back to any of it.
 *
 * It showed a flat list — the path from the start to here — which is a lie
 * by omission the moment a journey forks. Going back and leaving a
 * different way is the thing the visit graph was built to remember, and it
 * was the one thing the panel could not show.
 *
 * Drawn like a commit graph: a gutter of lanes with a dot per stop, text
 * beside it. A journey tree IS a commit graph — one history that forks when
 * you double back — and the idiom is already legible to anyone who has seen
 * one. It stays a list, so it scrolls rather than needing pan and zoom, and
 * the rows stay real buttons for the keyboard and for a screen reader.
 */
const props = defineProps({
  show: Boolean,
  /** The visit graph itself, not a projection of it. */
  graph: { type: Object, default: null },
})

defineEmits(['select', 'close'])

const layout = computed(() => layoutTrail(props.graph))

/** A separator before each journey after the first. */
function startsAJourney(row, index) {
  return index > 0 && layout.value.rows[index - 1].journey !== row.journey
}
</script>

<template>
  <Sheet id="trail" :open="show" label="Your trail" :snap-points="[0.55, 0.9]" :snap="0" @close="$emit('close')">
    <template #header>
      <div class="trail__bar">
        <h2 class="trail__title">Your trail</h2>
        <span class="trail__count tabular">
          {{ layout.rows.length }}<template v-if="layout.journeys > 1"> · {{ layout.journeys }} journeys</template>
        </span>
      </div>
    </template>

    <p v-if="layout.rows.length === 0" class="trail__empty">Nowhere yet.</p>

    <ol v-else class="trail__list">
      <template v-for="(row, index) in layout.rows" :key="row.id">
        <li v-if="startsAJourney(row, index)" class="trail__break" aria-hidden="true" />

        <li>
          <button
            class="trail__stop"
            :class="{ 'trail__stop--current': row.isCurrent }"
            type="button"
            :aria-current="row.isCurrent ? 'true' : undefined"
            @click="$emit('select', row.id)"
          >
            <!-- The gutter: one lane per ancestor still carrying a branch,
                 then this stop's own elbow and dot. -->
            <span class="trail__gutter" aria-hidden="true">
              <span v-for="(carries, lane) in row.rails" :key="lane" class="trail__lane">
                <span v-if="carries" class="trail__through" />
              </span>

              <span v-if="row.depth > 0" class="trail__lane">
                <span class="trail__elbow" :class="{ 'trail__elbow--tee': !row.isLastChild }" />
              </span>

              <span class="trail__lane trail__lane--dot">
                <span class="trail__dot" :class="{ 'trail__dot--fork': row.isBranchPoint }" />
              </span>
            </span>

            <span class="trail__name">{{ row.title }}</span>

            <Icon v-if="row.isCurrent" name="crosshair" :size="13" class="trail__here" />
            <span v-else-if="row.isBranchPoint" class="trail__ways tabular">{{ row.childCount }} ways</span>
          </button>
        </li>
      </template>
    </ol>
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
.trail__ways {
  color: var(--ink-3);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-label);
}

.trail__empty {
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-sm);
}

.trail__list {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* A gap between journeys, since a search starts one rather than continuing. */
.trail__break {
  height: var(--spacing-md);
  margin: var(--spacing-xs) 0;
  border-top: 1px solid var(--edge-hair);
}

.trail__stop {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  min-height: 34px;
  padding: 0 var(--spacing-sm) 0 0;
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

.trail__gutter {
  display: flex;
  flex: none;
  align-self: stretch;
}

.trail__lane {
  position: relative;
  flex: none;
  width: 15px;
}

.trail__lane--dot {
  display: grid;
  place-items: center;
  width: 17px;
}

/* A branch passing this row on its way further down. */
.trail__through {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
  background: rgba(var(--trail-rgb), 0.32);
}

/* Down from the parent, then across into this row's dot. `--tee` keeps
   going below, because a sibling is still waiting there. */
.trail__elbow {
  position: absolute;
  top: 0;
  left: 50%;
  width: 9px;
  height: 50%;
  border-bottom: 1px solid rgba(var(--trail-rgb), 0.45);
  border-left: 1px solid rgba(var(--trail-rgb), 0.45);
  border-bottom-left-radius: 4px;
}

.trail__elbow--tee::after {
  content: '';
  position: absolute;
  top: 100%;
  left: -1px;
  height: 100vh;
  border-left: 1px solid rgba(var(--trail-rgb), 0.32);
}

/* Gold is the trail's colour and nothing else's, so a glance reads as
   "this is me, and this is where I have been". */
.trail__dot {
  width: 8px;
  height: 8px;
  border: 1px solid var(--trail);
  border-radius: 50%;
}

/* A fork is filled: it is the one row a viewer is looking for. */
.trail__dot--fork {
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
</style>

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import Icon from '../design/Icon.vue'
import SearchBar from './SearchBar.vue'
import { useArticleSearch } from '../composables/useArticleSearch.js'
import { useOverlays } from '../design/useOverlays.js'
import { pickRealms, randomRealm } from '../content/realms.js'

/**
 * Before there is anywhere to be.
 *
 * The empty state was one italic grey sentence — "No world yet — search for
 * an article above" — pointing at a search box that, below 1024px, was not
 * above and was not visible. This is the other high-stakes moment the first
 * pass left undesigned, and the only chance to say what the app IS before
 * someone decides whether to bother.
 *
 * Search is the hero here and only here. Once a realm exists it steps aside
 * into the command palette, because from then on the way onward is portals.
 */
const props = defineProps({
  /**
   * True when there is already a world to go back TO. On a first visit
   * there is nowhere to dismiss to, so the screen has no way out but
   * choosing — which is the point of it.
   */
  dismissible: { type: Boolean, default: false },
})

const emit = defineEmits(['select', 'guide', 'close'])

const { query, results, status, errorMessage, setQuery } = useArticleSearch()
const overlays = useOverlays()

// Sampled once per mount rather than per render, so the grid does not
// reshuffle under the pointer — and freshly each time the screen is
// summoned, so coming back shows somewhere new.
const suggestions = ref(pickRealms())

// Summoned over a live world it is a surface like any other: Escape closes
// it, and it takes its turn in the stack rather than inventing a dismissal.
watch(
  () => props.dismissible,
  (canDismiss) => {
    if (canDismiss) overlays.open('launch', { onClose: () => emit('close') })
    else overlays.close('launch')
  },
  { immediate: true },
)

onBeforeUnmount(() => overlays.close('launch'))

function choose(title) {
  emit('select', { title })
}
</script>

<template>
  <div
    class="launch"
    :role="dismissible ? 'dialog' : undefined"
    :aria-modal="dismissible ? 'true' : undefined"
    :aria-label="dismissible ? 'Opening screen' : undefined"
  >
    <div class="launch__panel">
      <div class="launch__identity">
        <Icon name="mark" :size="34" class="launch__mark" />
        <!-- On arrival this IS the page, so it is the h1. Summoned over a
             world, the realm in the scrim is the h1 and this is a dialog
             inside it — two h1s would leave a screen reader with two
             answers to "what is this page". -->
        <component :is="dismissible ? 'h2' : 'h1'" class="launch__wordmark">WikiRealms</component>
        <button
          v-if="dismissible"
          class="launch__close"
          type="button"
          aria-label="Back to the world"
          @click="$emit('close')"
        >
          <Icon name="close" :size="18" />
        </button>
      </div>

      <p class="launch__pitch">
        Every Wikipedia article is a world. Its sections become mountain ranges, its
        references grow the forests, and its links are portals out.
      </p>

      <SearchBar
        class="launch__search"
        size="lg"
        autofocus
        placeholder="Name a realm…"
        :query="query"
        :results="results"
        :status="status"
        :error-message="errorMessage"
        @update:query="setQuery"
        @select="$emit('select', $event)"
      />

      <div v-if="results.length === 0" class="launch__suggestions">
        <p class="launch__label">Or begin somewhere</p>
        <ul class="launch__realms">
          <li v-for="realm in suggestions" :key="realm.title">
            <button type="button" @click="choose(realm.title)">
              <strong>{{ realm.title }}</strong>
              <span>{{ realm.hint }}</span>
            </button>
          </li>
        </ul>

        <div class="launch__extras">
          <button
            class="launch__extra"
            type="button"
            @click="choose(randomRealm(suggestions.map((realm) => realm.title)).title)"
          >
            <Icon name="crosshair" :size="14" />
            Surprise me
          </button>
          <button class="launch__extra" type="button" @click="$emit('guide')">
            <Icon name="guide" :size="14" />
            How this works
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.launch {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlays);
  display: grid;
  place-items: center;
  padding: var(--spacing-lg);
  overflow-y: auto;
  /* Dark enough to read against, sheer enough that the world still turns
     behind it — the pitch is more convincing with the thing itself moving. */
  background: radial-gradient(
    ellipse at 50% 40%,
    rgba(var(--surface-1-rgb), 0.86) 0%,
    rgba(var(--surface-1-rgb), 0.97) 60%
  );
  backdrop-filter: blur(2px);
}

.launch__panel {
  display: grid;
  gap: var(--spacing-lg);
  width: min(560px, 100%);
}

.launch__identity {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.launch__close {
  display: grid;
  place-items: center;
  width: var(--hit);
  height: var(--hit);
  margin-left: auto;
  border: 1px solid var(--edge-hair);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-2);
}

.launch__close:hover {
  border-color: var(--edge-accent);
  color: var(--accent);
}

.launch__mark {
  color: var(--accent);
}

.launch__wordmark {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: 500;
  letter-spacing: 0.06em;
}

.launch__pitch {
  margin: 0;
  max-width: 46ch;
  color: var(--ink-2);
  font-size: var(--text-md);
  line-height: 1.6;
  text-wrap: pretty;
}

.launch__label {
  margin: 0 0 var(--spacing-sm);
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
}

.launch__realms {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--spacing-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}

.launch__realms button {
  display: grid;
  gap: 2px;
  width: 100%;
  min-height: var(--hit);
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--edge-hair);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-1);
  font: inherit;
  text-align: left;
}

.launch__realms button:hover {
  border-color: var(--edge-accent);
  background: var(--accent-wash);
}

.launch__realms strong {
  font-size: var(--text-sm);
  font-weight: 500;
}

.launch__realms span {
  color: var(--ink-3);
  font-size: var(--text-xs);
}

.launch__extras {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-md);
  margin-top: var(--spacing-md);
}

.launch__extra {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-height: var(--hit);
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.launch__extra:hover {
  color: var(--accent-ink);
}
</style>

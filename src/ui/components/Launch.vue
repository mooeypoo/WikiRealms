<script setup>
import Icon from '../design/Icon.vue'
import SearchBar from './SearchBar.vue'
import { useArticleSearch } from '../composables/useArticleSearch.js'
import { CURATED_REALMS, randomRealm } from '../content/realms.js'

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
const emit = defineEmits(['select', 'guide'])

const { query, results, status, errorMessage, setQuery } = useArticleSearch()

function choose(title) {
  emit('select', { title })
}
</script>

<template>
  <div class="launch">
    <div class="launch__panel">
      <div class="launch__identity">
        <Icon name="mark" :size="34" class="launch__mark" />
        <h1 class="launch__wordmark">WikiRealms</h1>
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
          <li v-for="realm in CURATED_REALMS" :key="realm.title">
            <button type="button" @click="choose(realm.title)">
              <strong>{{ realm.title }}</strong>
              <span>{{ realm.hint }}</span>
            </button>
          </li>
        </ul>

        <div class="launch__extras">
          <button class="launch__extra" type="button" @click="choose(randomRealm().title)">
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

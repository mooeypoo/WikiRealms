<script setup>
import Icon from '../design/Icon.vue'
import { useI18n } from '../i18n/banana.js'

/**
 * Where you are, and the way to everything you have to ask for.
 *
 * A gradient rather than a bar: the stage runs underneath it, so the world
 * still reaches the top edge instead of being framed by chrome. It replaces
 * both of the shells the app had — a fixed taskbar AND a floating panel that
 * carried duplicate Info, Settings and Share buttons below 1024px.
 *
 * Left is identity and the journey; right is what can be summoned. The one
 * control conspicuously absent is the view toggle: that changes the world
 * rather than the app, so it lives on the helm beside the stage.
 */
defineProps({
  realm: { type: String, default: null },
  trailLength: { type: Number, default: 0 },
  canGoBack: { type: Boolean, default: false },
  canGoForward: { type: Boolean, default: false },
})

defineEmits(['home', 'back', 'forward', 'trail', 'search', 'guide', 'settings', 'tools'])

const { t } = useI18n()
</script>

<template>
  <header class="scrim">
    <div class="scrim__identity">
      <!-- The mark is the way home, as it is everywhere else on the web.
           The wordmark hides below md, so the affordance has to be the mark
           rather than the pair. -->
      <button class="scrim__home" type="button" :aria-label="t('wikirealms-scrim-home')" @click="$emit('home')">
        <Icon name="mark" :size="18" />
        <span class="scrim__wordmark"><bdi>{{ t('wikirealms-app-name') }}</bdi></span>
      </button>

      <template v-if="realm">
        <span class="scrim__rule" aria-hidden="true" />
        <h1 class="scrim__realm"><bdi>{{ realm }}</bdi></h1>

        <!-- Always, once there is a realm: the trail panel is where the
             journey actions live now, so it cannot be a control that only
             appears after the second stop. A bare icon+count reads as a
             badge; the word names the map of where you have walked. -->
        <button
          class="scrim__trail"
          type="button"
          :aria-label="t('wikirealms-scrim-trail-aria', trailLength)"
          :title="t('wikirealms-scrim-trail-title')"
          @click="$emit('trail')"
        >
          <Icon name="trail" :size="15" />
          <span class="scrim__trail-label"><bdi>{{ t('wikirealms-scrim-trail') }}</bdi></span>
          <span class="scrim__trail-count tabular">{{ trailLength }}</span>
        </button>
      </template>
    </div>

    <nav class="scrim__travel" :aria-label="t('wikirealms-scrim-travel')">
      <button
        class="scrim__button"
        type="button"
        :aria-label="t('wikirealms-scrim-back')"
        :disabled="!canGoBack"
        @click="$emit('back')"
      >
        <Icon name="chevron-left" :size="17" />
      </button>
      <button
        class="scrim__button"
        type="button"
        :aria-label="t('wikirealms-scrim-forward')"
        :disabled="!canGoForward"
        @click="$emit('forward')"
      >
        <Icon name="chevron-right" :size="17" />
      </button>
    </nav>

    <!-- Below md these four collapse into one control: four 48px targets
         plus a realm name plus the trail chevron do not fit across a phone,
         and shrinking them under 48 is the wrong thing to give up. -->
    <button class="scrim__button scrim__more" type="button" :aria-label="t('wikirealms-scrim-tools')" @click="$emit('tools')">
      <Icon name="more" :size="17" />
    </button>

    <nav class="scrim__utilities" :aria-label="t('wikirealms-scrim-tools')">
      <button class="scrim__button scrim__tool" type="button" :aria-label="t('wikirealms-scrim-search-aria')" @click="$emit('search')">
        <Icon name="search" :size="17" />
        <span class="scrim__label"><bdi>{{ t('wikirealms-scrim-search') }}</bdi></span>
      </button>
      <button class="scrim__button scrim__tool" type="button" :aria-label="t('wikirealms-scrim-about-aria')" @click="$emit('guide')">
        <Icon name="guide" :size="17" />
        <span class="scrim__label"><bdi>{{ t('wikirealms-scrim-about') }}</bdi></span>
      </button>
      <button class="scrim__button scrim__tool" type="button" :aria-label="t('wikirealms-scrim-settings')" @click="$emit('settings')">
        <Icon name="settings" :size="17" />
        <span class="scrim__label"><bdi>{{ t('wikirealms-scrim-settings') }}</bdi></span>
      </button>
    </nav>
  </header>
</template>

<style scoped>
.scrim {
  position: fixed;
  top: 0;
  inset-inline: 0;
  z-index: var(--z-instruments);
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  box-sizing: border-box;
  min-height: 52px;
  padding: env(safe-area-inset-top, 0) max(var(--spacing-md), env(safe-area-inset-right, 0px)) 0
    max(var(--spacing-md), env(safe-area-inset-left, 0px));
  /* Fades out rather than ending in an edge: the world runs under it. */
  background: linear-gradient(
    180deg,
    rgba(var(--surface-1-rgb), 0.94) 0%,
    rgba(var(--surface-1-rgb), 0.62) 58%,
    rgba(var(--surface-1-rgb), 0) 100%
  );
  pointer-events: none;
}

/* Back / forward glyphs point along the reading direction. */
[dir='rtl'] .scrim__travel :deep(svg) {
  transform: scaleX(-1);
}

.scrim > * {
  pointer-events: auto;
}

.scrim__identity {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--spacing-sm);
  min-width: 0;
}

.scrim__home {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--spacing-sm);
  min-height: var(--hit);
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
}

.scrim__home:hover {
  filter: var(--glow-subtle);
}

.scrim__home:hover .scrim__wordmark {
  color: var(--ink-1);
}

.scrim__wordmark {
  flex: none;
  color: var(--ink-2);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.scrim__rule {
  flex: none;
  width: 1px;
  height: 18px;
  background: var(--edge-line);
}

.scrim__realm {
  overflow: hidden;
  margin: 0;
  color: var(--ink-1);
  font-size: var(--text-md);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scrim__trail {
  display: flex;
  flex: none;
  align-items: center;
  gap: 6px;
  min-height: var(--hit);
  height: auto;
  padding: 0 var(--spacing-md);
  border: 1px solid rgba(var(--trail-rgb), 0.55);
  border-radius: var(--radius-md);
  background: rgba(var(--trail-rgb), 0.12);
  color: var(--trail);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.scrim__trail:hover {
  background: var(--trail-wash);
  border-color: rgba(var(--trail-rgb), 0.75);
}

.scrim__trail-label {
  line-height: 1;
}

.scrim__trail-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.35em;
  min-height: 1.35em;
  padding: 0 5px;
  border-radius: var(--radius-sm);
  background: rgba(var(--trail-rgb), 0.28);
  letter-spacing: 0;
  font-weight: 600;
}

.scrim__travel,
.scrim__utilities {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--spacing-xs);
}

.scrim__button {
  display: grid;
  place-items: center;
  width: var(--hit);
  height: var(--hit);
  box-sizing: border-box;
  border: 1px solid var(--edge-line);
  border-radius: var(--radius-md);
  background: var(--surface-1);
  color: var(--ink-1);
}

.scrim__button:hover:not(:disabled) {
  border-color: var(--edge-accent);
  color: var(--accent);
}

.scrim__button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* After .scrim__button, not before it: both are single-class selectors, so
   the later one wins and the overflow control was showing at every width —
   beside the very buttons it exists to replace. */
.scrim__more {
  display: none;
}

/**
 * An icon alone asks the viewer to guess. There is room for a word on a
 * desktop, and below md these four collapse into a menu that has room for
 * one anyway — so the only width where anybody has to guess is the middle
 * band, where the realm name needs the space more.
 */
.scrim__label {
  display: none;
}

@media (min-width: 1024px) {
  .scrim__tool {
    display: flex;
    align-items: center;
    gap: 7px;
    width: auto;
    padding: 0 var(--spacing-sm) 0 9px;
  }

  .scrim__label {
    display: inline;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
}

/* Below md the wordmark goes: the realm name is the useful half of the
   identity, and the utility icons need the room more than branding does. */
@media (max-width: 767px) {
  .scrim {
    gap: var(--spacing-sm);
    padding-inline-end: max(var(--spacing-sm), env(safe-area-inset-right, 0px));
    padding-inline-start: max(var(--spacing-sm), env(safe-area-inset-left, 0px));
  }

  .scrim__wordmark,
  .scrim__rule {
    display: none;
  }

  .scrim__button {
    width: var(--hit);
    height: var(--hit);
  }

  .scrim__utilities {
    display: none;
  }

  .scrim__more {
    display: grid;
  }
}

/* Narrower still: travel is the arrow keys and the trail list, so the two
   arrow buttons give way before anything that cannot be reached otherwise. */
@media (max-width: 479px) {
  .scrim__travel {
    display: none;
  }
}
</style>

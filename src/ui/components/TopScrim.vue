<script setup>
import Icon from '../design/Icon.vue'

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

defineEmits(['home', 'back', 'forward', 'trail', 'search', 'journey', 'guide', 'settings', 'tools'])
</script>

<template>
  <header class="scrim">
    <div class="scrim__identity">
      <!-- The mark is the way home, as it is everywhere else on the web.
           The wordmark hides below md, so the affordance has to be the mark
           rather than the pair. -->
      <button class="scrim__home" type="button" aria-label="Opening screen" @click="$emit('home')">
        <Icon name="mark" :size="18" />
        <span class="scrim__wordmark">WikiRealms</span>
      </button>

      <template v-if="realm">
        <span class="scrim__rule" aria-hidden="true" />
        <h1 class="scrim__realm">{{ realm }}</h1>

        <button
          v-if="trailLength > 1"
          class="scrim__trail"
          type="button"
          :aria-label="`Your trail, ${trailLength} realms`"
          @click="$emit('trail')"
        >
          <Icon name="trail" :size="13" />
          <span class="tabular">{{ trailLength }}</span>
        </button>
      </template>
    </div>

    <nav class="scrim__travel" aria-label="Travel">
      <button
        class="scrim__button"
        type="button"
        aria-label="Back"
        :disabled="!canGoBack"
        @click="$emit('back')"
      >
        <Icon name="chevron-left" :size="17" />
      </button>
      <button
        class="scrim__button"
        type="button"
        aria-label="Forward"
        :disabled="!canGoForward"
        @click="$emit('forward')"
      >
        <Icon name="chevron-right" :size="17" />
      </button>
    </nav>

    <!-- Below md these four collapse into one control: four 48px targets
         plus a realm name plus the trail chevron do not fit across a phone,
         and shrinking them under 48 is the wrong thing to give up. -->
    <button class="scrim__button scrim__more" type="button" aria-label="Tools" @click="$emit('tools')">
      <Icon name="more" :size="17" />
    </button>

    <nav class="scrim__utilities" aria-label="Tools">
      <button class="scrim__button" type="button" aria-label="Search realms" @click="$emit('search')">
        <Icon name="search" :size="17" />
      </button>
      <button class="scrim__button" type="button" aria-label="Journey" @click="$emit('journey')">
        <Icon name="share" :size="17" />
      </button>
      <button class="scrim__button" type="button" aria-label="About WikiRealms" @click="$emit('guide')">
        <Icon name="guide" :size="17" />
      </button>
      <button class="scrim__button" type="button" aria-label="Settings" @click="$emit('settings')">
        <Icon name="settings" :size="17" />
      </button>
    </nav>
  </header>
</template>

<style scoped>
.scrim {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
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
  min-height: 34px;
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
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: 10px;
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
  gap: 5px;
  height: 26px;
  padding: 0 var(--spacing-sm);
  border: 1px solid rgba(var(--trail-rgb), 0.35);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--trail);
  font-size: 10px;
  letter-spacing: 0.1em;
}

.scrim__trail:hover {
  background: var(--trail-wash);
}

.scrim__more {
  display: none;
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
  width: 34px;
  height: 34px;
  border: 1px solid var(--edge-hair);
  border-radius: var(--radius-md);
  background: rgba(var(--surface-1-rgb), 0.6);
  color: var(--ink-2);
}

.scrim__button:hover:not(:disabled) {
  border-color: var(--edge-accent);
  color: var(--accent);
}

.scrim__button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* Below md the wordmark goes: the realm name is the useful half of the
   identity, and the utility icons need the room more than branding does. */
@media (max-width: 767px) {
  .scrim {
    gap: var(--spacing-sm);
    padding-right: max(var(--spacing-sm), env(safe-area-inset-right, 0px));
    padding-left: max(var(--spacing-sm), env(safe-area-inset-left, 0px));
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

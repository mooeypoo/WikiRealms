<script setup>
defineProps({
  /** Only a dismissible surface should let a click on the scrim close it. */
  dismissible: { type: Boolean, default: true },
})

defineEmits(['dismiss'])
</script>

<template>
  <div
    class="scrim"
    :class="{ 'scrim--inert': !dismissible }"
    aria-hidden="true"
    @click="dismissible && $emit('dismiss')"
  />
</template>

<style scoped>
.scrim {
  position: absolute;
  inset: 0;
  /* Stacking is owned by the sheet root that wraps this, so the scrim sits
     under its own surface without needing a number from the global ladder. */
  pointer-events: auto;
  background: var(--surface-scrim);
  /* Just enough to separate the surface from the world without hiding it —
     the stage should still read as *there*, behind what you summoned. */
  backdrop-filter: blur(3px);
}

.scrim--inert {
  cursor: default;
}
</style>

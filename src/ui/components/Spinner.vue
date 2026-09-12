<script setup>
import { useI18n } from '../i18n/banana.js'

const { t } = useI18n()
</script>

<template>
  <span class="spinner" role="status" :aria-label="t('wikirealms-loading')"></span>
</template>

<style scoped>
.spinner {
  display: inline-block;
  width: 1em;
  height: 1em;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spinner-spin 0.6s linear infinite;
  vertical-align: -0.15em;
}

@keyframes spinner-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

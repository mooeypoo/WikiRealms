<script setup>
/**
 * Visible chrome string isolated for bidirectional text.
 *
 * Untranslated English (and any LTR fallback) inside an RTL document must
 * not reorder neighbouring punctuation or digits. <bdi> isolates the
 * message; dir defaults to auto from the first strong character.
 *
 * Use plain `t()` for attributes (aria-label, title, placeholder) — HTML
 * elements are not valid there. Use this component (or an explicit <bdi>)
 * for anything the reader sees.
 */
import { computed } from 'vue'
import { t } from './banana.js'

const props = defineProps({
  /** Message key (wikirealms-…). */
  msg: { type: String, required: true },
  /** banana-i18n positional params ($1, $2, …). */
  args: { type: Array, default: () => [] },
})

const text = computed(() => t(props.msg, ...props.args))
</script>

<template>
  <bdi>{{ text }}</bdi>
</template>

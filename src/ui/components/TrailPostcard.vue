<script setup>
/**
 * Graphic expedition postcard — a Sheet that shows a stylized SVG of the
 * trail letter, then offers copy-image / download / copy-letter / share.
 *
 * Art uses hardcoded token colours (not CSS vars) so the PNG rasterizer
 * can serialize the SVG without the document stylesheet.
 */
import { computed, ref, watch } from 'vue'
import Icon from '../design/Icon.vue'
import Sheet from '../design/Sheet.vue'
import { realmUrl } from '../../adapters/urlState.js'
import {
  copyImageBlob,
  downloadBlob,
  pngBlobFromSvg,
  sharePostcardImage,
} from '../../adapters/clipboardImage.js'
import { copyText, shareLink } from '../../adapters/shareTarget.js'
import {
  POSTCARD_HEIGHT,
  POSTCARD_WIDTH,
  buildTrailPostcard,
} from '../content/trailPostcard.js'
import { useI18n } from '../i18n/banana.js'

const props = defineProps({
  show: Boolean,
  graph: { type: Object, default: null },
})

const emit = defineEmits(['close', 'toast'])
const { t } = useI18n()

const svgRef = ref(null)
const busy = ref(false)

const model = computed(() => buildTrailPostcard(props.graph, { realmUrl }))

const statsLine = computed(() => {
  if (!model.value) return ''
  const { realmCount, portalCount } = model.value
  return t('wikirealms-postcard-stats', realmCount, portalCount)
})

/** Vertical rhythm for stacked stops inside the artboard. */
const stopLayout = computed(() => {
  const stops = model.value?.stops ?? []
  const top = 280
  const gap = stops.length > 6 ? 58 : 68
  return stops.map((title, index) => ({
    title,
    y: top + index * gap,
    isEllipsis: title.startsWith('…'),
    isLast: index === stops.length - 1,
  }))
})

const connectorBottom = computed(() => {
  const layout = stopLayout.value
  if (layout.length < 2) return topOfFirstStop()
  return layout[layout.length - 1].y
})

function topOfFirstStop() {
  return stopLayout.value[0]?.y ?? 280
}

watch(
  () => props.show,
  (open) => {
    if (!open) busy.value = false
  },
)

async function withBlob(run) {
  if (!svgRef.value || !model.value || busy.value) return
  busy.value = true
  try {
    const blob = await pngBlobFromSvg(svgRef.value, { scale: 2 })
    await run(blob)
  } catch {
    emit('toast', t('wikirealms-postcard-toast-image-fail'))
  } finally {
    busy.value = false
  }
}

async function onCopyImage() {
  await withBlob(async (blob) => {
    const outcome = await copyImageBlob(blob)
    if (outcome === 'copied') {
      emit('toast', t('wikirealms-postcard-toast-image-copied'))
      return
    }
    // Clipboard image is spotty on some browsers / insecure origins —
    // fall through to a download so the viewer still gets the graphic.
    downloadBlob(blob, filename())
    emit('toast', t('wikirealms-postcard-toast-image-downloaded'))
  })
}

async function onDownload() {
  await withBlob(async (blob) => {
    downloadBlob(blob, filename())
    emit('toast', t('wikirealms-postcard-toast-downloaded'))
  })
}

async function onCopyLetter() {
  if (!model.value) return
  const ok = await copyText(model.value.clipboardText)
  emit(
    'toast',
    ok ? t('wikirealms-postcard-toast-letter-copied') : t('wikirealms-postcard-toast-letter-fail'),
  )
}

async function onShare() {
  if (!model.value) return
  await withBlob(async (blob) => {
    const outcome = await sharePostcardImage(
      {
        blob,
        filename: filename(),
        title: model.value.title,
        text: model.value.text,
        url: model.value.url,
        clipboardText: model.value.clipboardText,
      },
      shareLink,
    )
    if (outcome === 'copied') emit('toast', t('wikirealms-postcard-toast-copied'))
    else if (outcome === 'failed') emit('toast', t('wikirealms-postcard-toast-share-fail'))
  })
}

function filename() {
  const slug = (model.value?.here ?? 'expedition').replace(/[^\w\-]+/g, '_').slice(0, 48)
  return `wikirealms-${slug}.png`
}

function truncate(title, max = 36) {
  if (!title || title.length <= max) return title
  return `${title.slice(0, max - 1)}…`
}
</script>

<template>
  <Sheet
    id="trail-postcard"
    :open="show"
    :label="t('wikirealms-postcard-title')"
    :snap-points="[0.72, 0.94]"
    :snap="1"
    @close="$emit('close')"
  >
    <template #header>
      <div class="postcard__bar">
        <h2 class="postcard__title"><bdi>{{ t('wikirealms-postcard-title') }}</bdi></h2>
        <button
          class="postcard__close"
          type="button"
          :aria-label="t('wikirealms-postcard-close')"
          @click="$emit('close')"
        >
          <Icon name="close" :size="18" />
        </button>
      </div>
    </template>

    <p v-if="!model" class="postcard__empty"><bdi>{{ t('wikirealms-postcard-empty') }}</bdi></p>

    <div v-else class="postcard__stage">
      <svg
        ref="svgRef"
        class="postcard__art"
        :viewBox="`0 0 ${POSTCARD_WIDTH} ${POSTCARD_HEIGHT}`"
        :width="POSTCARD_WIDTH"
        :height="POSTCARD_HEIGHT"
        role="img"
        :aria-label="t('wikirealms-postcard-aria', model.here)"
      >
        <defs>
          <linearGradient id="pc-sky" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#0d1120" />
            <stop offset="48%" stop-color="#05070d" />
            <stop offset="100%" stop-color="#05070d" />
          </linearGradient>
          <radialGradient id="pc-glow" cx="72%" cy="38%" r="55%">
            <stop offset="0%" stop-color="rgba(52,89,124,0.42)" />
            <stop offset="55%" stop-color="rgba(52,89,124,0.08)" />
            <stop offset="100%" stop-color="rgba(52,89,124,0)" />
          </radialGradient>
          <radialGradient id="pc-accent-glow" cx="18%" cy="78%" r="40%">
            <stop offset="0%" stop-color="rgba(116,214,232,0.12)" />
            <stop offset="100%" stop-color="rgba(116,214,232,0)" />
          </radialGradient>
        </defs>

        <rect width="840" height="1100" fill="url(#pc-sky)" />
        <rect width="840" height="1100" fill="url(#pc-glow)" />
        <rect width="840" height="1100" fill="url(#pc-accent-glow)" />

        <!-- Soft starfield -->
        <g fill="#e9edf3" opacity="0.55">
          <circle cx="72" cy="64" r="1.4" />
          <circle cx="190" cy="120" r="1" opacity="0.7" />
          <circle cx="760" cy="88" r="1.3" />
          <circle cx="680" cy="160" r="0.9" opacity="0.65" />
          <circle cx="520" cy="48" r="1" opacity="0.5" />
          <circle cx="120" cy="980" r="1.1" />
          <circle cx="780" cy="940" r="1.2" />
          <circle cx="400" cy="1020" r="0.9" opacity="0.6" />
        </g>
        <g fill="#74d6e8" opacity="0.45">
          <circle cx="640" cy="1000" r="1.2" />
          <circle cx="300" cy="70" r="1" />
        </g>
        <g fill="#e0b878" opacity="0.4">
          <circle cx="800" cy="420" r="1.3" />
          <circle cx="48" cy="520" r="1" />
        </g>

        <!-- Frame -->
        <rect
          x="36"
          y="36"
          width="768"
          height="1028"
          fill="none"
          stroke="rgba(163,184,205,0.22)"
          stroke-width="1"
        />
        <rect
          x="44"
          y="44"
          width="752"
          height="1012"
          fill="none"
          stroke="rgba(224,184,120,0.28)"
          stroke-width="1"
        />

        <!-- Masthead -->
        <text
          x="420"
          y="128"
          text-anchor="middle"
          fill="#e0b878"
          font-family="IBM Plex Mono, ui-monospace, monospace"
          font-size="28"
          letter-spacing="0.2em"
        >
          EXPEDITION · WIKIREALMS
        </text>

        <!-- Mark -->
        <g transform="translate(420 188)">
          <path d="M0 -22 L18 0 L0 22 L-18 0 Z" fill="none" stroke="#e0b878" stroke-width="1.5" />
          <circle r="5" fill="#e0b878" />
        </g>

        <text
          x="420"
          y="248"
          text-anchor="middle"
          fill="#e9edf3"
          font-family="Space Grotesk, Helvetica Neue, Arial, sans-serif"
          font-size="34"
          font-weight="600"
        >
          {{ t('wikirealms-trail-title') }}
        </text>

        <!-- Spine -->
        <line
          v-if="stopLayout.length > 1"
          x1="96"
          :y1="topOfFirstStop()"
          x2="96"
          :y2="connectorBottom"
          stroke="rgba(224,184,120,0.45)"
          stroke-width="1.5"
        />

        <g v-for="(stop, index) in stopLayout" :key="`${stop.title}-${index}`">
          <circle
            cx="96"
            :cy="stop.y"
            :r="stop.isLast ? 7 : 5"
            :fill="stop.isEllipsis ? 'transparent' : '#e0b878'"
            :stroke="stop.isEllipsis ? 'rgba(224,184,120,0.55)' : '#e0b878'"
            stroke-width="1.5"
          />
          <text
            x="128"
            :y="stop.y + 6"
            :fill="stop.isLast ? '#e9edf3' : stop.isEllipsis ? '#6c7b8e' : '#a3b1c2'"
            font-family="Space Grotesk, Helvetica Neue, Arial, sans-serif"
            :font-size="stop.isLast ? 26 : 22"
            :font-weight="stop.isLast ? '600' : '500'"
          >
            {{ truncate(stop.title, stop.isLast ? 32 : 36) }}
          </text>
        </g>

        <!-- Stats -->
        <text
          x="420"
          y="848"
          text-anchor="middle"
          fill="#e0b878"
          font-family="IBM Plex Mono, ui-monospace, monospace"
          font-size="20"
          letter-spacing="0.08em"
        >
          {{ statsLine }}
        </text>

        <line
          x1="140"
          y1="878"
          x2="700"
          y2="878"
          stroke="rgba(163,184,205,0.22)"
          stroke-width="1"
        />

        <text
          x="420"
          y="930"
          text-anchor="middle"
          fill="#e9edf3"
          font-family="Space Grotesk, Helvetica Neue, Arial, sans-serif"
          font-size="26"
          font-weight="500"
        >
          {{ t('wikirealms-postcard-tagline-1') }}
        </text>
        <text
          x="420"
          y="968"
          text-anchor="middle"
          fill="#a3b1c2"
          font-family="Space Grotesk, Helvetica Neue, Arial, sans-serif"
          font-size="20"
        >
          {{ t('wikirealms-postcard-tagline-2') }}
        </text>

        <text
          x="420"
          y="1036"
          text-anchor="middle"
          fill="#74d6e8"
          font-family="IBM Plex Mono, ui-monospace, monospace"
          font-size="20"
        >
          {{ truncate(model.url.replace(/^https?:\/\//, ''), 44) }}
        </text>
      </svg>
    </div>

    <template #footer>
      <div class="postcard__actions">
        <button type="button" :disabled="!model || busy" @click="onCopyImage">
          <Icon name="share" :size="15" />
          <span><bdi>{{ t('wikirealms-postcard-copy-image') }}</bdi></span>
        </button>
        <button type="button" :disabled="!model || busy" @click="onDownload">
          <Icon name="download" :size="15" />
          <span><bdi>{{ t('wikirealms-postcard-download') }}</bdi></span>
        </button>
        <button type="button" :disabled="!model || busy" @click="onCopyLetter">
          <Icon name="prose" :size="15" />
          <span><bdi>{{ t('wikirealms-postcard-copy-letter') }}</bdi></span>
        </button>
        <button type="button" :disabled="!model || busy" @click="onShare">
          <Icon name="external" :size="15" />
          <span><bdi>{{ t('wikirealms-share') }}</bdi></span>
        </button>
      </div>
    </template>
  </Sheet>
</template>

<style scoped>
.postcard__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
}

.postcard__title {
  margin: 0;
  font-size: var(--text-lg);
}

.postcard__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--hit);
  height: var(--hit);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-2);
  cursor: pointer;
}

.postcard__close:hover {
  color: var(--ink-1);
  background: rgba(var(--edge-rgb), 0.08);
}

.postcard__empty {
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-sm);
}

.postcard__stage {
  display: flex;
  justify-content: center;
  padding: var(--spacing-sm) 0 var(--spacing-md);
}

.postcard__art {
  width: min(100%, 420px);
  height: auto;
  border-radius: var(--radius-md);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
}

.postcard__actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--spacing-sm);
}

.postcard__actions button {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  min-height: var(--hit);
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--edge-line);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-1);
  font: inherit;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
  cursor: pointer;
}

.postcard__actions button:hover:not(:disabled) {
  border-color: var(--edge-accent);
  color: var(--accent);
}

.postcard__actions button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

@media (min-width: 480px) {
  .postcard__actions {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .postcard__actions button {
    flex-direction: column;
    gap: 4px;
    padding: var(--spacing-sm) var(--spacing-xs);
  }
}
</style>

<script setup>
import Icon from '../design/Icon.vue'
import { computed, onMounted, ref, watch } from 'vue'
import { biomeColor } from '../rendering/biomeColor.js'
import { useI18n } from '../i18n/banana.js'

// Halved from 8 when GRID went to 512 × 256 for the planet view — at 8px
// the equirectangular map would be a 4096px-wide stage to scroll around.
const CELL_SIZE = 4

const props = defineProps({
  world: { type: Object, required: true },
  showPortals: { type: Boolean, default: true },
})

const emit = defineEmits(['portal-click'])
const { t } = useI18n()

/**
 * Reports the marker's own position, not the pointer's, so the preview card
 * anchors to the portal rather than to wherever the click happened to land
 * inside it. Same payload shape as the 3D view, so App has one handler.
 */
function onPortalClick(portal, event) {
  const rect = event.currentTarget.getBoundingClientRect()
  emit('portal-click', {
    portal,
    anchor: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
  })
}

const canvasRef = ref(null)

const canvasWidth = computed(() => props.world.terrain.width * CELL_SIZE)
const canvasHeight = computed(() => props.world.terrain.height * CELL_SIZE)

function draw() {
  const canvas = canvasRef.value
  // Some environments throw rather than return null (or emit and return null).
  let ctx = null
  try {
    ctx = canvas?.getContext('2d') ?? null
  } catch {
    return
  }
  if (!ctx) return // no 2D context available (e.g. non-browser test environment)

  const { width, height, heightMap, biomeMap } = props.world.terrain

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x
      ctx.fillStyle = biomeColor(biomeMap[index], heightMap[index])
      ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
    }
  }
}

function portalStyle(portal) {
  return {
    left: `${portal.gridX * CELL_SIZE}px`,
    top: `${portal.gridY * CELL_SIZE}px`,
  }
}

onMounted(draw)
watch(() => props.world, draw, { flush: 'post' })
</script>

<template>
  <div class="world-view">
    <div class="world-view__scroll">
      <div class="world-view__stage" :style="{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }">
        <canvas ref="canvasRef" :width="canvasWidth" :height="canvasHeight" class="world-view__canvas" />
        <button
          v-if="showPortals"
          v-for="portal in world.portals"
          :key="portal.portalId"
          type="button"
          class="world-view__portal"
          :style="portalStyle(portal)"
          :title="t('wikirealms-world-travel-to', portal.targetArticleId)"
          @click="onPortalClick(portal, $event)"
        >
          <Icon name="globe" :size="16" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.world-view__scroll {
  width: 100%;
  height: 100%;
  overflow: auto;
  box-shadow: inset 0 0 12vw 4vw var(--surface-void);
}

.world-view__stage {
  position: relative;
}

.world-view__canvas {
  position: absolute;
  top: 0;
  left: 0;
  image-rendering: pixelated;
}

.world-view__portal {
  position: absolute;
  width: 16px;
  height: 16px;
  transform: translate(-50%, -50%);
  border: none;
  background: none;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 0;
  filter: drop-shadow(0 0 4px var(--accent, #7fdfff));
  animation: portal-pulse 2.4s ease-in-out infinite;
}

@keyframes portal-pulse {
  0%,
  100% {
    transform: translate(-50%, -50%) scale(1);
    filter: drop-shadow(0 0 4px var(--accent, #7fdfff));
  }
  50% {
    transform: translate(-50%, -50%) scale(1.18);
    filter: drop-shadow(0 0 10px var(--accent, #7fdfff));
  }
}
</style>

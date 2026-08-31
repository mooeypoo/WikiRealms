<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { biomeColor } from '../rendering/biomeColor.js'

const CELL_SIZE = 8

const props = defineProps({
  world: { type: Object, required: true },
})

defineEmits(['portal-click'])

const canvasRef = ref(null)

const canvasWidth = computed(() => props.world.terrain.width * CELL_SIZE)
const canvasHeight = computed(() => props.world.terrain.height * CELL_SIZE)

function draw() {
  const canvas = canvasRef.value
  const ctx = canvas?.getContext('2d')
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
          v-for="portal in world.portals"
          :key="portal.portalId"
          type="button"
          class="world-view__portal"
          :style="portalStyle(portal)"
          :title="`Travel to ${portal.targetArticleId}`"
          @click="$emit('portal-click', portal)"
        >
          🌀
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.world-view__scroll {
  overflow: auto;
  max-height: 70vh;
  max-width: 100%;
  border: 1px solid #ccc;
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
  font-size: 14px;
  line-height: 1;
  padding: 0;
}
</style>

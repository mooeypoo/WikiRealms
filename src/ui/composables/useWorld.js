import { ref } from 'vue'
import { generateWorld } from '../../engine/generation/world.js'

/**
 * Reactive world-generation state, wrapping the pure `generateWorld` engine
 * function with the same loading/error/success lifecycle used elsewhere in
 * the app (kept consistent even though generation is currently synchronous,
 * so future async generation work wouldn't change this composable's shape).
 *
 * @param {{ generateWorldFn?: typeof generateWorld }} [options]
 */
export function useWorld({ generateWorldFn = generateWorld } = {}) {
  const world = ref(null)
  const status = ref('idle') // 'idle' | 'loading' | 'success' | 'error'
  const errorMessage = ref(null)

  function buildWorld(article) {
    status.value = 'loading'
    errorMessage.value = null

    try {
      world.value = generateWorldFn(article)
      status.value = 'success'
    } catch (error) {
      world.value = null
      status.value = 'error'
      errorMessage.value = error?.message ?? 'Failed to generate world'
    }
  }

  function clear() {
    world.value = null
    status.value = 'idle'
    errorMessage.value = null
  }

  return { world, status, errorMessage, buildWorld, clear }
}

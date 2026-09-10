import { h, onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'
import { createCreatureGeometry, createCreatureMaterial } from '../../../src/ui/rendering/creatureMaterial.js'
import { CREATURE_ARCHETYPES, creaturePose } from '../../../src/ui/rendering/creatures.js'
import { CREATURE_FAMILY } from '../../../src/ui/rendering/creatureTaxonomy.js'

/**
 * One pudding close-up — proves squash, eyes, and hop without the whole
 * planet. Render-function only: this project ships the runtime-only Vue
 * build, so a `template:` string on a plain JS component would never
 * compile and showed up as an inert rectangle in Storybook.
 */
const BlobStage = {
  name: 'BlobStage',
  props: {
    family: { type: String, default: CREATURE_FAMILY.nature },
  },
  setup(props) {
    const host = ref(null)
    let renderer
    let frameId
    let mesh
    let resizeObserver

    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    const leanAxis = new THREE.Vector3(0, 1, 0)

    onMounted(() => {
      const el = host.value
      if (!el) return

      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0x1a2430)
      scene.fog = new THREE.Fog(0x1a2430, 6, 16)

      // Geometry is Z-up with the face on +Y — camera on +Y so eyes face us.
      const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 40)
      camera.up.set(0, 0, 1)
      camera.position.set(0, 4.0, 0.55)
      camera.lookAt(0, 0, 0.4)

      renderer = new THREE.WebGLRenderer({ antialias: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio ?? 1, 2))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      el.appendChild(renderer.domElement)

      const resize = () => {
        const width = Math.max(el.clientWidth, 1)
        const height = Math.max(el.clientHeight, 1)
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        renderer.setSize(width, height)
      }
      resize()
      resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(el)

      scene.add(new THREE.AmbientLight(0xffffff, 0.55))
      const sun = new THREE.DirectionalLight(0xffffff, 0.95)
      sun.position.set(2, 3, 4)
      scene.add(sun)

      const archetype = CREATURE_ARCHETYPES[props.family] ?? CREATURE_ARCHETYPES[CREATURE_FAMILY.wanderer]
      const geometry = createCreatureGeometry({ eyeSize: archetype.eyeSize })
      const material = createCreatureMaterial({ spherical: false })
      mesh = new THREE.InstancedMesh(geometry, material, 1)
      mesh.setColorAt(0, new THREE.Color(archetype.color))
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      scene.add(mesh)

      const ground = new THREE.Mesh(
        new THREE.CircleGeometry(1.6, 48),
        new THREE.MeshBasicMaterial({ color: 0x243040 }),
      )
      scene.add(ground)

      const tick = (now) => {
        frameId = requestAnimationFrame(tick)
        const pose = creaturePose(now * 0.001, {
          phase: 0,
          gaitSpeed: archetype.gaitSpeed,
          hopHeight: archetype.hopHeight,
          gait: archetype.gait,
          scale: 0.95,
          squat: archetype.squat,
        })
        position.set(0, 0, 0.5 * pose.squashY + pose.lift)
        scale.set(pose.squashX, pose.squashZ, pose.squashY)
        quaternion.identity()
        if (pose.lean) quaternion.setFromAxisAngle(leanAxis, pose.lean)
        mesh.setMatrixAt(0, matrix.compose(position, quaternion, scale))
        mesh.instanceMatrix.needsUpdate = true
        renderer.render(scene, camera)
      }
      tick(0)
    })

    onBeforeUnmount(() => {
      resizeObserver?.disconnect()
      cancelAnimationFrame(frameId)
      mesh?.geometry?.dispose()
      mesh?.material?.dispose()
      renderer?.dispose()
      renderer?.domElement?.remove()
    })

    return () =>
      h('div', {
        ref: host,
        style: {
          width: '100%',
          height: '100%',
          minHeight: '360px',
        },
      })
  },
}

export default {
  title: 'Stage/Creatures',
  component: BlobStage,
  argTypes: {
    family: {
      control: 'select',
      options: Object.values(CREATURE_FAMILY),
    },
  },
  parameters: {
    a11y: { disable: true },
  },
}

function closeUp(family) {
  return {
    args: { family },
    render: (args) => ({
      setup: () => () => h(BlobStage, { family: args.family }),
    }),
  }
}

export const NatureCloseUp = closeUp(CREATURE_FAMILY.nature)
export const ScienceCloseUp = closeUp(CREATURE_FAMILY.science)
export const ArtsCloseUp = closeUp(CREATURE_FAMILY.arts)

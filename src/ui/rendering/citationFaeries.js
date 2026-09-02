import * as THREE from 'three'
import { CITATION_FAERIES } from '../../engine/generation/config.js'
import { createRng, hashStringToSeed } from '../../engine/generation/rng.js'

/**
 * Determines the faerie bird's prominence from its section citation count.
 * @param {number} citationCount
 * @returns {'glimmer' | 'faerie' | 'flock'}
 */
export function getFaerieType(citationCount) {
  if (citationCount <= CITATION_FAERIES.glimmerMax) return 'glimmer'
  if (citationCount <= CITATION_FAERIES.faerieMax) return 'faerie'
  return 'flock'
}

/**
 * Places a cited section's faerie inside its terrain footprint, away from
 * the summit marker. The article world seed makes the placement stable.
 */
export function computeFaerieGridPosition(peak, worldSeed, width, height) {
  const seed = hashStringToSeed(`${worldSeed}:faerie:${peak.title}:${peak.depth}:${peak.x}:${peak.y}`)
  const rng = createRng(seed)
  const angle = rng() * Math.PI * 2
  const distance = peak.radius * (0.32 + rng() * 0.5)

  return {
    gridX: Math.round(Math.min(width - 1, Math.max(0, peak.x + Math.cos(angle) * distance))),
    gridY: Math.round(Math.min(height - 1, Math.max(0, peak.y + Math.sin(angle) * distance))),
  }
}

function makeFaerieCanvas(type) {
  const canvas = document.createElement('canvas')
  const size = 128
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const center = size / 2
  const colors = {
    glimmer: ['rgba(157, 229, 255, 0.9)', 'rgba(95, 175, 255, 0.95)'],
    faerie: ['rgba(255, 226, 143, 0.95)', 'rgba(255, 154, 91, 0.95)'],
    flock: ['rgba(220, 187, 255, 0.95)', 'rgba(151, 102, 245, 1)'],
  }
  const [wingColor, bodyColor] = colors[type]

  const glow = ctx.createRadialGradient(center, center, 2, center, center, 44)
  glow.addColorStop(0, 'rgba(255, 255, 255, 0.3)')
  glow.addColorStop(0.22, wingColor.replace(/0\.9[5]?\)/, '0.28)'))
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(center, center, 52, 0, Math.PI * 2)
  ctx.fill()

  // A dove silhouette remains legible at the scene's wide exploration zoom.
  ctx.font = '58px serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('🕊️', center, center + 2)

  ctx.fillStyle = bodyColor
  ctx.beginPath()
  ctx.arc(center + 21, center - 14, 4, 0, Math.PI * 2)
  ctx.fill()

  return canvas
}

/**
 * Creates a glowing faerie bird sprite for a cited top-level section.
 * @param {number} citationCount
 * @returns {THREE.Sprite}
 */
export function makeFaerieSprite(citationCount) {
  const faerieType = getFaerieType(citationCount)
  const texture = new THREE.CanvasTexture(makeFaerieCanvas(faerieType))
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const sprite = new THREE.Sprite(material)
  sprite.userData.faerieType = faerieType
  return sprite
}

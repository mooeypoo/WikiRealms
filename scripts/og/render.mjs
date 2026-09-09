#!/usr/bin/env node
/**
 * Rasterize the OG card HTML to public/og.png (1200×630) and a square
 * apple-touch-icon. Requires Google Chrome. Re-run after editing card.html.
 *
 *   node scripts/og/render.mjs
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const publicDir = join(root, 'public')
const cardHtml = join(root, 'scripts/og/card.html')
const chrome =
  process.env.CHROME_PATH ||
  ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => {
    try {
      return spawnSync(p, ['--version'], { encoding: 'utf8' }).status === 0
    } catch {
      return false
    }
  })

if (!chrome) {
  console.error('Chrome/Chromium not found. Set CHROME_PATH or install google-chrome.')
  process.exit(1)
}

mkdirSync(publicDir, { recursive: true })

/** Screenshot with virtual-time budget so Google Fonts can finish loading. */
function screenshotWithFonts(htmlPath, outPng, size) {
  const dir = mkdtempSync(join(tmpdir(), 'wikirealms-og-'))
  const shot = join(dir, 'shot.png')
  try {
    const result = spawnSync(
      chrome,
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        `--window-size=${size.width},${size.height}`,
        '--virtual-time-budget=3000',
        `--screenshot=${shot}`,
        pathToFileURL(htmlPath).href,
      ],
      { encoding: 'utf8' },
    )
    if (result.status !== 0) {
      console.error(result.stderr || result.stdout)
      process.exit(result.status ?? 1)
    }
    copyFileSync(shot, outPng)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const ogOut = join(publicDir, 'og.png')
screenshotWithFonts(cardHtml, ogOut, { width: 1200, height: 630 })
console.log(`wrote ${ogOut}`)

// Apple touch: crop-centered mark on void, 180×180
const iconHtml = join(dirname(cardHtml), 'icon.html')
const touchOut = join(publicDir, 'apple-touch-icon.png')
screenshotWithFonts(iconHtml, touchOut, { width: 180, height: 180 })
console.log(`wrote ${touchOut}`)

// Keep a static SVG favicon (no rasterize needed)
const favicon = join(publicDir, 'favicon.svg')
writeFileSync(
  favicon,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <rect width="32" height="32" rx="6" fill="#05070d"/>
  <path d="M16 5.5L25 16l-9 10.5L7 16z" stroke="#74d6e8" stroke-width="1.6" stroke-linejoin="round"/>
  <circle cx="16" cy="16" r="2.8" fill="#74d6e8"/>
</svg>
`,
)
console.log(`wrote ${favicon}`)

// Also export a portable SVG OG source (text may fall back without fonts)
const ogSvg = join(publicDir, 'og.svg')
writeFileSync(
  ogSvg,
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d1120"/>
      <stop offset="50%" stop-color="#05070d"/>
      <stop offset="100%" stop-color="#05070d"/>
    </linearGradient>
    <radialGradient id="haze" cx="72%" cy="42%" r="45%">
      <stop offset="0%" stop-color="#34597c" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#34597c" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="ocean" cx="38%" cy="36%" r="62%">
      <stop offset="0%" stop-color="#3a6d8c"/>
      <stop offset="55%" stop-color="#1e3f5a"/>
      <stop offset="100%" stop-color="#0f2438"/>
    </radialGradient>
    <radialGradient id="shade" cx="28%" cy="30%" r="78%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.14"/>
      <stop offset="42%" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="72%" stop-color="#05070d" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#05070d" stop-opacity="0.72"/>
    </radialGradient>
    <radialGradient id="atmos" cx="50%" cy="50%" r="50%">
      <stop offset="78%" stop-color="#74d6e8" stop-opacity="0"/>
      <stop offset="92%" stop-color="#74d6e8" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#34597c" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="disc"><circle cx="960" cy="300" r="168"/></clipPath>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#haze)"/>
  <rect x="28" y="28" width="1144" height="574" fill="none" stroke="rgba(163,184,205,0.22)" stroke-width="1"/>
  <path d="M28 46h18M28 28v18" stroke="#74d6e8" stroke-width="2" stroke-opacity="0.55"/>
  <path d="M1154 584h18M1172 566v18" stroke="#74d6e8" stroke-width="2" stroke-opacity="0.55" transform="translate(-18,0)"/>

  <!-- Static planet -->
  <circle cx="960" cy="300" r="188" fill="url(#atmos)"/>
  <circle cx="960" cy="300" r="172" fill="none" stroke="rgba(116,214,232,0.28)" stroke-width="1.25"/>
  <g clip-path="url(#disc)">
    <circle cx="960" cy="300" r="168" fill="url(#ocean)"/>
    <path d="M808 280 C840 220, 880 200, 925 215 C970 230, 985 270, 1030 265 C1075 260, 1100 220, 1130 235 L1140 280 C1110 265, 1080 300, 1040 315 C995 332, 970 370, 925 360 C880 350, 850 320, 820 325 Z" fill="#4f7a45" opacity="0.92"/>
    <path d="M825 320 C860 305, 890 325, 925 338 C965 352, 1000 340, 1035 348 C1070 356, 1095 380, 1120 370 L1115 410 C1080 425, 1040 405, 1000 412 C955 420, 915 445, 875 430 C845 418, 830 380, 825 320 Z" fill="#3f6b3a" opacity="0.95"/>
    <path d="M905 190 C930 165, 970 160, 1000 180 C1025 195, 1035 220, 1060 210 C1045 240, 1010 250, 980 235 C950 220, 925 225, 905 190 Z" fill="#6a9455" opacity="0.9"/>
    <path d="M905 190 C930 165, 970 160, 1000 180 C985 200, 955 205, 925 198 Z" fill="#e8eef5" opacity="0.85"/>
    <ellipse cx="945" cy="305" rx="28" ry="14" fill="#2a5a78" opacity="0.75" transform="rotate(-18 945 305)"/>
    <g stroke="rgba(233,237,243,0.1)" stroke-width="1" fill="none">
      <ellipse cx="960" cy="300" rx="160" ry="42"/>
      <ellipse cx="960" cy="300" rx="145" ry="95"/>
      <path d="M960 132 V468"/><path d="M800 300 H1120"/>
    </g>
    <circle cx="918" cy="268" r="4.5" fill="#74d6e8"/>
    <circle cx="998" cy="318" r="3.5" fill="#74d6e8" opacity="0.9"/>
    <circle cx="1042" cy="260" r="3" fill="#e0b878"/>
    <circle cx="960" cy="300" r="168" fill="url(#shade)"/>
  </g>
  <circle cx="960" cy="300" r="168" fill="none" stroke="rgba(163,184,205,0.35)" stroke-width="1.5"/>
  <path d="M840 215 C875 165, 940 145, 1005 165" stroke="rgba(233,237,243,0.35)" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.7"/>

  <g transform="translate(56,210)" fill="none" stroke="#74d6e8" stroke-width="4.5" stroke-linejoin="round">
    <path d="M0 36 L36 0 L72 36 L36 72 Z" transform="scale(1.15)"/>
    <circle cx="41.4" cy="41.4" r="9" fill="#74d6e8" stroke="none"/>
  </g>
  <text x="156" y="268" fill="#e9edf3" font-family="Space Grotesk, system-ui, sans-serif" font-size="72" font-weight="600" letter-spacing="-2">WikiRealms</text>
  <text x="56" y="340" fill="#a3b1c2" font-family="Space Grotesk, system-ui, sans-serif" font-size="28" font-weight="500">Every Wikipedia article is a world.</text>
  <text x="56" y="72" fill="#6c7b8e" font-family="IBM Plex Mono, ui-monospace, monospace" font-size="13" letter-spacing="1.8">EXPEDITION // EXPLORE KNOWLEDGE AS LANDSCAPE</text>
  <text x="56" y="582" fill="#6c7b8e" font-family="IBM Plex Mono, ui-monospace, monospace" font-size="13" letter-spacing="1">sections → ranges · links → portals</text>
</svg>
`,
)
console.log(`wrote ${ogSvg}`)

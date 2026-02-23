/**
 * Convert ZEP avatar layer PNGs into pixel-agents character spritesheets.
 *
 * Input (scripts/zep-source-avatars/):
 *   skin_0.png … skin_5.png      — skinface layer (432×256)
 *   clothes_0.png … clothes_5.png — clothes layer  (432×256)
 *   hair_0.png … hair_5.png       — hair layer      (432×256)
 *
 * ZEP layout: 9 cols × 4 rows of 48×64 frames (432×256 total)
 *   Frames are addressed by FLAT INDEX in a 9-col grid:
 *     flat index → col = index % 9, row = Math.floor(index / 9)
 *
 *   Flat indices per animation (from ZEP DEFAULT_ANIMS):
 *     down_idle:  0          down_walk: 1,2,3,4     down_sit: 32
 *     left_idle:  5          left_walk: 6,7,8,9     left_sit: 33
 *     right_idle: 10         right_walk: 11,12,13,14 right_sit: 34
 *     up_idle:    15         up_walk: 16,17,18,19   up_sit: 35
 *     dance: 20-27           jumps: 28-31
 *
 * pixel-agents output: 8 cols × 3 rows of 48×64 frames (384×192 total)
 *   Row 0 = down, Row 1 = up, Row 2 = right (left flipped at runtime)
 *   Col order: walk1, walk2, walk3, walk4, type1, type2, read1, read2
 *
 * Frame mapping (per direction):
 *   walk[0] → pa col 0 (walk1)
 *   walk[1] → pa col 1 (walk2)
 *   walk[2] → pa col 2 (walk3)
 *   walk[3] → pa col 3 (walk4)
 *   sit     → pa col 4 (type1)
 *   sit     → pa col 5 (type2, duplicate)
 *   idle    → pa col 6 (read1 / standing pose)
 *   idle    → pa col 7 (read2, duplicate)
 *
 * Run: npx tsx scripts/convert-zep-avatars.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import { PNG } from 'pngjs'

// ---------------------------------------------------------------------------
// ZEP source constants
// ---------------------------------------------------------------------------
const ZEP_FRAME_W = 48
const ZEP_FRAME_H = 64
const ZEP_COLS = 9   // 432 / 48

// ZEP flat indices per direction (from DEFAULT_ANIMS)
const ZEP_FRAMES = {
  down:  { idle: 0,  walk: [1, 2, 3, 4],     sit: 32 },
  left:  { idle: 5,  walk: [6, 7, 8, 9],     sit: 33 },
  right: { idle: 10, walk: [11, 12, 13, 14], sit: 34 },
  up:    { idle: 15, walk: [16, 17, 18, 19], sit: 35 },
} as const

// ---------------------------------------------------------------------------
// pixel-agents output constants
// ---------------------------------------------------------------------------
const PA_FRAME_W = 48
const PA_FRAME_H = 64
const PA_COLS = 8
// pixel-agents direction rows: 0=down, 1=up, 2=right (left flipped at runtime)
const PA_DIR_ORDER = ['down', 'up', 'right'] as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read a pixel from a pngjs PNG data buffer (RGBA). */
function getPixel(png: PNG, x: number, y: number): [number, number, number, number] {
  const idx = (y * png.width + x) * 4
  return [png.data[idx], png.data[idx + 1], png.data[idx + 2], png.data[idx + 3]]
}

/** Write a pixel into a pngjs PNG data buffer (RGBA). */
function setPixel(png: PNG, x: number, y: number, r: number, g: number, b: number, a: number): void {
  const idx = (y * png.width + x) * 4
  png.data[idx] = r
  png.data[idx + 1] = g
  png.data[idx + 2] = b
  png.data[idx + 3] = a
}

/**
 * Alpha-composite src over dst.
 * Uses standard Porter-Duff "over" formula.
 */
function compositeOver(
  dstR: number, dstG: number, dstB: number, dstA: number,
  srcR: number, srcG: number, srcB: number, srcA: number,
): [number, number, number, number] {
  const sa = srcA / 255
  const da = dstA / 255
  const outA = sa + da * (1 - sa)
  if (outA === 0) return [0, 0, 0, 0]
  const outR = (srcR * sa + dstR * da * (1 - sa)) / outA
  const outG = (srcG * sa + dstG * da * (1 - sa)) / outA
  const outB = (srcB * sa + dstB * da * (1 - sa)) / outA
  return [
    Math.round(outR),
    Math.round(outG),
    Math.round(outB),
    Math.round(outA * 255),
  ]
}

/**
 * Composite layers (in order: bottom → top) into a single PNG of the same dimensions.
 * All layers must have identical dimensions.
 */
function compositeLayers(layers: PNG[]): PNG {
  const width = layers[0].width
  const height = layers[0].height
  const out = new PNG({ width, height })

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let [r, g, b, a] = getPixel(layers[0], x, y)
      for (let l = 1; l < layers.length; l++) {
        const [sr, sg, sb, sa] = getPixel(layers[l], x, y)
        ;[r, g, b, a] = compositeOver(r, g, b, a, sr, sg, sb, sa)
      }
      setPixel(out, x, y, r, g, b, a)
    }
  }
  return out
}

/**
 * Copy a ZEP frame by FLAT INDEX into the output PNG.
 * Flat index is converted to col/row in the 9-column grid.
 */
function copyFlatFrame(
  src: PNG,
  out: PNG,
  flatIndex: number,
  paRow: number,
  paCol: number,
): void {
  const zepCol = flatIndex % ZEP_COLS
  const zepRow = Math.floor(flatIndex / ZEP_COLS)
  const srcBaseX = zepCol * ZEP_FRAME_W
  const srcBaseY = zepRow * ZEP_FRAME_H
  const outBaseX = paCol * PA_FRAME_W
  const outBaseY = paRow * PA_FRAME_H
  for (let dy = 0; dy < PA_FRAME_H; dy++) {
    for (let dx = 0; dx < PA_FRAME_W; dx++) {
      const [r, g, b, a] = getPixel(src, srcBaseX + dx, srcBaseY + dy)
      setPixel(out, outBaseX + dx, outBaseY + dy, r, g, b, a)
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const srcDir = path.join(__dirname, 'zep-source-avatars')
const outDir = path.join(__dirname, '..', 'webview-ui', 'public', 'assets', 'characters')
fs.mkdirSync(outDir, { recursive: true })

for (let i = 0; i < 6; i++) {
  // 1. Load and composite the 3 layers
  const layerNames = ['skin', 'clothes', 'hair'] as const
  const layers = layerNames.map(name => {
    const filePath = path.join(srcDir, `${name}_${i}.png`)
    const buf = fs.readFileSync(filePath)
    return PNG.sync.read(buf)
  })

  // Validate dimensions
  for (const layer of layers) {
    if (layer.width !== 432 || layer.height !== 256) {
      throw new Error(`Unexpected layer size: ${layer.width}×${layer.height} (expected 432×256)`)
    }
  }

  const composited = compositeLayers(layers)

  // 2. Build the pixel-agents output (384×192)
  const out = new PNG({ width: PA_FRAME_W * PA_COLS, height: PA_FRAME_H * PA_DIR_ORDER.length })
  // Zero-fill (transparent)
  out.data.fill(0)

  for (let paRow = 0; paRow < PA_DIR_ORDER.length; paRow++) {
    const dir = PA_DIR_ORDER[paRow]
    const frames = ZEP_FRAMES[dir]

    // pa col 0-3: walk frames
    for (let w = 0; w < 4; w++) {
      copyFlatFrame(composited, out, frames.walk[w], paRow, w)
    }
    // pa col 4: type1 → sit frame
    copyFlatFrame(composited, out, frames.sit, paRow, 4)
    // pa col 5: type2 → sit frame (duplicate)
    copyFlatFrame(composited, out, frames.sit, paRow, 5)
    // pa col 6: read1 → idle (standing pose)
    copyFlatFrame(composited, out, frames.idle, paRow, 6)
    // pa col 7: read2 → idle (duplicate)
    copyFlatFrame(composited, out, frames.idle, paRow, 7)
  }

  // 3. Write output
  const outPath = path.join(outDir, `char_${i}.png`)
  const outBuf = PNG.sync.write(out)
  fs.writeFileSync(outPath, outBuf)
  console.log(`Wrote char_${i}.png  (${out.width}x${out.height}, ${outBuf.length} bytes)`)
}

console.log('\nDone. Generated 6 character PNGs in webview-ui/public/assets/characters/')

/**
 * Convert ZEP avatar layer PNGs into pixel-agents character spritesheets.
 *
 * Input (scripts/zep-source-avatars/):
 *   skin_0.png … skin_5.png      — skinface layer (432×256)
 *   clothes_0.png … clothes_5.png — clothes layer  (432×256)
 *   hair_0.png … hair_5.png       — hair layer      (432×256)
 *
 * ZEP layout: 9 cols × 4 rows of 48×64 frames (432×256 total)
 *   Row 0 = down  (frames  0-4  : idle, walk1, walk2, walk3, unused)
 *   Row 1 = left  (frames  5-9  : idle, walk1, walk2, walk3, unused)
 *   Row 2 = right (frames 10-14 : idle, walk1, walk2, walk3, unused)
 *   Row 3 = up    (frames 15-19 : idle, walk1, walk2, walk3, unused)
 *   Sit frames (row 4, cols 0-3): 32=down_sit, 33=left_sit, 34=right_sit, 35=up_sit
 *     (sit row is row index 4 in 0-based, but stored starting at y=256; actually
 *      ZEP sit frames live at row index 4: y = 4*64 = 256 — outside the 256px canvas.
 *      Per ZEP source the sit indices are 32-35 in a flat 9-col grid:
 *        index 32 → col=32%9=5, row=floor(32/9)=3  → but that puts it at row 3 which is "up".
 *      Verified mapping: sit frames are at 9-col flat index:
 *        32 → col 5 row 3, 33 → col 6 row 3, 34 → col 7 row 3, 35 → col 8 row 3)
 *
 * pixel-agents output: 7 cols × 3 rows of 48×64 frames (336×192 total)
 *   Row 0 = down, Row 1 = up, Row 2 = right (left flipped at runtime)
 *   Col order: walk1, walk2(=idle), walk3, type1, type2, read1, read2
 *
 * Frame mapping (per direction):
 *   ZEP walk1  → pa col 0 (walk1)
 *   ZEP walk2  → pa col 1 (walk2 / idle stand)
 *   ZEP walk3  → pa col 2 (walk3)
 *   ZEP sit    → pa col 3 (type1)
 *   ZEP sit    → pa col 4 (type2, duplicate)
 *   ZEP idle   → pa col 5 (read1)
 *   ZEP idle   → pa col 6 (read2, duplicate)
 *
 * Direction mapping:
 *   ZEP row 0 (down)  → pa row 0
 *   ZEP row 3 (up)    → pa row 1
 *   ZEP row 2 (right) → pa row 2
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
// ZEP directions in row order: 0=down, 1=left, 2=right, 3=up
// Within each row: col0=idle, col1=walk1, col2=walk2, col3=walk3, col4=unused

// Sit frames: stored at flat frame index 32-35 in a 9-col grid
// index → { col: index % 9, row: Math.floor(index / 9) }
// 32 → col 5 row 3 (up-row), 33 → col 6 row 3, 34 → col 7 row 3, 35 → col 8 row 3
// ZEP direction for sit: 32=down_sit, 33=left_sit, 34=right_sit, 35=up_sit
const ZEP_SIT: Record<number, { flatIndex: number }> = {
  0: { flatIndex: 32 }, // down sit
  1: { flatIndex: 33 }, // left sit
  2: { flatIndex: 34 }, // right sit
  3: { flatIndex: 35 }, // up sit
}

// ---------------------------------------------------------------------------
// pixel-agents output constants
// ---------------------------------------------------------------------------
const PA_FRAME_W = 48
const PA_FRAME_H = 64
const PA_COLS = 7
// pa row → zep row
// pa row 0 (down)  → zep row 0
// pa row 1 (up)    → zep row 3
// pa row 2 (right) → zep row 2
const PA_DIR_TO_ZEP_ROW = [0, 3, 2] as const

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
 * Copy one ZEP frame (1:1, no scaling) into the output PNG.
 * Since PA_FRAME_W === ZEP_FRAME_W and PA_FRAME_H === ZEP_FRAME_H,
 * this is a direct pixel copy with no resampling.
 *
 * @param src      Composited ZEP spritesheet (432×256)
 * @param out      Output pixel-agents PNG (336×192)
 * @param zepRow   ZEP direction row
 * @param zepCol   ZEP column within that row
 * @param paRow    pixel-agents output row
 * @param paCol    pixel-agents output column
 */
function copyFrame(
  src: PNG,
  out: PNG,
  zepRow: number,
  zepCol: number,
  paRow: number,
  paCol: number,
): void {
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

/**
 * Copy a ZEP sit frame (accessed via flat index → col/row in 9-col grid).
 */
function copySitFrame(
  src: PNG,
  out: PNG,
  sitFlatIndex: number,
  paRow: number,
  paCol: number,
): void {
  const zepCol = sitFlatIndex % ZEP_COLS
  const zepRow = Math.floor(sitFlatIndex / ZEP_COLS)
  copyFrame(src, out, zepRow, zepCol, paRow, paCol)
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

  // 2. Build the pixel-agents output (112×96)
  const out = new PNG({ width: PA_FRAME_W * PA_COLS, height: PA_FRAME_H * PA_DIR_TO_ZEP_ROW.length })
  // Zero-fill (transparent)
  out.data.fill(0)

  for (let paRow = 0; paRow < PA_DIR_TO_ZEP_ROW.length; paRow++) {
    const zepRow = PA_DIR_TO_ZEP_ROW[paRow]
    const sitFlatIndex = ZEP_SIT[zepRow].flatIndex

    // ZEP col offsets within a direction row: 0=idle, 1=walk1, 2=walk2, 3=walk3
    // pa col 0: walk1 → zep col 1
    copyFrame(composited, out, zepRow, 1, paRow, 0)
    // pa col 1: walk2 (idle stand) → zep col 2
    copyFrame(composited, out, zepRow, 2, paRow, 1)
    // pa col 2: walk3 → zep col 3
    copyFrame(composited, out, zepRow, 3, paRow, 2)
    // pa col 3: type1 → sit frame
    copySitFrame(composited, out, sitFlatIndex, paRow, 3)
    // pa col 4: type2 → sit frame (duplicate)
    copySitFrame(composited, out, sitFlatIndex, paRow, 4)
    // pa col 5: read1 → zep idle (col 0)
    copyFrame(composited, out, zepRow, 0, paRow, 5)
    // pa col 6: read2 → zep idle (duplicate)
    copyFrame(composited, out, zepRow, 0, paRow, 6)
  }

  // 3. Write output
  const outPath = path.join(outDir, `char_${i}.png`)
  const outBuf = PNG.sync.write(out)
  fs.writeFileSync(outPath, outBuf)
  console.log(`Wrote char_${i}.png  (${out.width}x${out.height}, ${outBuf.length} bytes)`)
}

console.log('\nDone. Generated 6 character PNGs in webview-ui/public/assets/characters/')

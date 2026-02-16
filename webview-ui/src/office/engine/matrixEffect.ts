import type { Character, SpriteData } from '../types.js'
import { MATRIX_EFFECT_DURATION } from '../types.js'

const TRAIL_LENGTH = 6
const SPRITE_COLS = 16
const SPRITE_ROWS = 24

/** Hash-based flicker: ~70% visible for shimmer effect */
function flickerVisible(col: number, row: number, time: number): boolean {
  const t = Math.floor(time * 30) // 30fps flicker
  const hash = ((col * 7 + row * 13 + t * 31) & 0xff)
  return hash < 180
}

function generateSeeds(): number[] {
  const seeds: number[] = []
  for (let i = 0; i < SPRITE_COLS; i++) {
    seeds.push(Math.random())
  }
  return seeds
}

export { generateSeeds as matrixEffectSeeds }

/**
 * Render a character with a Matrix-style digital rain spawn/despawn effect.
 * Per-pixel rendering: each column sweeps top-to-bottom with a bright head and fading green trail.
 */
export function renderMatrixEffect(
  ctx: CanvasRenderingContext2D,
  ch: Character,
  spriteData: SpriteData,
  drawX: number,
  drawY: number,
  zoom: number,
): void {
  const progress = ch.matrixEffectTimer / MATRIX_EFFECT_DURATION
  const isSpawn = ch.matrixEffect === 'spawn'
  const time = ch.matrixEffectTimer
  const totalSweep = SPRITE_ROWS + TRAIL_LENGTH

  for (let col = 0; col < SPRITE_COLS; col++) {
    // Stagger: each column starts at a slightly different time
    const stagger = (ch.matrixEffectSeeds[col] ?? 0) * 0.3
    const colProgress = Math.max(0, Math.min(1, (progress - stagger) / (1 - 0.3)))
    const headRow = colProgress * totalSweep

    for (let row = 0; row < SPRITE_ROWS; row++) {
      const pixel = spriteData[row]?.[col]
      const hasPixel = pixel && pixel !== ''
      const distFromHead = headRow - row
      const px = drawX + col * zoom
      const py = drawY + row * zoom

      if (isSpawn) {
        // Spawn: head sweeps down revealing character pixels
        if (distFromHead < 0) {
          // Above head: invisible
          continue
        } else if (distFromHead < 1) {
          // Head pixel: bright white-green
          ctx.fillStyle = '#ccffcc'
          ctx.fillRect(px, py, zoom, zoom)
        } else if (distFromHead < TRAIL_LENGTH) {
          // Trail zone: show character pixel with green overlay, or just green if no pixel
          const trailPos = distFromHead / TRAIL_LENGTH
          if (hasPixel) {
            // Draw original pixel
            ctx.fillStyle = pixel
            ctx.fillRect(px, py, zoom, zoom)
            // Green overlay that fades as trail progresses
            const greenAlpha = (1 - trailPos) * 0.6
            if (flickerVisible(col, row, time)) {
              ctx.fillStyle = `rgba(0, 255, 65, ${greenAlpha})`
              ctx.fillRect(px, py, zoom, zoom)
            }
          } else {
            // No character pixel: fading green trail
            if (flickerVisible(col, row, time)) {
              const alpha = (1 - trailPos) * 0.5
              ctx.fillStyle = trailPos < 0.33 ? `rgba(0, 255, 65, ${alpha})`
                : trailPos < 0.66 ? `rgba(0, 170, 40, ${alpha})`
                  : `rgba(0, 85, 20, ${alpha})`
              ctx.fillRect(px, py, zoom, zoom)
            }
          }
        } else {
          // Below trail: normal character pixel
          if (hasPixel) {
            ctx.fillStyle = pixel
            ctx.fillRect(px, py, zoom, zoom)
          }
        }
      } else {
        // Despawn: head sweeps down consuming character pixels
        if (distFromHead < 0) {
          // Above head: normal character pixel (not yet consumed)
          if (hasPixel) {
            ctx.fillStyle = pixel
            ctx.fillRect(px, py, zoom, zoom)
          }
        } else if (distFromHead < 1) {
          // Head pixel: bright white-green
          ctx.fillStyle = '#ccffcc'
          ctx.fillRect(px, py, zoom, zoom)
        } else if (distFromHead < TRAIL_LENGTH) {
          // Trail zone: fading green
          if (flickerVisible(col, row, time)) {
            const trailPos = distFromHead / TRAIL_LENGTH
            const alpha = (1 - trailPos) * 0.5
            ctx.fillStyle = trailPos < 0.33 ? `rgba(0, 255, 65, ${alpha})`
              : trailPos < 0.66 ? `rgba(0, 170, 40, ${alpha})`
                : `rgba(0, 85, 20, ${alpha})`
            ctx.fillRect(px, py, zoom, zoom)
          }
        }
        // Below trail: nothing (consumed)
      }
    }
  }
}

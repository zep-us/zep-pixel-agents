import { TileType, TILE_SIZE, MAP_COLS, MAP_ROWS } from './types.js'
import type { TileType as TileTypeVal, FurnitureInstance, Character, SpriteData } from './types.js'
import { getCachedSprite } from './spriteCache.js'
import { getCharacterSprites } from './sprites.js'
import { getCharacterSprite } from './characters.js'

// ── Tile colors ─────────────────────────────────────────────────

const WALL_COLOR = '#3A3A5C'
const TILE_FLOOR_A = '#D4C9A8'
const TILE_FLOOR_B = '#CCC19E'
const WOOD_FLOOR_A = '#B08850'
const WOOD_FLOOR_B = '#A47D48'
const CARPET_COLOR = '#7B4F8A'
const DOORWAY_COLOR = '#9E8E70'

function getTileColor(tile: TileTypeVal, col: number, row: number): string {
  switch (tile) {
    case TileType.WALL:
      return WALL_COLOR
    case TileType.TILE_FLOOR:
      return (col + row) % 2 === 0 ? TILE_FLOOR_A : TILE_FLOOR_B
    case TileType.WOOD_FLOOR:
      return (col + row) % 2 === 0 ? WOOD_FLOOR_A : WOOD_FLOOR_B
    case TileType.CARPET:
      return CARPET_COLOR
    case TileType.DOORWAY:
      return DOORWAY_COLOR
    default:
      return '#000000'
  }
}

// ── Render functions ────────────────────────────────────────────

export function renderTileGrid(
  ctx: CanvasRenderingContext2D,
  tileMap: TileTypeVal[][],
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  const s = TILE_SIZE * zoom
  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      ctx.fillStyle = getTileColor(tileMap[r][c], c, r)
      ctx.fillRect(offsetX + c * s, offsetY + r * s, s, s)
    }
  }
}

interface ZDrawable {
  zY: number
  draw: (ctx: CanvasRenderingContext2D) => void
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  furniture: FurnitureInstance[],
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  const drawables: ZDrawable[] = []

  // Furniture
  for (const f of furniture) {
    const cached = getCachedSprite(f.sprite, zoom)
    const fx = offsetX + f.x * zoom
    const fy = offsetY + f.y * zoom
    drawables.push({
      zY: f.zY,
      draw: (c) => {
        c.drawImage(cached, fx, fy)
      },
    })
  }

  // Characters
  for (const ch of characters) {
    const sprites = getCharacterSprites(ch.palette)
    const spriteData = getCharacterSprite(ch, sprites)
    const cached = getCachedSprite(spriteData, zoom)
    // Anchor at bottom-center of character — round to integer device pixels
    const drawX = Math.round(offsetX + ch.x * zoom - cached.width / 2)
    const drawY = Math.round(offsetY + ch.y * zoom - cached.height)
    drawables.push({
      zY: ch.y, // sort by feet position
      draw: (c) => {
        c.drawImage(cached, drawX, drawY)
      },
    })
  }

  // Sort by Y (lower = in front = drawn later)
  drawables.sort((a, b) => a.zY - b.zY)

  for (const d of drawables) {
    d.draw(ctx)
  }
}

// ── Edit mode overlays ──────────────────────────────────────────

export function renderGridOverlay(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  const s = TILE_SIZE * zoom
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 1
  ctx.beginPath()
  // Vertical lines — offset by 0.5 for crisp 1px lines
  for (let c = 0; c <= MAP_COLS; c++) {
    const x = offsetX + c * s + 0.5
    ctx.moveTo(x, offsetY)
    ctx.lineTo(x, offsetY + MAP_ROWS * s)
  }
  // Horizontal lines
  for (let r = 0; r <= MAP_ROWS; r++) {
    const y = offsetY + r * s + 0.5
    ctx.moveTo(offsetX, y)
    ctx.lineTo(offsetX + MAP_COLS * s, y)
  }
  ctx.stroke()
}

export function renderGhostPreview(
  ctx: CanvasRenderingContext2D,
  sprite: SpriteData,
  col: number,
  row: number,
  valid: boolean,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  const cached = getCachedSprite(sprite, zoom)
  const x = offsetX + col * TILE_SIZE * zoom
  const y = offsetY + row * TILE_SIZE * zoom
  ctx.save()
  ctx.globalAlpha = 0.5
  ctx.drawImage(cached, x, y)
  // Tint overlay
  ctx.globalAlpha = 0.25
  ctx.fillStyle = valid ? '#00ff00' : '#ff0000'
  ctx.fillRect(x, y, cached.width, cached.height)
  ctx.restore()
}

export function renderSelectionHighlight(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  w: number,
  h: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  const s = TILE_SIZE * zoom
  const x = offsetX + col * s
  const y = offsetY + row * s
  ctx.save()
  ctx.strokeStyle = '#007fd4'
  ctx.lineWidth = 2
  ctx.setLineDash([4, 3])
  ctx.strokeRect(x + 1, y + 1, w * s - 2, h * s - 2)
  ctx.restore()
}

export interface EditorRenderState {
  showGrid: boolean
  ghostSprite: SpriteData | null
  ghostCol: number
  ghostRow: number
  ghostValid: boolean
  selectedCol: number
  selectedRow: number
  selectedW: number
  selectedH: number
  hasSelection: boolean
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  tileMap: TileTypeVal[][],
  furniture: FurnitureInstance[],
  characters: Character[],
  zoom: number,
  panX: number,
  panY: number,
  editor?: EditorRenderState,
): { offsetX: number; offsetY: number } {
  // Clear
  ctx.clearRect(0, 0, canvasWidth, canvasHeight)

  // Center map in viewport + pan offset (integer device pixels)
  const mapW = MAP_COLS * TILE_SIZE * zoom
  const mapH = MAP_ROWS * TILE_SIZE * zoom
  const offsetX = Math.floor((canvasWidth - mapW) / 2) + Math.round(panX)
  const offsetY = Math.floor((canvasHeight - mapH) / 2) + Math.round(panY)

  // Draw tiles
  renderTileGrid(ctx, tileMap, offsetX, offsetY, zoom)

  // Draw furniture + characters (z-sorted)
  renderScene(ctx, furniture, characters, offsetX, offsetY, zoom)

  // Editor overlays
  if (editor) {
    if (editor.showGrid) {
      renderGridOverlay(ctx, offsetX, offsetY, zoom)
    }
    if (editor.ghostSprite && editor.ghostCol >= 0 && editor.ghostRow >= 0) {
      renderGhostPreview(ctx, editor.ghostSprite, editor.ghostCol, editor.ghostRow, editor.ghostValid, offsetX, offsetY, zoom)
    }
    if (editor.hasSelection) {
      renderSelectionHighlight(ctx, editor.selectedCol, editor.selectedRow, editor.selectedW, editor.selectedH, offsetX, offsetY, zoom)
    }
  }

  return { offsetX, offsetY }
}

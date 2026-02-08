import { useRef, useEffect, useCallback } from 'react'
import type { OfficeState } from './officeState.js'
import type { EditorState } from './editorState.js'
import type { EditorRenderState } from './renderer.js'
import { startGameLoop } from './gameLoop.js'
import { renderFrame } from './renderer.js'
import { TILE_SIZE, MAP_COLS, MAP_ROWS, EditTool } from './types.js'
import { getCatalogEntry } from './furnitureCatalog.js'
import { canPlaceFurniture } from './editorActions.js'

interface OfficeCanvasProps {
  officeState: OfficeState
  onHover: (agentId: number | null, screenX: number, screenY: number) => void
  onClick: (agentId: number) => void
  isEditMode: boolean
  editorState: EditorState
  onEditorTileAction: (col: number, row: number) => void
  editorTick: number
  zoom: number
  onZoomChange: (zoom: number) => void
  panRef: React.MutableRefObject<{ x: number; y: number }>
}

export function OfficeCanvas({ officeState, onHover, onClick, isEditMode, editorState, onEditorTileAction, editorTick: _editorTick, zoom, onZoomChange, panRef }: OfficeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef({ x: 0, y: 0 })
  // Middle-mouse pan state (imperative, no re-renders)
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 })

  // Resize canvas backing store to device pixels (no DPR transform on ctx)
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const rect = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    // No ctx.scale(dpr) — we render directly in device pixels
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    resizeCanvas()

    const observer = new ResizeObserver(() => resizeCanvas())
    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    const stop = startGameLoop(canvas, {
      update: (dt) => {
        officeState.update(dt)
      },
      render: (ctx) => {
        // Canvas dimensions are in device pixels
        const w = canvas.width
        const h = canvas.height

        // Build editor render state
        let editorRender: EditorRenderState | undefined
        if (isEditMode) {
          editorRender = {
            showGrid: true,
            ghostSprite: null,
            ghostCol: editorState.ghostCol,
            ghostRow: editorState.ghostRow,
            ghostValid: editorState.ghostValid,
            selectedCol: 0,
            selectedRow: 0,
            selectedW: 0,
            selectedH: 0,
            hasSelection: false,
          }

          // Ghost preview for furniture placement
          if (editorState.activeTool === EditTool.FURNITURE_PLACE && editorState.ghostCol >= 0) {
            const entry = getCatalogEntry(editorState.selectedFurnitureType)
            if (entry) {
              editorRender.ghostSprite = entry.sprite
              editorRender.ghostValid = canPlaceFurniture(
                officeState.getLayout(),
                editorState.selectedFurnitureType,
                editorState.ghostCol,
                editorState.ghostRow,
              )
            }
          }

          // Selection highlight
          if (editorState.selectedFurnitureUid) {
            const item = officeState.getLayout().furniture.find((f) => f.uid === editorState.selectedFurnitureUid)
            if (item) {
              const entry = getCatalogEntry(item.type)
              if (entry) {
                editorRender.hasSelection = true
                editorRender.selectedCol = item.col
                editorRender.selectedRow = item.row
                editorRender.selectedW = entry.footprintW
                editorRender.selectedH = entry.footprintH
              }
            }
          }
        }

        const { offsetX, offsetY } = renderFrame(
          ctx,
          w,
          h,
          officeState.tileMap,
          officeState.furniture,
          officeState.getCharacters(),
          zoom,
          panRef.current.x,
          panRef.current.y,
          editorRender,
        )
        offsetRef.current = { x: offsetX, y: offsetY }
      },
    })

    return () => {
      stop()
      observer.disconnect()
    }
  }, [officeState, resizeCanvas, isEditMode, editorState, _editorTick, zoom, panRef])

  // Convert CSS mouse coords to world (sprite pixel) coords
  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      // CSS coords relative to canvas
      const cssX = clientX - rect.left
      const cssY = clientY - rect.top
      // Convert to device pixels
      const deviceX = cssX * dpr
      const deviceY = cssY * dpr
      // Convert to world (sprite pixel) coords
      const worldX = (deviceX - offsetRef.current.x) / zoom
      const worldY = (deviceY - offsetRef.current.y) / zoom
      return { worldX, worldY, screenX: cssX, screenY: cssY }
    },
    [zoom],
  )

  const screenToTile = useCallback(
    (clientX: number, clientY: number): { col: number; row: number } | null => {
      const pos = screenToWorld(clientX, clientY)
      if (!pos) return null
      const col = Math.floor(pos.worldX / TILE_SIZE)
      const row = Math.floor(pos.worldY / TILE_SIZE)
      if (col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) return null
      return { col, row }
    },
    [screenToWorld],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Handle middle-mouse panning
      if (isPanningRef.current) {
        const dpr = window.devicePixelRatio || 1
        const dx = (e.clientX - panStartRef.current.mouseX) * dpr
        const dy = (e.clientY - panStartRef.current.mouseY) * dpr
        panRef.current = {
          x: panStartRef.current.panX + dx,
          y: panStartRef.current.panY + dy,
        }
        return
      }

      if (isEditMode) {
        const tile = screenToTile(e.clientX, e.clientY)
        if (tile) {
          editorState.ghostCol = tile.col
          editorState.ghostRow = tile.row
          // Paint on drag
          if (editorState.isDragging && editorState.activeTool === EditTool.TILE_PAINT) {
            onEditorTileAction(tile.col, tile.row)
          }
        } else {
          editorState.ghostCol = -1
          editorState.ghostRow = -1
        }
        const canvas = canvasRef.current
        if (canvas) {
          canvas.style.cursor = 'crosshair'
        }
        return
      }

      const pos = screenToWorld(e.clientX, e.clientY)
      if (!pos) return
      const hitId = officeState.getCharacterAt(pos.worldX, pos.worldY)
      const canvas = canvasRef.current
      if (canvas) {
        canvas.style.cursor = hitId !== null ? 'pointer' : 'default'
      }
      const containerRect = containerRef.current?.getBoundingClientRect()
      const relX = containerRect ? e.clientX - containerRect.left : pos.screenX
      const relY = containerRect ? e.clientY - containerRect.top : pos.screenY
      onHover(hitId, relX, relY)
    },
    [officeState, onHover, screenToWorld, screenToTile, isEditMode, editorState, onEditorTileAction, panRef],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Middle mouse button (button 1) starts panning
      if (e.button === 1) {
        e.preventDefault()
        isPanningRef.current = true
        panStartRef.current = {
          mouseX: e.clientX,
          mouseY: e.clientY,
          panX: panRef.current.x,
          panY: panRef.current.y,
        }
        const canvas = canvasRef.current
        if (canvas) canvas.style.cursor = 'grabbing'
        return
      }

      if (!isEditMode) return
      editorState.isDragging = true
      const tile = screenToTile(e.clientX, e.clientY)
      if (tile) {
        onEditorTileAction(tile.col, tile.row)
      }
    },
    [isEditMode, editorState, screenToTile, onEditorTileAction, panRef],
  )

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1) {
        isPanningRef.current = false
        const canvas = canvasRef.current
        if (canvas) canvas.style.cursor = isEditMode ? 'crosshair' : 'default'
        return
      }
      editorState.isDragging = false
    },
    [editorState, isEditMode],
  )

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isEditMode) return // handled by mouseDown
      const pos = screenToWorld(e.clientX, e.clientY)
      if (!pos) return
      const hitId = officeState.getCharacterAt(pos.worldX, pos.worldY)
      if (hitId !== null) {
        onClick(hitId)
      }
    },
    [officeState, onClick, screenToWorld, isEditMode],
  )

  const handleMouseLeave = useCallback(() => {
    isPanningRef.current = false
    editorState.isDragging = false
    editorState.ghostCol = -1
    editorState.ghostRow = -1
    if (!isEditMode) {
      onHover(null, 0, 0)
    }
  }, [onHover, editorState, isEditMode])

  // Ctrl+wheel to zoom in/out by integer steps
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const delta = e.deltaY < 0 ? 1 : -1
      const newZoom = Math.max(1, Math.min(10, zoom + delta))
      if (newZoom !== zoom) {
        onZoomChange(newZoom)
      }
    },
    [zoom, onZoomChange],
  )

  // Prevent default middle-click browser behavior (auto-scroll)
  const handleAuxClick = useCallback((e: React.MouseEvent) => {
    if (e.button === 1) e.preventDefault()
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: '#1E1E2E',
      }}
    >
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        onAuxClick={handleAuxClick}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        style={{ display: 'block' }}
      />
    </div>
  )
}

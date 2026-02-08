import { EditTool, TileType, FurnitureType } from './types.js'
import type { TileType as TileTypeVal } from './types.js'
import { FURNITURE_CATALOG } from './furnitureCatalog.js'
import { getCachedSprite } from './spriteCache.js'

const TILE_OPTIONS: Array<{ type: TileTypeVal; label: string; color: string }> = [
  { type: TileType.WALL, label: 'Wall', color: '#3A3A5C' },
  { type: TileType.TILE_FLOOR, label: 'Tile', color: '#D4C9A8' },
  { type: TileType.WOOD_FLOOR, label: 'Wood', color: '#B08850' },
  { type: TileType.CARPET, label: 'Carpet', color: '#7B4F8A' },
  { type: TileType.DOORWAY, label: 'Door', color: '#9E8E70' },
]

const btnStyle: React.CSSProperties = {
  padding: '3px 8px',
  fontSize: '11px',
  background: 'var(--vscode-button-secondaryBackground, #3A3D41)',
  color: 'var(--vscode-button-secondaryForeground, #ccc)',
  border: '1px solid transparent',
  borderRadius: 3,
  cursor: 'pointer',
}

const activeBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: 'var(--vscode-button-background)',
  color: 'var(--vscode-button-foreground)',
  border: '1px solid var(--vscode-focusBorder, #007fd4)',
}

interface EditorToolbarProps {
  activeTool: EditTool
  selectedTileType: TileTypeVal
  selectedFurnitureType: FurnitureType
  selectedFurnitureUid: string | null
  onToolChange: (tool: EditTool) => void
  onTileTypeChange: (type: TileTypeVal) => void
  onFurnitureTypeChange: (type: FurnitureType) => void
  onDeleteSelected: () => void
  onUndo: () => void
  onReset: () => void
}

export function EditorToolbar({
  activeTool,
  selectedTileType,
  selectedFurnitureType,
  selectedFurnitureUid,
  onToolChange,
  onTileTypeChange,
  onFurnitureTypeChange,
  onDeleteSelected,
  onUndo,
  onReset,
}: EditorToolbarProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 36,
        left: 8,
        zIndex: 50,
        background: 'rgba(30,30,46,0.85)',
        border: '1px solid var(--vscode-editorWidget-border, #454545)',
        borderRadius: 4,
        padding: '6px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        maxWidth: 300,
      }}
    >
      {/* Tool row */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button
          style={activeTool === EditTool.SELECT ? activeBtnStyle : btnStyle}
          onClick={() => onToolChange(EditTool.SELECT)}
          title="Select furniture"
        >
          Select
        </button>
        <button
          style={activeTool === EditTool.TILE_PAINT ? activeBtnStyle : btnStyle}
          onClick={() => onToolChange(EditTool.TILE_PAINT)}
          title="Paint floor/wall tiles"
        >
          Paint
        </button>
        <button
          style={activeTool === EditTool.FURNITURE_PLACE ? activeBtnStyle : btnStyle}
          onClick={() => onToolChange(EditTool.FURNITURE_PLACE)}
          title="Place furniture"
        >
          Place
        </button>
        <button
          style={activeTool === EditTool.ERASER ? activeBtnStyle : btnStyle}
          onClick={() => onToolChange(EditTool.ERASER)}
          title="Erase furniture"
        >
          Erase
        </button>
        <button style={btnStyle} onClick={onUndo} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button style={btnStyle} onClick={onReset} title="Reset to default layout">
          Reset
        </button>
      </div>

      {/* Sub-panel: Tile types */}
      {activeTool === EditTool.TILE_PAINT && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {TILE_OPTIONS.map((t) => (
            <button
              key={t.type}
              onClick={() => onTileTypeChange(t.type)}
              title={t.label}
              style={{
                width: 24,
                height: 24,
                background: t.color,
                border: selectedTileType === t.type ? '2px solid var(--vscode-focusBorder, #007fd4)' : '1px solid #555',
                borderRadius: 3,
                cursor: 'pointer',
                padding: 0,
              }}
            />
          ))}
        </div>
      )}

      {/* Sub-panel: Furniture types */}
      {activeTool === EditTool.FURNITURE_PLACE && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {FURNITURE_CATALOG.map((entry) => {
            const cached = getCachedSprite(entry.sprite, 2)
            const thumbSize = 28
            const isSelected = selectedFurnitureType === entry.type
            return (
              <button
                key={entry.type}
                onClick={() => onFurnitureTypeChange(entry.type)}
                title={entry.label}
                style={{
                  width: thumbSize,
                  height: thumbSize,
                  background: '#2A2A3A',
                  border: isSelected ? '2px solid var(--vscode-focusBorder, #007fd4)' : '1px solid #555',
                  borderRadius: 3,
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                <canvas
                  ref={(el) => {
                    if (!el) return
                    const ctx = el.getContext('2d')
                    if (!ctx) return
                    const scale = Math.min(thumbSize / cached.width, thumbSize / cached.height) * 0.8
                    el.width = thumbSize
                    el.height = thumbSize
                    ctx.imageSmoothingEnabled = false
                    ctx.clearRect(0, 0, thumbSize, thumbSize)
                    const dw = cached.width * scale
                    const dh = cached.height * scale
                    ctx.drawImage(cached, (thumbSize - dw) / 2, (thumbSize - dh) / 2, dw, dh)
                  }}
                  style={{ width: thumbSize, height: thumbSize }}
                />
              </button>
            )
          })}
        </div>
      )}

      {/* Sub-panel: Selection actions */}
      {activeTool === EditTool.SELECT && selectedFurnitureUid && (
        <div style={{ display: 'flex', gap: 4 }}>
          <button style={btnStyle} onClick={onDeleteSelected} title="Delete selected furniture (Del)">
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

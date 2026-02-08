import { useState, useEffect, useCallback, useRef } from 'react'
import { OfficeState } from './office/officeState.js'
import { OfficeCanvas } from './office/OfficeCanvas.js'
import { ToolOverlay } from './office/ToolOverlay.js'
import { EditorToolbar } from './office/EditorToolbar.js'
import { EditorState } from './office/editorState.js'
import { EditTool, TILE_SIZE, MAP_COLS, MAP_ROWS } from './office/types.js'
import type { OfficeLayout, FurnitureType, EditTool as EditToolType, TileType as TileTypeVal } from './office/types.js'
import { createDefaultLayout } from './office/layoutSerializer.js'
import { paintTile, placeFurniture, removeFurniture, canPlaceFurniture } from './office/editorActions.js'
import { getCatalogEntry } from './office/furnitureCatalog.js'

/** Compute a default integer zoom level (device pixels per sprite pixel) */
function defaultZoom(): number {
  const dpr = window.devicePixelRatio || 1
  return Math.max(1, Math.round(2 * dpr))
}

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void }

const vscode = acquireVsCodeApi()

// Game state lives outside React — updated imperatively by message handlers
const officeStateRef = { current: null as OfficeState | null }
const editorState = new EditorState()

/** Map status prefixes back to tool names for animation selection */
const STATUS_TO_TOOL: Record<string, string> = {
  'Reading': 'Read',
  'Searching': 'Grep',
  'Globbing': 'Glob',
  'Fetching': 'WebFetch',
  'Searching web': 'WebSearch',
  'Writing': 'Write',
  'Editing': 'Edit',
  'Running': 'Bash',
  'Task': 'Task',
}

function extractToolName(status: string): string | null {
  for (const [prefix, tool] of Object.entries(STATUS_TO_TOOL)) {
    if (status.startsWith(prefix)) return tool
  }
  const first = status.split(/[\s:]/)[0]
  return first || null
}

interface ToolActivity {
  toolId: string
  status: string
  done: boolean
  permissionWait?: boolean
}

function getOfficeState(): OfficeState {
  if (!officeStateRef.current) {
    officeStateRef.current = new OfficeState()
  }
  return officeStateRef.current
}

function App() {
  const [agents, setAgents] = useState<number[]>([])
  const [, setSelectedAgent] = useState<number | null>(null)
  const [agentTools, setAgentTools] = useState<Record<number, ToolActivity[]>>({})
  const [agentStatuses, setAgentStatuses] = useState<Record<number, string>>({})
  const [subagentTools, setSubagentTools] = useState<Record<number, Record<string, ToolActivity[]>>>({})
  const [isEditMode, setIsEditMode] = useState(false)
  const [editorTick, setEditorTick] = useState(0) // force re-render for editor state changes
  const [zoom, setZoom] = useState(defaultZoom)
  const [hoveredAgent, setHoveredAgent] = useState<number | null>(null)
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 })
  const [layoutReady, setLayoutReady] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panRef = useRef({ x: 0, y: 0 })

  // Debounced layout save
  const saveLayout = useCallback((layout: OfficeLayout) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      vscode.postMessage({ type: 'saveLayout', layout })
    }, 500)
  }, [])

  // Apply a layout edit: push undo, rebuild state, save
  const applyEdit = useCallback((newLayout: OfficeLayout) => {
    const os = getOfficeState()
    editorState.pushUndo(os.getLayout())
    os.rebuildFromLayout(newLayout)
    saveLayout(newLayout)
    setEditorTick((n) => n + 1)
  }, [saveLayout])

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data
      const os = getOfficeState()

      if (msg.type === 'layoutLoaded') {
        const layout = msg.layout as OfficeLayout | null
        if (layout && layout.version === 1) {
          os.rebuildFromLayout(layout)
        }
        setLayoutReady(true)
      } else if (msg.type === 'agentCreated') {
        const id = msg.id as number
        setAgents((prev) => (prev.includes(id) ? prev : [...prev, id]))
        setSelectedAgent(id)
        os.addAgent(id)
      } else if (msg.type === 'agentClosed') {
        const id = msg.id as number
        setAgents((prev) => prev.filter((a) => a !== id))
        setSelectedAgent((prev) => (prev === id ? null : prev))
        setAgentTools((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        setAgentStatuses((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        setSubagentTools((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        os.removeAgent(id)
      } else if (msg.type === 'existingAgents') {
        const incoming = msg.agents as number[]
        setAgents((prev) => {
          const ids = new Set(prev)
          const merged = [...prev]
          for (const id of incoming) {
            if (!ids.has(id)) {
              merged.push(id)
              os.addAgent(id)
            }
          }
          return merged.sort((a, b) => a - b)
        })
      } else if (msg.type === 'agentToolStart') {
        const id = msg.id as number
        const toolId = msg.toolId as string
        const status = msg.status as string
        setAgentTools((prev) => {
          const list = prev[id] || []
          if (list.some((t) => t.toolId === toolId)) return prev
          return { ...prev, [id]: [...list, { toolId, status, done: false }] }
        })
        const toolName = extractToolName(status)
        os.setAgentTool(id, toolName)
        os.setAgentActive(id, true)
      } else if (msg.type === 'agentToolDone') {
        const id = msg.id as number
        const toolId = msg.toolId as string
        setAgentTools((prev) => {
          const list = prev[id]
          if (!list) return prev
          return {
            ...prev,
            [id]: list.map((t) => (t.toolId === toolId ? { ...t, done: true } : t)),
          }
        })
      } else if (msg.type === 'agentToolsClear') {
        const id = msg.id as number
        setAgentTools((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        setSubagentTools((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        os.setAgentTool(id, null)
      } else if (msg.type === 'agentSelected') {
        const id = msg.id as number
        setSelectedAgent(id)
      } else if (msg.type === 'agentStatus') {
        const id = msg.id as number
        const status = msg.status as string
        setAgentStatuses((prev) => {
          if (status === 'active') {
            if (!(id in prev)) return prev
            const next = { ...prev }
            delete next[id]
            return next
          }
          return { ...prev, [id]: status }
        })
        os.setAgentActive(id, status === 'active')
      } else if (msg.type === 'agentToolPermission') {
        const id = msg.id as number
        setAgentTools((prev) => {
          const list = prev[id]
          if (!list) return prev
          return {
            ...prev,
            [id]: list.map((t) => (t.done ? t : { ...t, permissionWait: true })),
          }
        })
      } else if (msg.type === 'agentToolPermissionClear') {
        const id = msg.id as number
        setAgentTools((prev) => {
          const list = prev[id]
          if (!list) return prev
          const hasPermission = list.some((t) => t.permissionWait)
          if (!hasPermission) return prev
          return {
            ...prev,
            [id]: list.map((t) => (t.permissionWait ? { ...t, permissionWait: false } : t)),
          }
        })
      } else if (msg.type === 'subagentToolStart') {
        const id = msg.id as number
        const parentToolId = msg.parentToolId as string
        const toolId = msg.toolId as string
        const status = msg.status as string
        setSubagentTools((prev) => {
          const agentSubs = prev[id] || {}
          const list = agentSubs[parentToolId] || []
          if (list.some((t) => t.toolId === toolId)) return prev
          return { ...prev, [id]: { ...agentSubs, [parentToolId]: [...list, { toolId, status, done: false }] } }
        })
      } else if (msg.type === 'subagentToolDone') {
        const id = msg.id as number
        const parentToolId = msg.parentToolId as string
        const toolId = msg.toolId as string
        setSubagentTools((prev) => {
          const agentSubs = prev[id]
          if (!agentSubs) return prev
          const list = agentSubs[parentToolId]
          if (!list) return prev
          return {
            ...prev,
            [id]: { ...agentSubs, [parentToolId]: list.map((t) => (t.toolId === toolId ? { ...t, done: true } : t)) },
          }
        })
      } else if (msg.type === 'subagentClear') {
        const id = msg.id as number
        const parentToolId = msg.parentToolId as string
        setSubagentTools((prev) => {
          const agentSubs = prev[id]
          if (!agentSubs || !(parentToolId in agentSubs)) return prev
          const next = { ...agentSubs }
          delete next[parentToolId]
          if (Object.keys(next).length === 0) {
            const outer = { ...prev }
            delete outer[id]
            return outer
          }
          return { ...prev, [id]: next }
        })
      }
    }
    window.addEventListener('message', handler)
    vscode.postMessage({ type: 'webviewReady' })
    return () => window.removeEventListener('message', handler)
  }, [])

  // Keyboard handlers for edit mode
  useEffect(() => {
    if (!isEditMode) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        editorState.clearSelection()
        editorState.clearGhost()
        setEditorTick((n) => n + 1)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (editorState.selectedFurnitureUid) {
          handleDeleteSelected()
        }
      } else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        handleUndo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isEditMode])

  const handleOpenClaude = () => {
    vscode.postMessage({ type: 'openClaude' })
  }

  const handleHover = useCallback((agentId: number | null, screenX: number, screenY: number) => {
    setHoveredAgent(agentId)
    setHoverPos({ x: screenX, y: screenY })
  }, [])

  const handleClick = useCallback((agentId: number) => {
    setSelectedAgent(agentId)
    vscode.postMessage({ type: 'focusAgent', id: agentId })
  }, [])

  // Editor callbacks
  const handleToolChange = useCallback((tool: EditToolType) => {
    editorState.activeTool = tool
    editorState.clearSelection()
    editorState.clearGhost()
    setEditorTick((n) => n + 1)
  }, [])

  const handleTileTypeChange = useCallback((type: TileTypeVal) => {
    editorState.selectedTileType = type
    setEditorTick((n) => n + 1)
  }, [])

  const handleFurnitureTypeChange = useCallback((type: FurnitureType) => {
    editorState.selectedFurnitureType = type
    setEditorTick((n) => n + 1)
  }, [])

  const handleDeleteSelected = useCallback(() => {
    const uid = editorState.selectedFurnitureUid
    if (!uid) return
    const os = getOfficeState()
    const newLayout = removeFurniture(os.getLayout(), uid)
    if (newLayout !== os.getLayout()) {
      applyEdit(newLayout)
      editorState.clearSelection()
    }
  }, [applyEdit])

  const handleUndo = useCallback(() => {
    const prev = editorState.popUndo()
    if (!prev) return
    const os = getOfficeState()
    os.rebuildFromLayout(prev)
    saveLayout(prev)
    setEditorTick((n) => n + 1)
  }, [saveLayout])

  const handleReset = useCallback(() => {
    const defaultLayout = createDefaultLayout()
    applyEdit(defaultLayout)
    editorState.reset()
  }, [applyEdit])

  const handleZoomChange = useCallback((newZoom: number) => {
    setZoom(Math.max(1, Math.min(10, newZoom)))
  }, [])

  const handleToggleEditMode = useCallback(() => {
    setIsEditMode((prev) => {
      const next = !prev
      editorState.isEditMode = next
      if (!next) {
        editorState.clearSelection()
        editorState.clearGhost()
      }
      return next
    })
  }, [])

  // Edit mode tile click/drag handler
  const handleEditorTileAction = useCallback((col: number, row: number) => {
    const os = getOfficeState()
    const layout = os.getLayout()

    if (editorState.activeTool === EditTool.TILE_PAINT) {
      const newLayout = paintTile(layout, col, row, editorState.selectedTileType)
      if (newLayout !== layout) {
        applyEdit(newLayout)
      }
    } else if (editorState.activeTool === EditTool.FURNITURE_PLACE) {
      const type = editorState.selectedFurnitureType
      if (canPlaceFurniture(layout, type, col, row)) {
        const uid = `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        const newLayout = placeFurniture(layout, { uid, type, col, row })
        if (newLayout !== layout) {
          applyEdit(newLayout)
        }
      }
    } else if (editorState.activeTool === EditTool.ERASER) {
      // Find and remove furniture at this tile
      const hit = layout.furniture.find((f) => {
        const entry = getCatalogEntry(f.type)
        if (!entry) return false
        return col >= f.col && col < f.col + entry.footprintW && row >= f.row && row < f.row + entry.footprintH
      })
      if (hit) {
        const newLayout = removeFurniture(layout, hit.uid)
        if (newLayout !== layout) {
          applyEdit(newLayout)
        }
      }
    } else if (editorState.activeTool === EditTool.SELECT) {
      // Select furniture at this tile
      const hit = layout.furniture.find((f) => {
        const entry = getCatalogEntry(f.type)
        if (!entry) return false
        return col >= f.col && col < f.col + entry.footprintW && row >= f.row && row < f.row + entry.footprintH
      })
      editorState.selectedFurnitureUid = hit ? hit.uid : null
      setEditorTick((n) => n + 1)
    }
  }, [applyEdit])

  // _editorTick is used for dependency tracking to force re-renders
  const _editorTick = editorTick

  const officeState = getOfficeState()

  if (!layoutReady) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--vscode-foreground)' }}>
        Loading...
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @keyframes arcadia-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .arcadia-pulse { animation: arcadia-pulse 1.5s ease-in-out infinite; }
      `}</style>

      {/* Office canvas fills entire panel */}
      <OfficeCanvas
        officeState={officeState}
        onHover={handleHover}
        onClick={handleClick}
        isEditMode={isEditMode}
        editorState={editorState}
        onEditorTileAction={handleEditorTileAction}
        editorTick={_editorTick}
        zoom={zoom}
        onZoomChange={handleZoomChange}
        panRef={panRef}
      />

      {/* Floating buttons in top-left corner */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          display: 'flex',
          gap: 6,
          zIndex: 50,
        }}
      >
        <button
          onClick={handleOpenClaude}
          style={{
            padding: '5px 10px',
            fontSize: '12px',
            background: 'var(--vscode-button-background)',
            color: 'var(--vscode-button-foreground)',
            border: 'none',
            borderRadius: 3,
            cursor: 'pointer',
            opacity: 0.9,
          }}
        >
          + Agent
        </button>
        <button
          onClick={() => vscode.postMessage({ type: 'openSessionsFolder' })}
          style={{
            padding: '5px 10px',
            fontSize: '12px',
            background: 'var(--vscode-button-secondaryBackground, #3A3D41)',
            color: 'var(--vscode-button-secondaryForeground, #ccc)',
            border: 'none',
            borderRadius: 3,
            cursor: 'pointer',
            opacity: 0.9,
          }}
          title="Open JSONL sessions folder"
        >
          Sessions
        </button>
        <button
          onClick={handleToggleEditMode}
          style={{
            padding: '5px 10px',
            fontSize: '12px',
            background: isEditMode
              ? 'var(--vscode-button-background)'
              : 'var(--vscode-button-secondaryBackground, #3A3D41)',
            color: isEditMode
              ? 'var(--vscode-button-foreground)'
              : 'var(--vscode-button-secondaryForeground, #ccc)',
            border: isEditMode ? '1px solid var(--vscode-focusBorder, #007fd4)' : 'none',
            borderRadius: 3,
            cursor: 'pointer',
            opacity: 0.9,
          }}
          title="Toggle edit mode"
        >
          Edit
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 4 }}>
          <button
            onClick={() => handleZoomChange(zoom - 1)}
            disabled={zoom <= 1}
            style={{
              width: 22,
              height: 22,
              fontSize: '14px',
              lineHeight: '14px',
              padding: 0,
              background: 'var(--vscode-button-secondaryBackground, #3A3D41)',
              color: 'var(--vscode-button-secondaryForeground, #ccc)',
              border: 'none',
              borderRadius: 3,
              cursor: zoom <= 1 ? 'default' : 'pointer',
              opacity: zoom <= 1 ? 0.4 : 0.9,
            }}
            title="Zoom out (Ctrl+Scroll)"
          >
            -
          </button>
          <span style={{ fontSize: '11px', color: 'var(--vscode-foreground)', minWidth: 20, textAlign: 'center', opacity: 0.7 }}>
            {zoom}x
          </span>
          <button
            onClick={() => handleZoomChange(zoom + 1)}
            disabled={zoom >= 10}
            style={{
              width: 22,
              height: 22,
              fontSize: '14px',
              lineHeight: '14px',
              padding: 0,
              background: 'var(--vscode-button-secondaryBackground, #3A3D41)',
              color: 'var(--vscode-button-secondaryForeground, #ccc)',
              border: 'none',
              borderRadius: 3,
              cursor: zoom >= 10 ? 'default' : 'pointer',
              opacity: zoom >= 10 ? 0.4 : 0.9,
            }}
            title="Zoom in (Ctrl+Scroll)"
          >
            +
          </button>
        </div>
      </div>

      {/* Editor toolbar */}
      {isEditMode && (
        <EditorToolbar
          activeTool={editorState.activeTool}
          selectedTileType={editorState.selectedTileType}
          selectedFurnitureType={editorState.selectedFurnitureType}
          selectedFurnitureUid={editorState.selectedFurnitureUid}
          onToolChange={handleToolChange}
          onTileTypeChange={handleTileTypeChange}
          onFurnitureTypeChange={handleFurnitureTypeChange}
          onDeleteSelected={handleDeleteSelected}
          onUndo={handleUndo}
          onReset={handleReset}
        />
      )}

      {/* Agent name labels above characters */}
      <AgentLabels officeState={officeState} agents={agents} agentStatuses={agentStatuses} containerRef={containerRef} zoom={zoom} panRef={panRef} />

      {/* Hover tooltip */}
      <ToolOverlay
        agentId={hoveredAgent}
        screenX={hoverPos.x}
        screenY={hoverPos.y}
        agentTools={agentTools}
        agentStatuses={agentStatuses}
        subagentTools={subagentTools}
      />
    </div>
  )
}

/** Small name labels + status dots floating above each character */
function AgentLabels({
  officeState,
  agents,
  agentStatuses,
  containerRef,
  zoom,
  panRef,
}: {
  officeState: OfficeState
  agents: number[]
  agentStatuses: Record<number, string>
  containerRef: React.RefObject<HTMLDivElement | null>
  zoom: number
  panRef: React.RefObject<{ x: number; y: number }>
}) {
  const [, setTick] = useState(0)
  useEffect(() => {
    let rafId = 0
    const tick = () => {
      setTick((n) => n + 1)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  const el = containerRef.current
  if (!el) return null
  const rect = el.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  // Compute device pixel offset (same math as renderFrame, including pan)
  const canvasW = Math.round(rect.width * dpr)
  const canvasH = Math.round(rect.height * dpr)
  const mapW = MAP_COLS * TILE_SIZE * zoom
  const mapH = MAP_ROWS * TILE_SIZE * zoom
  const deviceOffsetX = Math.floor((canvasW - mapW) / 2) + Math.round(panRef.current.x)
  const deviceOffsetY = Math.floor((canvasH - mapH) / 2) + Math.round(panRef.current.y)

  return (
    <>
      {agents.map((id) => {
        const ch = officeState.characters.get(id)
        if (!ch) return null

        // Character position: device pixels → CSS pixels
        const screenX = (deviceOffsetX + ch.x * zoom) / dpr
        const screenY = (deviceOffsetY + (ch.y - 24) * zoom) / dpr

        const status = agentStatuses[id]
        const isWaiting = status === 'waiting'
        const isActive = ch.isActive

        let dotColor = 'transparent'
        if (isWaiting) {
          dotColor = 'var(--vscode-charts-yellow, #cca700)'
        } else if (isActive) {
          dotColor = 'var(--vscode-charts-blue, #3794ff)'
        }

        return (
          <div
            key={id}
            style={{
              position: 'absolute',
              left: screenX,
              top: screenY - 16,
              transform: 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              pointerEvents: 'none',
              zIndex: 40,
            }}
          >
            {dotColor !== 'transparent' && (
              <span
                className={isActive && !isWaiting ? 'arcadia-pulse' : undefined}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: dotColor,
                  marginBottom: 2,
                }}
              />
            )}
            <span
              style={{
                fontSize: '9px',
                color: 'var(--vscode-foreground)',
                background: 'rgba(30,30,46,0.7)',
                padding: '1px 4px',
                borderRadius: 2,
                whiteSpace: 'nowrap',
              }}
            >
              Agent #{id}
            </span>
          </div>
        )
      })}
    </>
  )
}

export default App

import { useState } from 'react'
import { SettingsModal } from './SettingsModal.js'

interface BottomToolbarProps {
  isEditMode: boolean
  onOpenClaude: () => void
  onToggleEditMode: () => void
  isDebugMode: boolean
  onToggleDebugMode: () => void
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 10,
  left: 10,
  zIndex: 50,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  background: '#1e1e2e',
  border: '2px solid #4a4a6a',
  borderRadius: 0,
  padding: '4px 6px',
  boxShadow: '2px 2px 0px #0a0a14',
}

const btnBase: React.CSSProperties = {
  padding: '5px 10px',
  fontSize: '24px',
  color: 'rgba(255, 255, 255, 0.8)',
  background: 'rgba(255, 255, 255, 0.08)',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
}

const btnActive: React.CSSProperties = {
  ...btnBase,
  background: 'rgba(90, 140, 255, 0.25)',
  border: '2px solid #5a8cff',
}


export function BottomToolbar({
  isEditMode,
  onOpenClaude,
  onToggleEditMode,
  isDebugMode,
  onToggleDebugMode,
}: BottomToolbarProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  return (
    <div style={panelStyle}>
      <button
        onClick={onOpenClaude}
        onMouseEnter={() => setHovered('agent')}
        onMouseLeave={() => setHovered(null)}
        style={{
          ...btnBase,
          padding: '5px 12px',
          background:
            hovered === 'agent'
              ? 'rgba(90, 200, 140, 0.3)'
              : 'rgba(90, 200, 140, 0.15)',
          border: '2px solid #5ac88c',
          color: 'rgba(200, 255, 220, 0.95)',
        }}
      >
        + Agent
      </button>
      <button
        onClick={onToggleEditMode}
        onMouseEnter={() => setHovered('edit')}
        onMouseLeave={() => setHovered(null)}
        style={
          isEditMode
            ? { ...btnActive }
            : {
                ...btnBase,
                background: hovered === 'edit' ? 'rgba(255, 255, 255, 0.15)' : btnBase.background,
              }
        }
        title="Edit office layout"
      >
        Layout
      </button>
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setIsSettingsOpen((v) => !v)}
          onMouseEnter={() => setHovered('settings')}
          onMouseLeave={() => setHovered(null)}
          style={
            isSettingsOpen
              ? { ...btnActive }
              : {
                  ...btnBase,
                  background: hovered === 'settings' ? 'rgba(255, 255, 255, 0.15)' : btnBase.background,
                }
          }
          title="Settings"
        >
          Settings
        </button>
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          isDebugMode={isDebugMode}
          onToggleDebugMode={onToggleDebugMode}
        />
      </div>
    </div>
  )
}

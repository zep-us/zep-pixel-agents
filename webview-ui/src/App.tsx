import { useState, useEffect } from 'react'

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void }

const vscode = acquireVsCodeApi()

function App() {
  const [agents, setAgents] = useState<number[]>([])

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data
      if (msg.type === 'agentCreated') {
        setAgents((prev) => [...prev, msg.id as number])
      } else if (msg.type === 'agentClosed') {
        setAgents((prev) => prev.filter((id) => id !== msg.id))
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: 8 }}>
      <button onClick={() => vscode.postMessage({ type: 'openClaude' })}>
        Open Claude Code
      </button>
      {agents.map((id) => (
        <button
          key={id}
          onClick={() => vscode.postMessage({ type: 'focusAgent', id })}
        >
          Agent #{id}
        </button>
      ))}
    </div>
  )
}

export default App

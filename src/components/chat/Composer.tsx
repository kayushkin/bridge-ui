import { useEffect, useRef, useState } from 'react'

export function Composer({ connected, streaming, paused, uiState, activity, onSend, onStop, onResume }: {
  connected: boolean
  streaming: boolean
  paused: boolean
  uiState: string
  activity: { kind: string; name?: string }
  onSend: (text: string) => void
  onStop: () => void
  onResume: () => void
}) {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = () => {
    const t = text.trim()
    if (!t || !connected || streaming) return
    onSend(t)
    setText('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
  }

  useEffect(() => { if (connected && !streaming) inputRef.current?.focus() }, [connected, streaming])

  const showStatus = uiState && uiState !== 'empty'
  const stateLabel = uiState ? uiState.charAt(0).toUpperCase() + uiState.slice(1) : ''
  const activityText = activity.kind !== 'idle' && uiState === 'running'
    ? (activity.kind === 'tool' ? activity.name ?? 'tool' : activity.kind === 'thinking' ? 'thinking' : 'streaming')
    : ''

  return (
    <div className="bc-composer-wrap">
      {showStatus && (
        <div className={`bc-composer-status bc-composer-status-${uiState}`}>
          <span className={`bc-status-dot bc-status-dot-${uiState}`} />
          <span className="bc-composer-status-label">{stateLabel}</span>
          {activityText && <span className="bc-composer-status-activity">· {activityText}</span>}
        </div>
      )}
      <div className="bc-composer">
        <textarea
          ref={inputRef}
          className="bc-composer-input"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={connected ? 'Send a message...' : 'Select a session'}
          disabled={!connected || streaming}
          rows={1}
        />
        {streaming ? (
          <button className="bc-composer-btn bc-btn-stop" onClick={onStop}>Stop</button>
        ) : paused ? (
          <button className="bc-composer-btn bc-btn-resume" onClick={onResume}>Resume</button>
        ) : (
          <button className="bc-composer-btn" onClick={handleSubmit} disabled={!text.trim() || !connected}>Send</button>
        )}
      </div>
    </div>
  )
}

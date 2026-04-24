import { useEffect, useRef, useState } from 'react'

export function Composer({ connected, streaming, paused, onSend, onStop, onResume }: {
  connected: boolean
  streaming: boolean
  paused: boolean
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

  return (
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
  )
}

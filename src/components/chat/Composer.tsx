import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { clearDraft, loadDraft, saveDraft } from './persistence'

const MAX_INPUT_PX = 220

export function Composer({ sessionId, connected, streaming, paused, onSend, onStop, onResume }: {
  sessionId: string | null | undefined
  connected: boolean
  streaming: boolean
  paused: boolean
  onSend: (text: string) => void
  onStop: () => void
  onResume: () => void
}) {
  const [text, setText] = useState(() => loadDraft(sessionId ?? ''))
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const saveTimer = useRef<number | null>(null)
  const lastSessionId = useRef<string>(sessionId ?? '')

  useEffect(() => {
    const next = sessionId ?? ''
    if (next === lastSessionId.current) return
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
      saveDraft(lastSessionId.current, text)
    }
    lastSessionId.current = next
    setText(loadDraft(next))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  useEffect(() => {
    const sid = sessionId ?? ''
    if (!sid) return
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null
      saveDraft(sid, text)
    }, 250)
    return () => {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current)
        saveTimer.current = null
        saveDraft(sid, text)
      }
    }
  }, [text, sessionId])

  const handleSubmit = () => {
    const t = text.trim()
    if (!t || !connected) return
    onSend(t)
    setText('')
    if (sessionId) clearDraft(sessionId)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
  }

  useEffect(() => { if (connected) inputRef.current?.focus() }, [connected])

  // Auto-grow: reset to 0 to shrink on delete, then size to scrollHeight up to cap.
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_PX)}px`
  }, [text])

  return (
    <div className="bc-composer-wrap">
      <div className="bc-composer">
        <textarea
          ref={inputRef}
          className="bc-composer-input"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={connected ? 'Send a message...' : 'Select a session'}
          disabled={!connected}
          rows={1}
        />
        <div className="bc-composer-actions">
          {paused ? (
            <button className="bc-composer-btn bc-btn-resume" onClick={onResume}>Resume</button>
          ) : (
            <button
              className="bc-composer-btn"
              onClick={handleSubmit}
              disabled={!text.trim() || !connected}
              title={streaming ? 'Send (interrupts current response)' : 'Send'}
            >Send</button>
          )}
          {streaming && (
            <button className="bc-composer-btn bc-btn-stop" onClick={onStop} title="Stop">Stop</button>
          )}
        </div>
      </div>
    </div>
  )
}

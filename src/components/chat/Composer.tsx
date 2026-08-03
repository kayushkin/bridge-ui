import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { clearDraft, loadDraft, saveDraft } from './persistence'

/** The height the auto-growing composer must be given so its content fits.
 *
 *  `scrollHeight` is content plus padding and **excludes the border**. Both hosts
 *  that mount this component reset `* { box-sizing: border-box }` (dash
 *  `src/index.css:55`, llmux `src/index.css:13`), which makes an assigned height
 *  the height of the *box* — border included. Assigning a bare `scrollHeight`
 *  therefore lands a border-width short of the content it was measured from, so
 *  the content never fits and `overflow-y: auto` gives the textarea a scrollbar at
 *  **every** size rather than only past the cap. On this origin that was 2px, and
 *  it was small enough to read as a rendering artefact for as long as it shipped.
 *
 *  The border is added back only under `border-box`. Under `content-box` the
 *  assigned height already excludes the border, so adding it would overshoot by
 *  the same amount in the other direction. Reading the used value rather than
 *  assuming either one keeps this correct for a host that resets neither.
 *
 *  No cap is applied here. `.bc-composer-input` carries `max-height: 220px` in
 *  this package's own `styles.css` (both the base rule and the themed one), so the
 *  browser clamps whatever inline height we set and `overflow-y: auto` takes over
 *  past it. This function used to compare against a duplicate `MAX_INPUT_PX = 220`
 *  in this file, which had to be kept in step with the stylesheet by hand — and
 *  which was wrong by the border anyway, since it was compared against a
 *  `scrollHeight` that means something slightly different from the height it set.
 *  Letting the stylesheet own the number leaves it in one place. */
export function composerAutoGrowHeightPx(measurements: {
  scrollHeight: number
  boxSizing: string
  borderTopWidth: string
  borderBottomWidth: string
}): number {
  const { scrollHeight, boxSizing, borderTopWidth, borderBottomWidth } = measurements
  if (boxSizing !== 'border-box') return scrollHeight
  const top = parseFloat(borderTopWidth) || 0
  const bottom = parseFloat(borderBottomWidth) || 0
  return scrollHeight + top + bottom
}

/** The composer and the turn controls for the active session.
 *
 *  `turnRunning` is the server-reported "the harness holds the turn" state
 *  (`harnessIsWorkingOnTurn`), never a bare `uiState === 'running'`: derivation
 *  projects the deprecated `running` to `tool_running` before any consumer sees
 *  it, so that comparison is false for every session on the box and the Stop
 *  button behind it never rendered at all.
 *
 *  `resumable` says the server will actually accept POST /resume — see
 *  `sessionCanBeResumed`. It is NOT `paused`: bridge-ui's paused marker means
 *  "the user interrupted this session", whose process is still alive, which is
 *  precisely the 409 case. The marker stays (the status chip and the sidebar dot
 *  are the only record that a user stopped a session); what goes is the button
 *  behind it.
 *
 *  Stop and Resume sit BESIDE Send rather than replacing it. They are not
 *  alternatives to sending: a running turn is exactly when a user most often
 *  wants to redirect the model, and an interrupted session is continued by
 *  saying something to it. Replacing Send with Resume left a paused session with
 *  one visible action, and it was the one that could not work. */
export function Composer({ sessionId, connected, turnRunning, resumable, onSend, onStop, onResume }: {
  sessionId: string | null | undefined
  connected: boolean
  turnRunning: boolean
  resumable: boolean
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

  // Focus the composer once per session — when a session is first selected and
  // its connection comes up. Keying this on `connected` alone (as it used to be)
  // re-fired on every SSE reconnect, stealing focus back into the textarea. For
  // Vimium users that silently drops the page into insert mode (and can yank you
  // out of an open hint selection) every time the stream blips. Tracking the last
  // session we focused for means a bare reconnect — same session, `connected`
  // flips false→true again — no longer refocuses.
  const focusedForSession = useRef<string | null>(null)
  useEffect(() => {
    const sid = sessionId ?? ''
    if (connected && sid && focusedForSession.current !== sid) {
      inputRef.current?.focus()
      focusedForSession.current = sid
    }
  }, [connected, sessionId])

  // Auto-grow. The reset to `0px` first is load-bearing: `scrollHeight` never
  // reports smaller than the box it measures, so without it the textarea only ever
  // grows and never comes back down when the draft is deleted. The height itself
  // comes from `composerAutoGrowHeightPx`, which explains the border correction and
  // why the cap is the stylesheet's to apply, not this file's.
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    const computed = window.getComputedStyle(el)
    el.style.height = '0px'
    el.style.height = `${composerAutoGrowHeightPx({
      scrollHeight: el.scrollHeight,
      boxSizing: computed.boxSizing,
      borderTopWidth: computed.borderTopWidth,
      borderBottomWidth: computed.borderBottomWidth,
    })}px`
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
          <button
            className="bc-composer-btn"
            onClick={handleSubmit}
            disabled={!text.trim() || !connected}
            title={turnRunning ? 'Send (interrupts current response)' : 'Send'}
          >Send</button>
          {turnRunning && (
            <button className="bc-composer-btn bc-btn-stop" onClick={onStop} title="Stop">Stop</button>
          )}
          {resumable && (
            <button
              className="bc-composer-btn bc-btn-resume"
              onClick={onResume}
              title="Restart this session's harness process"
            >Resume</button>
          )}
        </div>
      </div>
    </div>
  )
}

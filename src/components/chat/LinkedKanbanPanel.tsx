import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useBridgeConfig } from '../../context'
import { useKanban } from '../../useKanban'
import type { EntityCardView, EntityTag } from '../../types-kanban'

const DO_NOT_TRACK_TAGS = ['kanban-do-not-track', 'kanban:do-not-track'] as const

interface LinkedKanbanPanelProps {
  sessionId: string
  onToggleCollapse: () => void
  style?: React.CSSProperties
  paneKey?: string
}

export function LinkedKanbanPanel({ sessionId, onToggleCollapse, style, paneKey }: LinkedKanbanPanelProps) {
  const { routes, kanbanStoreBasePath } = useBridgeConfig()
  const kanban = useKanban(null, { loadBoards: false, loadEntityTypes: false })
  const [cards, setCards] = useState<EntityCardView[]>([])
  const [tags, setTags] = useState<EntityTag[]>([])
  const [loading, setLoading] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!kanbanStoreBasePath || !sessionId) {
      setCards([])
      setTags([])
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [nextCards, nextTags] = await Promise.all([
        kanban.listCardsForEntity('session', sessionId),
        kanban.listEntityTags('session', sessionId),
      ])
      setCards(nextCards)
      setTags(nextTags)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [kanban, kanbanStoreBasePath, sessionId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const doNotTrackTags = useMemo(
    () => tags.filter(tag => DO_NOT_TRACK_TAGS.includes(tag.tag as typeof DO_NOT_TRACK_TAGS[number])),
    [tags]
  )
  const trackingDisabled = doNotTrackTags.length > 0

  const handleToggleTracking = useCallback(async () => {
    if (!sessionId) return
    setToggling(true)
    setError(null)
    try {
      if (trackingDisabled) {
        await Promise.all(doNotTrackTags.map(tag => kanban.deleteEntityTag('session', sessionId, tag.tag)))
      } else {
        const ok = await kanban.addEntityTag('session', sessionId, DO_NOT_TRACK_TAGS[0])
        if (!ok) throw new Error('failed to add do-not-track tag')
      }
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setToggling(false)
    }
  }, [doNotTrackTags, kanban, refresh, sessionId, trackingDisabled])

  const stop = (e: React.MouseEvent | React.KeyboardEvent) => e.stopPropagation()

  const summary = loading
    ? 'Loading linked cards…'
    : cards.length > 0
      ? `${cards.length} linked ${cards.length === 1 ? 'card' : 'cards'}`
      : 'No linked cards yet'

  const interactive = !!kanbanStoreBasePath && !!sessionId

  return (
    <div className="bc-split-pane bc-split-pane-kanban" style={style} data-pane={paneKey}>
      <div
        className="bc-split-pane-header bc-header-clickable"
        onClick={onToggleCollapse}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleCollapse() } }}
        role="button"
        tabIndex={0}
        title="Hide kanban"
        aria-label="Hide kanban"
      >
        <span className="bc-split-pane-title">Linked Work</span>
        <span className="bc-spacer" />
        {interactive && (
          <>
            <button
              type="button"
              className={`bc-linked-kanban-btn ${trackingDisabled ? 'bc-linked-kanban-btn-active' : ''}`}
              onClick={e => { stop(e); handleToggleTracking() }}
              onKeyDown={stop}
              disabled={toggling}
              title={trackingDisabled ? 'Allow classifier tracking again for this session' : 'Mark this session as do-not-track for kanban classifier'}
            >
              {trackingDisabled ? 'Resume tracking' : 'Do not track'}
            </button>
            <Link
              className="bc-linked-kanban-link"
              to={routes.kanban}
              onClick={stop}
            >Open Kanban</Link>
          </>
        )}
        <span className="bc-split-collapse-btn" aria-hidden="true">×</span>
      </div>
      <div className="bc-linked-kanban-body">
        {!interactive ? (
          <div className="bc-linked-kanban-summary">No active session.</div>
        ) : (
          <>
            <div className="bc-linked-kanban-summary">{summary}</div>
            {error && <div className="bridge-error">{error}</div>}
            {trackingDisabled && (
              <div className="bc-linked-kanban-note">
                Classifier auto-tracking is disabled for this session.
              </div>
            )}
            {cards.length > 0 && (
              <div className="bc-linked-kanban-list">
                {cards.map(card => {
                  const item = card.item
                  const cardSummary = summarizeBody(item?.body)
                  return (
                    <article key={card.card_id} className="bc-linked-kanban-card">
                      <div className="bc-linked-kanban-card-head">
                        <div className="bc-linked-kanban-card-title">{item?.title || '(deleted card item)'}</div>
                        {item?.status && <span className="bc-linked-kanban-chip">{item.status}</span>}
                      </div>
                      {cardSummary && <div className="bc-linked-kanban-card-summary">{cardSummary}</div>}
                      <div className="bc-linked-kanban-card-meta">
                        <span className="bc-linked-kanban-card-id">{card.card_id.slice(0, 8)}</span>
                        {item?.priority ? <span className="bc-linked-kanban-chip">P{item.priority}</span> : null}
                        {item?.tags?.slice(0, 3).map(tag => <span key={tag} className="bc-linked-kanban-chip">#{tag}</span>)}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function summarizeBody(body?: string | null): string {
  if (!body) return ''
  const cleaned = body
    .replace(/[*_`>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return ''
  return cleaned.length > 180 ? `${cleaned.slice(0, 177)}...` : cleaned
}

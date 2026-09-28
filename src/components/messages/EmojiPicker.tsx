import { useEffect, useMemo, useRef, useState } from 'react'
import { searchEmoji, type EmojiGroup } from '../../emojiPicker'
import styles from './Messages.module.css'

/** The table is ~60 KB of source (17 KB gzipped), so it is its own chunk,
 *  fetched the first time any picker opens and kept after. */
let emojiGroupsLoad: Promise<readonly EmojiGroup[]> | null = null
function loadEmojiGroups(): Promise<readonly EmojiGroup[]> {
  emojiGroupsLoad ??= import('../../emojiData').then(module => module.EMOJI_GROUPS)
  return emojiGroupsLoad
}

/**
 * A button that opens a searchable grid of unicode emoji. Picking one calls
 * `onPick` and nothing else: the composer puts it in its text box, and
 * nothing is sent until the person sends.
 */
export function EmojiPickerButton({ onPick, disabled }: { onPick: (emoji: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [open])

  return (
    <div className={styles.emojiPickerWrap} ref={wrapper}>
      <button type="button" className={styles.emojiButton} disabled={disabled} aria-expanded={open}
        title="Insert an emoji" aria-label="Insert an emoji" onClick={() => setOpen(o => !o)}>
        {'\u{1F642}'}
      </button>
      {open && <EmojiPickerPanel onPick={onPick} onClose={() => setOpen(false)} />}
    </div>
  )
}

function EmojiPickerPanel({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const [groups, setGroups] = useState<readonly EmojiGroup[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    loadEmojiGroups()
      .then(loaded => { if (!cancelled) setGroups(loaded) })
      .catch(err => { if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err)) })
    return () => { cancelled = true }
  }, [])

  const shown = useMemo(() => (groups ? searchEmoji(groups, query) : []), [groups, query])

  return (
    <div className={styles.emojiPanel} role="dialog" aria-label="Emoji"
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}>
      <input className={styles.input} type="search" value={query} placeholder="Search emoji" autoFocus
        onChange={event => setQuery(event.target.value)} />
      <div className={styles.emojiGroups}>
        {loadError && <pre className={styles.error}>The emoji list did not load: {loadError}</pre>}
        {!groups && !loadError && <div className={styles.empty}>Loading…</div>}
        {groups && shown.length === 0 && <div className={styles.empty}>No emoji matches.</div>}
        {shown.map(group => (
          <section key={group.name}>
            <div className={styles.emojiGroupName}>{group.name}</div>
            <div className={styles.emojiGrid}>
              {group.emojis.map(([emoji, name]) => (
                <button key={emoji} type="button" className={styles.emojiCell} title={name} aria-label={name}
                  onClick={() => onPick(emoji)}>
                  {emoji}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

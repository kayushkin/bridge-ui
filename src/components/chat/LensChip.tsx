import styles from './Chat.module.css'

interface LensChipProps {
  /** Whether the pane draws its raw audit view (duplicates, source, eventId). */
  raw: boolean
  setRaw: (raw: boolean) => void
  /** Whether prose renders as markdown or as the plain source. */
  markdown: boolean
  setMarkdown: (markdown: boolean) => void
}

/** How the Turns pane draws its text, as one small chip in the pane's top corner: the
 *  left half flips markdown and plain text, the right half turns the raw audit view on
 *  and off. It lives in the pane rather than in the header because both choices are
 *  about this one pane, and in the header they sat among the pane tabs looking like
 *  panes. Being in the pane also puts it on a phone, where the header is not drawn.
 *
 *  The two halves stay separate buttons because they are different kinds of choice:
 *  markdown is a saved preference (`threadPersistence.ts`), raw is a look you take and
 *  is forgotten on reload (see the note on `raw` in BridgeChat).
 *
 *  ⚠️ The names are what the e2e specs and screen readers find: the markdown half keeps
 *  class `bc-turns-md-toggle` and the labels "Rendering markdown" / "Rendering plain
 *  text"; the raw half is named "Raw". */
export default function LensChip({ raw, setRaw, markdown, setMarkdown }: LensChipProps) {
  return (
    <span className={styles.lensChip} role="group" aria-label="How the text is drawn">
      <button
        type="button"
        className={`bc-turns-md-toggle ${styles.lensHalf}`}
        onClick={() => setMarkdown(!markdown)}
        aria-pressed={markdown}
        aria-label={markdown ? 'Rendering markdown' : 'Rendering plain text'}
        title={markdown ? 'Rendering markdown — click for plain text' : 'Plain text — click for markdown'}
      >
        {markdown ? 'MD' : 'TXT'}
      </button>
      <button
        type="button"
        className={styles.lensHalf}
        onClick={() => setRaw(!raw)}
        aria-pressed={raw}
        aria-label="Raw"
        title={
          raw
            ? 'Raw view — every entry incl. duplicates, with source + eventId. Click for the collapsed view'
            : 'Collapsed view — duplicates hidden. Click for raw: every entry, with source + eventId'
        }
      >
        RAW
      </button>
    </span>
  )
}

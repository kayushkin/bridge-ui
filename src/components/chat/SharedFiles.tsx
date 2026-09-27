import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useChatContext, type SessionFile, type ToolResultImage } from '@kayushkin/chat-core'
import { formatBytes } from '../../toolPayloadPreview'
import { mayDrawAsImage } from '../../sessionFileAttachments'

/**
 * Images and files in the chat: an image viewer, a card for a file shared into the
 * session, and the strip of images a tool result carried.
 *
 * Every byte comes from the bridge through the host's proxy — a shared file from
 * file-store (`ApiClient.sessionFileContentUrl`), a settled tool image from log-store
 * (`ApiClient.toolResultImageUrl`) — or, for a tool image folded live, from the event
 * itself. Both servers send `nosniff` and a sandbox CSP; this layer adds nothing and
 * decides nothing about which types are safe, it only tries to draw what claims to be
 * an image and falls back to a link when the browser cannot.
 */

/** A full-window view of one image. Escape or a click outside the image closes it. */
export function ImageViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // A data: URL cannot be opened as a page — browsers refuse top-level data:
  // navigation — so the link is offered only for bytes that have an address.
  const openable = !src.startsWith('data:')
  return createPortal(
    <div className="bc-image-viewer" role="dialog" aria-modal="true" aria-label={alt} onClick={onClose}>
      <div className="bc-image-viewer-bar" onClick={(event) => event.stopPropagation()}>
        <span className="bc-image-viewer-name">{alt}</span>
        {openable && (
          <a className="bc-image-viewer-action" href={src} target="_blank" rel="noreferrer">
            Open original
          </a>
        )}
        <button type="button" className="bc-image-viewer-action" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <img className="bc-image-viewer-image" src={src} alt={alt} onClick={(event) => event.stopPropagation()} />
    </div>,
    document.body,
  )
}

/** A thumbnail that opens the viewer. `onUndrawable` fires when the browser cannot
 *  draw the bytes, so the caller can show a link instead of a broken image. */
function ImageThumbnail({ src, alt, onUndrawable }: { src: string; alt: string; onUndrawable?: () => void }) {
  const [viewing, setViewing] = useState(false)
  return (
    <>
      <button type="button" className="bc-image-thumb" onClick={() => setViewing(true)} title={`View ${alt}`}>
        <img src={src} alt={alt} loading="lazy" onError={onUndrawable} />
      </button>
      {viewing && <ImageViewer src={src} alt={alt} onClose={() => setViewing(false)} />}
    </>
  )
}

/** One file shared into the session: drawn when it is an image the server serves
 *  inline, otherwise its name and size as a download link. */
export function SharedFileCard({ file }: { file: SessionFile }) {
  const { api } = useChatContext()
  const [undrawable, setUndrawable] = useState(false)
  const inlineSrc = api.sessionFileContentUrl(file.session_id, file.file_id, { inline: true })
  const downloadHref = api.sessionFileContentUrl(file.session_id, file.file_id)
  const drawn = mayDrawAsImage(file.media_type) && !undrawable
  return (
    <div className="bc-shared-file" data-file-id={file.file_id}>
      {drawn ? (
        <ImageThumbnail src={inlineSrc} alt={file.filename} onUndrawable={() => setUndrawable(true)} />
      ) : null}
      <a className="bc-shared-file-link" href={downloadHref} download={file.filename} title={file.path}>
        <span aria-hidden>{drawn ? '🖼' : '📄'}</span>
        <span className="bc-shared-file-name">{file.filename}</span>
        <span className="bc-shared-file-size">{formatBytes(file.size_bytes)}</span>
      </a>
    </div>
  )
}

/** The images a tool result carried — a screenshot, an image file the agent read. */
export function ToolResultImageStrip({
  sessionId,
  images,
  toolName,
}: {
  sessionId: string | null
  images: readonly ToolResultImage[]
  toolName: string
}) {
  const { api } = useChatContext()
  const sources = images.flatMap((image) => {
    if (image.base64Data !== undefined) {
      return [{ key: `live-${image.index}`, src: `data:${image.mediaType};base64,${image.base64Data}` }]
    }
    if (image.eventId !== undefined && sessionId) {
      return [{ key: `${image.eventId}-${image.index}`, src: api.toolResultImageUrl(sessionId, image.eventId, image.index) }]
    }
    return []
  })
  if (sources.length === 0) return null
  return (
    <div className="bc-tool-images">
      {sources.map((source, position) => (
        <ImageThumbnail key={source.key} src={source.src} alt={`${toolName} image ${position + 1}`} />
      ))}
    </div>
  )
}

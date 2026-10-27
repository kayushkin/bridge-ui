import { useState, type ComponentProps, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useChatContext, type ApiClient, type SessionFile, type ToolResultImage } from '@kayushkin/chat-core'
import { formatBytes } from '../../toolPayloadPreview'
import { mayDrawAsImage, mayPlayAsVideo, textPreviewKind, type TextPreviewKind } from '../../sessionFileAttachments'
import { sharedFileGalleryKey, toolImageGalleryKey, useOpenImage, type GalleryImage } from './ImageGallery'

/**
 * Images, videos and files in the chat: a card for a file shared into the session, a
 * compact grid for several images shared together, and the strip of images a tool
 * result carried. Each image opens the viewer in `ImageGallery.tsx`.
 *
 * Every byte comes from the bridge through the host's proxy — a shared file from
 * file-store (`ApiClient.sessionFileContentUrl`), a settled tool image from log-store
 * (`ApiClient.toolResultImageUrl`) — or, for a tool image folded live, from the event
 * itself. Both servers send `nosniff` and a sandbox CSP; this layer adds nothing and
 * decides nothing about which types are safe, it only tries to draw what claims to be
 * an image, or play what claims to be a video, and falls back to a link when the
 * browser cannot.
 */

/** A thumbnail that opens the viewer at its image, inside the session's gallery when
 *  the image is in it. `onUndrawable` fires when the browser cannot draw the bytes, so
 *  the caller can show a link instead of a broken image. */
function ImageThumbnail({
  image,
  className = 'bc-image-thumb',
  onUndrawable,
  children,
}: {
  image: GalleryImage
  className?: string
  onUndrawable?: () => void
  children?: ReactNode
}) {
  const { open, viewer } = useOpenImage(image)
  return (
    <>
      <button type="button" className={className} onClick={open} title={`View ${image.name}`}>
        <img src={image.src} alt={image.name} loading="lazy" onError={onUndrawable} />
        {children}
      </button>
      {viewer}
    </>
  )
}

/** A shared file as the viewer shows it. */
export function galleryImageOfSharedFile(api: { sessionFileContentUrl: ApiClient['sessionFileContentUrl'] }, file: SessionFile): GalleryImage {
  return {
    key: sharedFileGalleryKey(file.file_id),
    fileId: file.file_id,
    src: api.sessionFileContentUrl(file.session_id, file.file_id, { inline: true }),
    name: file.filename,
    downloadHref: api.sessionFileContentUrl(file.session_id, file.file_id),
    sizeBytes: file.size_bytes,
    sharedAt: file.created_at,
  }
}

/** An image a tool result carried, as the viewer shows it; null when its bytes are
 *  neither in the event nor addressable yet. */
export function galleryImageOfToolResult(
  api: { toolResultImageUrl: ApiClient['toolResultImageUrl'] },
  sessionId: string | null,
  entryId: string,
  image: ToolResultImage,
  name: string,
): GalleryImage | null {
  const key = toolImageGalleryKey(entryId, image.index)
  if (image.base64Data !== undefined) return { key, src: `data:${image.mediaType};base64,${image.base64Data}`, name }
  if (image.eventId !== undefined && sessionId) {
    const src = api.toolResultImageUrl(sessionId, image.eventId, image.index)
    return { key, src, name, downloadHref: src }
  }
  return null
}

/** Links in a previewed file leave the app in a new tab, so following one does not
 *  lose the chat. */
const PREVIEW_MARKDOWN_COMPONENTS: ComponentProps<typeof ReactMarkdown>['components'] = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
}

type PreviewState =
  | { status: 'closed' }
  | { status: 'loading' }
  | { status: 'loaded'; text: string }
  | { status: 'failed'; message: string }

/** A text file's contents, folded under the card until opened. The bytes are fetched
 *  the first time it opens — a transcript with many files should not download them all
 *  — through the host's credentialed fetch, and kept for the life of the card. A
 *  failed fetch says what the server answered; closing and opening again retries it. */
function TextFilePreview({ file, kind }: { file: SessionFile; kind: TextPreviewKind }) {
  const { api } = useChatContext()
  const [state, setState] = useState<PreviewState>({ status: 'closed' })

  const load = async () => {
    setState({ status: 'loading' })
    try {
      const response = await api.fetchFor()(api.sessionFileContentUrl(file.session_id, file.file_id))
      if (!response.ok) {
        const detail = await response.text()
        setState({ status: 'failed', message: `${response.status} ${response.statusText} ${detail}`.trim() })
        return
      }
      setState({ status: 'loaded', text: await response.text() })
    } catch (error) {
      setState({ status: 'failed', message: error instanceof Error ? error.message : String(error) })
    }
  }

  return (
    <details
      className="bc-shared-file-preview"
      onToggle={(event) => {
        if (!event.currentTarget.open) return
        if (state.status === 'closed' || state.status === 'failed') void load()
      }}
    >
      <summary>Preview</summary>
      {state.status === 'loading' && <div className="bc-shared-file-preview-note">Loading…</div>}
      {state.status === 'failed' && (
        <div className="bc-shared-file-preview-note bc-shared-file-preview-error">Could not load: {state.message}</div>
      )}
      {state.status === 'loaded' &&
        (kind === 'markdown' ? (
          <div className="bc-shared-file-preview-body bc-turns-md">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={PREVIEW_MARKDOWN_COMPONENTS}>
              {state.text}
            </ReactMarkdown>
          </div>
        ) : (
          <pre className="bc-shared-file-preview-body">{state.text}</pre>
        ))}
    </details>
  )
}

/** One file shared into the session: drawn when it is an image the server serves
 *  inline, played when it is such a video, and always its name and size as a download
 *  link, with a preview to unfold when it is text. */
export function SharedFileCard({ file }: { file: SessionFile }) {
  const { api } = useChatContext()
  const [undrawable, setUndrawable] = useState(false)
  const image = galleryImageOfSharedFile(api, file)
  const inlineSrc = image.src
  const downloadHref = image.downloadHref
  const drawn = mayDrawAsImage(file.media_type) && !undrawable
  const played = mayPlayAsVideo(file.media_type) && !undrawable
  const previewKind = textPreviewKind(file)
  return (
    <div className="bc-shared-file" data-file-id={file.file_id}>
      {drawn ? (
        <ImageThumbnail image={image} onUndrawable={() => setUndrawable(true)} />
      ) : null}
      {played ? (
        <video
          className="bc-shared-file-video"
          src={inlineSrc}
          controls
          preload="metadata"
          aria-label={file.filename}
          onError={() => setUndrawable(true)}
        />
      ) : null}
      <a className="bc-shared-file-link" href={downloadHref} download={file.filename} title={file.path}>
        <span aria-hidden>{drawn ? '🖼' : played ? '🎬' : '📄'}</span>
        <span className="bc-shared-file-name">{file.filename}</span>
        <span className="bc-shared-file-size">{formatBytes(file.size_bytes)}</span>
      </a>
      {previewKind && <TextFilePreview file={file} kind={previewKind} />}
    </div>
  )
}

/**
 * Several images shared one after another, as one grid of tiles with each name under
 * its tile, rather than a full-size card each down the page. A tile opens the viewer;
 * the name downloads the original.
 */
export function SharedImageGrid({ files }: { files: readonly SessionFile[] }) {
  const { api } = useChatContext()
  return (
    <div className="bc-image-grid" role="group" aria-label={`${files.length} images`}>
      {files.map((file) => {
        const image = galleryImageOfSharedFile(api, file)
        return (
          <figure key={file.file_id} className="bc-image-grid-item" data-file-id={file.file_id}>
            <ImageThumbnail image={image} className="bc-image-grid-tile" />
            <figcaption className="bc-image-grid-caption">
              <a href={image.downloadHref} download={file.filename} title={`Download ${file.filename} (${formatBytes(file.size_bytes)})`}>
                {file.filename}
              </a>
            </figcaption>
          </figure>
        )
      })}
    </div>
  )
}

/** The images a tool result carried — a screenshot, an image file the agent read. */
export function ToolResultImageStrip({
  sessionId,
  entryId,
  images,
  toolName,
}: {
  sessionId: string | null
  entryId: string
  images: readonly ToolResultImage[]
  toolName: string
}) {
  const { api } = useChatContext()
  const shown = images.flatMap((image, position) => {
    const galleryImage = galleryImageOfToolResult(api, sessionId, entryId, image, `${toolName} image ${position + 1}`)
    return galleryImage ? [galleryImage] : []
  })
  if (shown.length === 0) return null
  return (
    <div className="bc-tool-images">
      {shown.map((image) => (
        <ImageThumbnail key={image.key} image={image} />
      ))}
    </div>
  )
}

import { createContext, useContext, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import {
  fileMentionOf,
  filesMatchingMention,
  useFileNamedByToolsContent,
  useFilesNamedByTools,
  type FileNamedByTools,
} from '@kayushkin/chat-core';
import { AnchoredPanel, timeAgo, useAnchoredPanel } from './RefChip';

/**
 * Where a file chip is: the session whose tools named the files, and when the
 * message holding the chip was written. Prose that is not part of a session's
 * transcript provides none, and its file mentions stay plain code.
 */
export interface FileMentionPlace {
  sessionId: string;
  /** RFC 3339; the file shows as changed when it was modified after this. */
  writtenAt: string | null;
}

export const FileMentionPlaceContext = createContext<FileMentionPlace | null>(null);

/**
 * A file an agent mentioned in a code span (`sessions.go:707`), as a chip that
 * opens the file as it is on disk now.
 *
 * The chip matches the mention against the files the session's own tools named
 * (llm-bridge-server's files-named-by-tools); while that list loads, when it
 * fails, or when nothing on it matches, the mention renders as the plain code
 * span it was written as. When several files match — the same relative path in a
 * main clone and its worktree, usually — the panel lists them and opens none
 * until one is picked.
 */
export function FileRefChip({ mentionText, className }: { mentionText: string; className?: string }): JSX.Element {
  const place = useContext(FileMentionPlaceContext);
  const mention = fileMentionOf(mentionText);
  const files = useFilesNamedByTools(place?.sessionId ?? '');
  const matches = useMemo(
    () => (files.data && mention ? filesMatchingMention(files.data, mention.path) : []),
    [files.data, mention?.path],
  );
  if (!place || !mention || matches.length === 0) {
    return (
      <code title={files.error ? `could not list this session's files: ${files.error}` : undefined}>{mentionText}</code>
    );
  }
  return (
    <FileRefChipWithMatches
      mentionText={mentionText}
      line={mention.line}
      matches={matches}
      place={place}
      className={className}
    />
  );
}

function FileRefChipWithMatches({
  mentionText,
  line,
  matches,
  place,
  className,
}: {
  mentionText: string;
  line: number | null;
  matches: FileNamedByTools[];
  place: FileMentionPlace;
  className?: string;
}): JSX.Element {
  const { open, toggle, wrapRef, panelRef, panelStyle } = useAnchoredPanel();
  const [chosenPath, setChosenPath] = useState<string | null>(null);
  const path = matches.length === 1 ? matches[0]!.path : chosenPath;
  const label = path ? `File ${path}` : `Files matching ${mentionText}`;

  return (
    <span ref={wrapRef} className="ref-chip-wrap" data-ref-kind="file" data-ref-id={mentionText}>
      <button
        type="button"
        className={`${className ?? 'ref-chip'} ref-chip-file${open ? ' ref-chip-open' : ''}`}
        onClick={toggle}
        aria-expanded={open}
        title={matches.length === 1 ? matches[0]!.path : `${matches.length} files match — click to choose`}
      >
        <span className="ref-chip-file-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
        {mentionText}
      </button>
      {open && (
        <AnchoredPanel panelRef={panelRef} panelStyle={panelStyle} label={label} refId={mentionText} refKind="file">
          <div className="ref-chip-panel-file">
            {matches.length > 1 && (
              <div className="ref-chip-file-choices">
                <div className="ref-chip-panel-label">{matches.length} files the session named match</div>
                {matches.map((match) => (
                  <button
                    key={match.path}
                    type="button"
                    className={`ref-chip-file-choice${match.path === path ? ' ref-chip-file-choice-chosen' : ''}`}
                    onClick={() => setChosenPath(match.path)}
                  >
                    {match.path}
                  </button>
                ))}
              </div>
            )}
            {path && <FileContent sessionId={place.sessionId} path={path} line={line} writtenAt={place.writtenAt} />}
          </div>
        </AnchoredPanel>
      )}
    </span>
  );
}

function FileContent({
  sessionId,
  path,
  line,
  writtenAt,
}: {
  sessionId: string;
  path: string;
  line: number | null;
  writtenAt: string | null;
}): JSX.Element {
  const file = useFileNamedByToolsContent(sessionId, path, true);
  const contentRef = useRef<HTMLPreElement | null>(null);
  const targetLineRef = useRef<HTMLDivElement | null>(null);
  // Scroll the file's own box to the line. Not scrollIntoView: that also scrolls
  // every scrolling ancestor, and would move the chat behind the panel.
  useEffect(() => {
    const content = contentRef.current;
    const target = targetLineRef.current;
    if (!content || !target) return;
    content.scrollTop = target.offsetTop - content.clientHeight / 2;
  }, [file.data]);

  if (file.loading) return <div className="ref-chip-panel-loading">Loading {path}…</div>;
  if (file.error || !file.data) return <div className="ref-chip-panel-error">{file.error ?? 'no content'}</div>;

  const changedAfterMessage = writtenAt !== null && Date.parse(file.data.modified_at) > Date.parse(writtenAt);
  const lines = file.data.content.split('\n');
  return (
    <>
      <div className="ref-chip-panel-title ref-chip-file-path">{path}</div>
      <div className="ref-chip-file-meta">
        Current version on disk · changed {timeAgo(file.data.modified_at)}
        {line !== null && ` · line ${line}`}
      </div>
      {changedAfterMessage && (
        <div className="ref-chip-file-changed" role="note">
          This file changed after this message was written, so it may not be what the agent saw.
        </div>
      )}
      <pre ref={contentRef} className="ref-chip-file-content">
        {lines.map((text, index) => {
          const number = index + 1;
          const target = number === line;
          return (
            <div
              key={index}
              ref={target ? targetLineRef : undefined}
              className={`ref-chip-file-line${target ? ' ref-chip-file-line-target' : ''}`}
            >
              <span className="ref-chip-file-line-number">{number}</span>
              {text}
            </div>
          );
        })}
      </pre>
    </>
  );
}

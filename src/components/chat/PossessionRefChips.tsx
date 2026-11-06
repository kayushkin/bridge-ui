// Chips for possession-store's ids: a possession (and each kind record that
// extends one — garment_, computer_…, whose Get answers the whole
// possession), an outfit, a purchase, a photo review, a sighting, and a
// question for the owner, which can be answered from its panel. Every id a
// panel names is drawn as a chip of its own, so the reader can walk from a
// garment to its outfit to the other garments in it. The rules are in
// src/possessionRefs.ts.

import { useState, type JSX, type ReactNode } from 'react';
import type { ResolvedRefMatch } from '@kayushkin/chat-core';
import { useBridgeConfig } from '../../context';
import {
  moneyLabel,
  ownerQuestionAnswerBody,
  ownerQuestionAnswerUrl,
  possessionChipLabel,
  possessionKindFacts,
  possessionKindLabel,
  possessionLinkedIds,
  possessionMakeLabel,
  possessionStoreImageUrl,
  purchaseChipLabel,
  questionChipLabel,
  resolutionSummary,
} from '../../possessionRefs';
import type {
  OwnerQuestion,
  Outfit,
  PhotoReview,
  Possession,
  Purchase,
  Sighting,
} from '../../types-possession-store';
import { AnchoredPanel, MultiMatchRefChip, RefChip, RefRow, useAnchoredPanel } from './RefChip';

/** A resolved possession-store id, drawn by its registry type. Every type
 *  not named here is a possession or one of its kinds, whose Get answers the
 *  possession view; an answer of any other shape gets the generic chip. */
export function PossessionStoreRefChip({
  refId,
  match,
  className,
}: {
  refId: string;
  match: ResolvedRefMatch;
  className?: string;
}): JSX.Element {
  switch (match.type) {
    case 'outfit':
      return <OutfitRefChip refId={refId} outfit={match.data as Outfit} className={className} />;
    case 'possession_purchase':
      return <PurchaseRefChip refId={refId} purchase={match.data as Purchase} className={className} />;
    case 'photo_review':
      return <PhotoReviewRefChip refId={refId} review={match.data as PhotoReview} className={className} />;
    case 'sighting':
      return <SightingRefChip refId={refId} sighting={match.data as Sighting} className={className} />;
    case 'possession_question':
      return <QuestionRefChip refId={refId} initial={match.data as OwnerQuestion} className={className} />;
  }
  if (isPossessionView(match.data)) {
    return <PossessionRefChip refId={refId} possession={match.data} className={className} />;
  }
  return <MultiMatchRefChip refId={refId} matches={[match]} className={className} />;
}

function isPossessionView(data: unknown): data is Possession {
  if (data === null || typeof data !== 'object') return false;
  const record = data as Record<string, unknown>;
  return typeof record.name === 'string' && typeof record.kind === 'string' && Array.isArray(record.photos);
}

/** Ids drawn as chips, each resolved on its own. */
function IdChips({ ids }: { ids: string[] }): JSX.Element {
  return (
    <span className="ref-chip-possession-ids">
      {ids.map((id) => (
        <RefChip key={id} kind="uuid" refId={id} />
      ))}
    </span>
  );
}

function IdRow({ label, ids }: { label: string; ids: string[] }): JSX.Element | null {
  if (ids.length === 0) return null;
  return (
    <div className="ref-chip-panel-row">
      <span className="ref-chip-panel-label">{label}</span>
      <span className="ref-chip-panel-value">
        <IdChips ids={ids} />
      </span>
    </div>
  );
}

/** A cut-out picture that removes itself when the store has none (404). */
function CutOutImage({ src, alt, className }: { src: string; alt: string; className: string }): JSX.Element | null {
  const [missing, setMissing] = useState(false);
  if (!src || missing) return null;
  return <img className={className} src={src} alt={alt} loading="lazy" onError={() => setMissing(true)} />;
}

/** The chip button every possession-store chip shares: the cut-out picture
 *  when there is one, else a glyph; a label; and a badge. */
function PossessionChip({
  refId,
  refKind,
  label,
  glyph,
  image,
  badge,
  className,
  panelLabel,
  children,
}: {
  refId: string;
  refKind: string;
  label: string;
  glyph: string;
  image: string;
  badge?: string;
  className?: string;
  panelLabel: string;
  children: ReactNode;
}): JSX.Element {
  const { open, toggle, wrapRef, panelRef, panelStyle } = useAnchoredPanel();
  const [imageMissing, setImageMissing] = useState(false);
  return (
    <span className="ref-chip-wrap" ref={wrapRef} data-ref-kind={refKind} data-ref-id={refId}>
      <button
        type="button"
        className={`${className ?? 'ref-chip'} ref-chip-item${open ? ' ref-chip-open' : ''}`}
        onClick={toggle}
        aria-expanded={open}
        title={`${label} (${refId})`}
      >
        {image && !imageMissing ? (
          <img className="ref-chip-photo-thumb" src={image} alt="" loading="lazy" onError={() => setImageMissing(true)} />
        ) : (
          <span className="ref-chip-glyph" aria-hidden>
            {glyph}
          </span>
        )}
        <span className="ref-chip-label">{label}</span>
        {badge && <span className={`ref-chip-badge ref-chip-badge-${badge.replace(/\s+/g, '-')}`}>{badge}</span>}
        <span className="ref-chip-caret-inline" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <AnchoredPanel panelRef={panelRef} panelStyle={panelStyle} label={panelLabel} refId={refId} refKind={refKind}>
          {children}
        </AnchoredPanel>
      )}
    </span>
  );
}

function dayOf(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString();
}

/** A possession, or one of its kinds: its picture, kind and the kind's
 *  facts, make, where it is kept, price, status, photos and what it links to. */
function PossessionRefChip({
  refId,
  possession,
  className,
}: {
  refId: string;
  possession: Possession;
  className?: string;
}): JSX.Element {
  const { possessionStoreBasePath } = useBridgeConfig();
  const image = possession.cover_photo_id
    ? possessionStoreImageUrl(possessionStoreBasePath, 'possessions', possession.id)
    : '';
  const label = possessionChipLabel(possession);
  const make = possessionMakeLabel(possession);
  const price = moneyLabel(possession.price_cents, possession.price_currency);
  const deleted = possession.deleted_at !== 0;
  const notOwned = possession.status !== 'owned' ? possession.status : undefined;
  return (
    <PossessionChip
      refId={refId}
      refKind="possession"
      label={label}
      glyph="📦"
      image={image}
      badge={deleted ? 'deleted' : notOwned}
      className={className}
      panelLabel="Possession details"
    >
      <CutOutImage className="ref-chip-photo" src={image} alt={label} />
      <div className="ref-chip-panel-title">{label}</div>
      {possession.id !== refId && <IdRow label="Possession" ids={[possession.id]} />}
      <RefRow label="Id" value={refId} badge={deleted ? 'deleted' : undefined} />
      <RefRow label="Kind" value={possessionKindLabel(possession.kind) || 'no kind'} />
      {possessionKindFacts(possession).map((fact) =>
        fact.ids.length > 0 ? (
          <IdRow key={fact.label} label={fact.label} ids={fact.ids} />
        ) : (
          <RefRow key={fact.label} label={fact.label} value={fact.text} />
        ),
      )}
      {make && <RefRow label="Make" value={make} />}
      {possession.serial_number && <RefRow label="Serial" value={possession.serial_number} />}
      {possession.spot && <RefRow label="Kept" value={possession.spot} />}
      {possession.place_id && <IdRow label="Place" ids={[possession.place_id]} />}
      {price && <RefRow label="Price" value={price} />}
      <RefRow label="Status" value={possession.status} />
      {possession.condition && <RefRow label="Condition" value={possession.condition} />}
      {possession.acquired_at !== 0 && (
        <RefRow
          label="Acquired"
          value={possession.acquired_how ? `${dayOf(possession.acquired_at)}, ${possession.acquired_how}` : dayOf(possession.acquired_at)}
        />
      )}
      {possession.tags.length > 0 && <RefRow label="Tags" value={possession.tags.join(', ')} />}
      <IdRow label="Photos" ids={possession.photos.map((photo) => photo.photo_id)} />
      {possessionLinkedIds(possession).map((linked) => (
        <IdRow key={linked.label} label={linked.label} ids={linked.ids} />
      ))}
      {possession.description && <div className="ref-chip-panel-body">{possession.description}</div>}
    </PossessionChip>
  );
}

function OutfitRefChip({ refId, outfit, className }: { refId: string; outfit: Outfit; className?: string }): JSX.Element {
  const deleted = outfit.deleted_at !== 0;
  return (
    <PossessionChip
      refId={refId}
      refKind="outfit"
      label={outfit.name || 'outfit'}
      glyph="👔"
      image=""
      badge={deleted ? 'deleted' : outfit.status}
      className={className}
      panelLabel="Outfit details"
    >
      <div className="ref-chip-panel-title">{outfit.name || 'outfit'}</div>
      <RefRow label="Id" value={refId} badge={deleted ? 'deleted' : undefined} />
      <RefRow label="Status" value={outfit.status} />
      {outfit.occasion && <RefRow label="Occasion" value={outfit.occasion} />}
      {outfit.weather && <RefRow label="Weather" value={outfit.weather} />}
      <IdRow label="Garments" ids={outfit.garment_ids} />
      {outfit.worn_on.length > 0 && <RefRow label="Worn" value={outfit.worn_on.join(', ')} />}
      {outfit.reasoning && <div className="ref-chip-panel-body">{outfit.reasoning}</div>}
    </PossessionChip>
  );
}

function PurchaseRefChip({ refId, purchase, className }: { refId: string; purchase: Purchase; className?: string }): JSX.Element {
  const label = purchaseChipLabel(purchase);
  const total = moneyLabel(purchase.total_cents, purchase.currency);
  return (
    <PossessionChip refId={refId} refKind="possession_purchase" label={label} glyph="🧾" image="" className={className} panelLabel="Purchase details">
      <div className="ref-chip-panel-title">{label}</div>
      <RefRow label="Id" value={refId} />
      {purchase.marketplace && <RefRow label="Marketplace" value={purchase.marketplace} />}
      <RefRow label="Ordered" value={dayOf(purchase.ordered_at)} />
      {total && <RefRow label="Total" value={total} />}
      {purchase.lines.map((line) => (
        <div key={line.id} className="ref-chip-panel-row">
          <span className="ref-chip-panel-label">
            {line.quantity > 1 ? `${line.quantity} ×` : 'Line'}
          </span>
          <span className="ref-chip-panel-value">
            {line.title}
            {line.unit_price_cents != null && ` (${moneyLabel(line.unit_price_cents, purchase.currency)})`}
            {line.disposition && ` — ${line.disposition}`} <IdChips ids={line.possession_ids} />
          </span>
        </div>
      ))}
    </PossessionChip>
  );
}

function PhotoReviewRefChip({ refId, review, className }: { refId: string; review: PhotoReview; className?: string }): JSX.Element {
  const sightingIds = (review.sightings ?? []).map((sighting) => sighting.id);
  return (
    <PossessionChip
      refId={refId}
      refKind="photo_review"
      label="photo review"
      glyph="🔍"
      image=""
      badge={review.status}
      className={className}
      panelLabel="Photo review details"
    >
      <RefRow label="Id" value={refId} />
      <RefRow label="Status" value={review.status} />
      <IdRow label="Photo" ids={[review.photo_id]} />
      {review.queued_at !== 0 && <RefRow label="Queued" value={new Date(review.queued_at * 1000).toLocaleString()} />}
      {review.finished_at !== 0 && <RefRow label="Finished" value={new Date(review.finished_at * 1000).toLocaleString()} />}
      <RefRow label="Cost" value={`$${review.cost_usd.toFixed(4)}`} />
      <IdRow label="Sightings" ids={sightingIds} />
      {review.error && <div className="ref-chip-panel-error">{review.error}</div>}
    </PossessionChip>
  );
}

function SightingRefChip({ refId, sighting, className }: { refId: string; sighting: Sighting; className?: string }): JSX.Element {
  const { possessionStoreBasePath } = useBridgeConfig();
  const image = possessionStoreImageUrl(possessionStoreBasePath, 'sightings', refId);
  return (
    <PossessionChip
      refId={refId}
      refKind="sighting"
      label={sighting.label || 'sighting'}
      glyph="👁"
      image={image}
      badge={sighting.status}
      className={className}
      panelLabel="Sighting details"
    >
      <CutOutImage className="ref-chip-photo" src={image} alt={sighting.label} />
      <div className="ref-chip-panel-title">{sighting.label || 'sighting'}</div>
      <RefRow label="Id" value={refId} />
      <RefRow label="Status" value={sighting.status} />
      {sighting.agreement && <RefRow label="Readers" value={sighting.agreement} />}
      {sighting.possession_id && <IdRow label="Possession" ids={[sighting.possession_id]} />}
      {sighting.same_as_sighting_id && <IdRow label="Same as" ids={[sighting.same_as_sighting_id]} />}
      <IdRow label="Photo" ids={[sighting.photo_id]} />
      <IdRow label="Review" ids={[sighting.photo_review_id]} />
      <IdRow label="Questions" ids={sighting.question_ids} />
    </PossessionChip>
  );
}

/** A question for the owner about a sighting. The chip holds the question
 *  as last answered, so an answer given in the panel shows on the chip. */
function QuestionRefChip({ refId, initial, className }: { refId: string; initial: OwnerQuestion; className?: string }): JSX.Element {
  const { possessionStoreBasePath } = useBridgeConfig();
  const [question, setQuestion] = useState(initial);
  return (
    <PossessionChip
      refId={refId}
      refKind="possession_question"
      label={questionChipLabel(question)}
      glyph="❓"
      image={possessionStoreImageUrl(possessionStoreBasePath, 'owner-questions', refId)}
      badge={question.answered_at !== 0 ? 'answered' : 'open'}
      className={className}
      panelLabel="Question for the owner"
    >
      <OwnerQuestionPanel refId={refId} question={question} onAnswered={setQuestion} />
    </PossessionChip>
  );
}

/** A question's panel: the cut-out picture, the question, a button per
 *  choice and a box to answer in words; once answered, what the answer did.
 *  dash signs the answer with the person signed in. Exported for its render
 *  test (test/possessionRefs.test.ts). */
export function OwnerQuestionPanel({
  refId,
  question,
  onAnswered,
}: {
  refId: string;
  question: OwnerQuestion;
  onAnswered: (question: OwnerQuestion) => void;
}): JSX.Element {
  const { possessionStoreBasePath, fetch: fetchFn } = useBridgeConfig();
  const [words, setWords] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const image = possessionStoreImageUrl(possessionStoreBasePath, 'owner-questions', refId);
  const answered = question.answered_at !== 0;
  const canAnswer = !answered && possessionStoreBasePath !== '' && !sending;

  const answer = async (body: { choice: number } | { text: string }): Promise<void> => {
    setSending(true);
    setError('');
    try {
      const response = await fetchFn(ownerQuestionAnswerUrl(possessionStoreBasePath, refId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: ownerQuestionAnswerBody(body),
      });
      const text = await response.text();
      if (!response.ok) {
        setError(`possession-store answered ${response.status}: ${text}`);
        return;
      }
      onAnswered(JSON.parse(text) as OwnerQuestion);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSending(false);
    }
  };

  const resolution = question.resolution ? resolutionSummary(question.resolution) : null;
  return (
    <>
      <CutOutImage className="ref-chip-photo" src={image} alt={question.question} />
      <div className="ref-chip-panel-body ref-chip-question-text">{question.question}</div>
      {!answered && (
        <>
          <div className="ref-chip-question-choices">
            {question.choices.map((choice, index) => (
              <button
                key={index}
                type="button"
                className="ref-chip-panel-btn"
                disabled={!canAnswer}
                onClick={() => void answer({ choice: index })}
              >
                {choice.label}
              </button>
            ))}
          </div>
          <form
            className="ref-chip-question-words"
            onSubmit={(event) => {
              event.preventDefault();
              if (words.trim() !== '') void answer({ text: words.trim() });
            }}
          >
            <textarea
              value={words}
              onChange={(event) => setWords(event.target.value)}
              placeholder="Or answer in your own words"
              rows={2}
              disabled={!canAnswer}
            />
            <button type="submit" className="ref-chip-panel-btn" disabled={!canAnswer || words.trim() === ''}>
              {sending ? 'Sending…' : 'Answer'}
            </button>
          </form>
          {possessionStoreBasePath === '' && (
            <div className="ref-chip-panel-error">This page does not carry possession-store, so it cannot answer.</div>
          )}
        </>
      )}
      {error && <div className="ref-chip-panel-error">{error}</div>}
      {answered && (
        <>
          <RefRow
            label="Answer"
            value={
              question.answer_choice != null
                ? (question.choices[question.answer_choice]?.label ?? `choice ${question.answer_choice}`)
                : question.answer_text
            }
          />
          {resolution && (
            <div className="ref-chip-panel-row">
              <span className="ref-chip-panel-label">Result</span>
              <span className="ref-chip-panel-value">
                {resolution.text} {resolution.id && <IdChips ids={[resolution.id]} />}
              </span>
            </div>
          )}
          {question.resolution?.explanation && <div className="ref-chip-panel-body">{question.resolution.explanation}</div>}
          <RefRow label="Answered" value={`${new Date(question.answered_at * 1000).toLocaleString()} by ${question.answered_by}`} />
        </>
      )}
      <RefRow label="Id" value={refId} />
      <IdRow label="Sighting" ids={[question.sighting_id]} />
      <IdRow label="Photo" ids={[question.photo_id]} />
    </>
  );
}

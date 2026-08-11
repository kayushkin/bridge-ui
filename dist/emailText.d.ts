/**
 * Makes a raw email body readable in a preview pane.
 *
 * Bulk mail is mostly not words. Measured on a live Meetup message from this
 * host: `body_text` is 24,924 characters, opening with ~90 blank lines and then
 * a single ~400-character click-tracking URL. Rendered raw, the preview shows
 * whitespace and then a wall of tracking parameters — which is worse than
 * showing nothing, because it looks like the email had no content.
 *
 * This is deliberately NOT the same transform as the classifier's Go cleaner.
 * That one collapses everything to a single line, because a model reads a flat
 * string. A person reads paragraphs, so line structure is preserved here and
 * only runs of blank lines are collapsed.
 *
 * It is also not a sanitiser and must never be treated as one. The preview
 * renders plain text through React, which escapes it; HTML bodies go to the
 * mail page, which sandboxes them in an iframe.
 */
/** Reduces a URL to its host: a tracking path encodes the campaign, not meaning. */
export declare function shortenUrlForPreview(raw: string): string;
export declare function cleanEmailBodyForPreview(raw: string | undefined | null): string;
//# sourceMappingURL=emailText.d.ts.map
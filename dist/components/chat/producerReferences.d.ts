import type { JSX, ReactNode } from 'react';
export interface ProducerMarkdownProps {
    /** Producer prose — a conversation message, a run's reply. */
    text: string;
    /** Inline-expand a referenced session that has open questions. Off by
     *  default: it costs one `/signals` read per referenced session, and only a
     *  surface that means to be answered from wants that. */
    expandSessionsWithOpenQuestions?: boolean;
    className?: string;
}
/**
 * Producer prose as markdown, with every reference rendered as a chat-core chip.
 *
 * ⚠️ Must be mounted inside chat-core's `<ChatProvider>` — the chips resolve
 * their ids against llm-bridge and noteboard through its context, and its hooks
 * throw without it.
 */
export declare function ProducerMarkdown({ text, expandSessionsWithOpenQuestions, className, }: ProducerMarkdownProps): JSX.Element;
/**
 * Producer text kept VERBATIM, with its references as chat-core chips.
 *
 * For the injected-context dump, which is a payload rather than prose: its
 * indentation, blank lines and bullet glyphs are what the model will actually
 * be handed, so it is parsed with `parseRefChips` (the same matcher, no
 * markdown) and every character between the references survives to the DOM.
 * Renders inline, so the caller decides the block — a `<pre>`, usually.
 *
 * ⚠️ Same `<ChatProvider>` requirement as {@link ProducerMarkdown}.
 */
export declare function ProducerTextWithReferenceChips({ text }: {
    text: string;
}): JSX.Element;
/**
 * Producer text kept verbatim, with its references as routes-aware links.
 *
 * The presentation for a surface that cannot promise a `ChatProvider` above it
 * (see this file's header). A reference whose target page this host does not
 * mount renders as a plain span, never as a link to a route that would 404 or
 * silently reload the current page.
 */
export declare function ProducerTextWithReferenceLinks({ text }: {
    text: string;
}): ReactNode;
//# sourceMappingURL=producerReferences.d.ts.map
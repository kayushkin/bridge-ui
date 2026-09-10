import { type JSX, type ReactNode } from 'react';
import type { RefKind } from '@kayushkin/chat-core';
/** Props for the {@link RefChip} renderer. When used as a ReactMarkdown custom
 *  component the mdast hProperties (`kind` / `refId`) arrive as props; rehype may
 *  lowercase the attribute, so `refid` is accepted too. Extra props are ignored. */
export interface RefChipProps {
    kind?: RefKind | string;
    refId?: string;
    /** Lowercased alias react-markdown/rehype may pass instead of `refId`. */
    refid?: string;
    className?: string;
    children?: ReactNode;
    /**
     * Navigate to the referenced thing — for a session, open its chat.
     *
     * The chip BODY never calls this: for every kind it opens the detail panel,
     * which is the common "what is this?" glance. Navigation is the deliberate
     * act, so it lives on the ↗ button beside a session chip and on the panel's
     * "Open session" button — both rendered only when this handler exists, so an
     * affordance never points nowhere. Noteboard kinds never invoke it at all
     * (nothing on this fleet deep-links to one item); the previous arrangement
     * called it for every kind and dash answered only `session`, which left todo
     * chips announcing themselves as buttons and doing nothing.
     */
    onActivate?: (kind: string, refId: string) => void;
    [key: string]: unknown;
}
/**
 * A reference chip: a bare session id or a cue-prefixed noteboard uuid, found in
 * message text by `remarkRefChips` and rendered here as a labelled chip with a
 * detail panel.
 *
 * Wire it into ReactMarkdown as the `ref-chip` component alongside
 * `remarkRefChips`:
 *
 *   <ReactMarkdown
 *     remarkPlugins={[remarkRefChips]}
 *     components={{ 'ref-chip': RefChip }}
 *   >{text}</ReactMarkdown>
 *
 * ⚠️ This component reads from `ChatProvider`'s context (it resolves the id
 * against llm-bridge or noteboard), so it must be mounted inside one. It used to
 * be a pure `<span>` that could stand alone; it is not anymore.
 *
 * Theming still stays at the edge. Every element carries a stable, unhashed
 * class name (`ref-chip-*`) and `data-*` attributes, and this file ships no CSS
 * — the host styles it, as dash does in `Chat.module.css` via `:global()`.
 */
export declare function RefChip(props: RefChipProps): JSX.Element;
//# sourceMappingURL=RefChip.d.ts.map
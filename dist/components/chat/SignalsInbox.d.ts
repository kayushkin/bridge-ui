import { type SignalRequest } from '@kayushkin/chat-core';
/**
 * Everything waiting on a human, across every session — the sidebar's "Needs you".
 *
 * ## Why a list, when the sidebar already marks the rows
 *
 * `QuestionMarkers` puts a `?` on the row that owns a question, and the reasoning
 * there is right as far as it goes: a count tells you a number, a marker tells you
 * WHICH ROW. What it assumes is that there IS a row.
 *
 * There usually is not. The sidebar loads a newest-first page; a session that asked
 * something and then went quiet sinks out of that page while its question stays open,
 * because a signal outlives the session state that produced it. Measured on this host
 * while building this: 21 open chat signals across 17 sessions, and 11 of those 17
 * sessions had no row in the sidebar's first page at all. Their questions were
 * unreachable in chat by any route — no row, so no marker, so nothing.
 *
 * So this is not a count replacing the markers. It is the surface for the signals
 * that have no row to sit on, and every card NAMES its session and opens it, which is
 * the same "which one" the marker gives you, carried on the card instead of the row.
 *
 * ## What it costs
 *
 * Nothing extra. `useOpenSignals()` with no session id is the same cross-session read
 * the sidebar already makes for `useSessionsWithOpenQuestion`, and both go through
 * one 30s cache entry keyed by `''`. Names for sessions the sidebar has not loaded
 * come from one batched lookup — see `useSessionNames`.
 */
export default function SignalsInbox({ onSelectSession, }: {
    /** Open the session a card belongs to. */
    onSelectSession: (sessionId: string) => void;
}): import("react/jsx-runtime").JSX.Element | null;
/**
 * Questions before notifications, each keeping the server's order within its kind.
 *
 * A question blocks somebody; a notification is telling you something happened. On
 * this host notifications outnumber questions two to one, so leaving them interleaved
 * by recency buries the things that actually need an answer under a list of things
 * that do not.
 *
 * Sorted rather than filtered: a notification nobody has acknowledged is still
 * waiting, and dropping it here would leave chat with no surface that shows one at
 * all.
 */
export declare function questionsFirst(requests: readonly SignalRequest[]): SignalRequest[];
//# sourceMappingURL=SignalsInbox.d.ts.map
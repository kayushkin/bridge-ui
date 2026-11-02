import type { Signal, SignalAnswerDraft } from '@kayushkin/chat-core'

/** The answers a chat-pane question card sends, with what the human typed in
 *  the chat composer added in.
 *
 *  In the chat pane the card draws no text box of its own: the composer sits
 *  right under it, and that is where a human types "these three, but staging
 *  first" after ticking options. Pressing the card's Answer used to send the
 *  ticks and leave that text sitting in the composer.
 *
 *  The text joins the LAST question's answer. One request resolves once with
 *  every answer together, and the composer holds one piece of text, so it goes
 *  with the answer the human read last rather than being copied into each.
 *  Text already typed for that question stays first. Empty composer text
 *  changes nothing. */
export function answersWithComposerText(
  questions: readonly Signal[],
  answersBySignalId: Readonly<Record<string, SignalAnswerDraft>>,
  composerText: string,
): Record<string, SignalAnswerDraft> {
  const typed = composerText.trim()
  const last = questions[questions.length - 1]
  if (typed === '' || last === undefined) return { ...answersBySignalId }
  const existing = answersBySignalId[last.id]
  const existingText = (existing?.text ?? '').trim()
  return {
    ...answersBySignalId,
    [last.id]: {
      ...existing,
      text: existingText === '' ? typed : `${existingText}\n\n${typed}`,
    },
  }
}

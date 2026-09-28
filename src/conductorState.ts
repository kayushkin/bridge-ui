// What the chat's conductor — the orchestrator, drawn at the foot of the sidebar — is
// doing, decided from what the producer and the signals say. Pure, so the order of
// the rules is tested rather than read out of a component.
//
// The orchestrator's job is to keep the work moving, not to do it, so its usual state
// is `conducting`. It cannot answer while a run is in flight, and it is the one that
// raises what needs a person: the open questions and permission requests every session
// files as signals.

export type ConductorState = 'offline' | 'alert' | 'busy' | 'trouble' | 'resting' | 'conducting'

export interface ConductorFacts {
  /** The producer answered its last poll. False when it did not; null before the first. */
  reachable: boolean | null
  /** Autonomous mode (`/config`'s `enabled`): off, the orchestrator only answers when asked. */
  enabled: boolean | null
  /** Runs started and not yet finished (`GET /runs/active`), counting a send from here. */
  activeRuns: number
  /** The error of the newest finished run, when it failed. */
  lastRunError: string | null
  /** Open signals across every session — the sidebar's "Needs you". */
  needsYou: number
  /** Of those, the ones raised since you last opened them from the conductor. Only these
   *  make it raise the alarm: a question weeks old is waiting, not urgent. */
  newNeedsYou: number
}

/** In priority order: unreachable first, since nothing else it says can be trusted then;
 *  then anything waiting on you, because that is the reason to look; then busy, because
 *  a run in flight both hides an older failure and decides whether it can answer. */
export function conductorState(facts: ConductorFacts): ConductorState {
  if (facts.reachable === false) return 'offline'
  if (facts.newNeedsYou > 0) return 'alert'
  if (facts.activeRuns > 0) return 'busy'
  if (facts.lastRunError) return 'trouble'
  if (facts.enabled === false) return 'resting'
  return 'conducting'
}

/** Whether a message sent now would be answered: not while a run is in flight (each run
 *  sees the conversation as it stood when it began), and not while unreachable. */
export function conductorCanAnswer(facts: ConductorFacts): boolean {
  return facts.reachable !== false && facts.activeRuns === 0
}

/** The words beside the conductor. */
export function conductorStatusText(state: ConductorState, facts: ConductorFacts): string {
  switch (state) {
    case 'offline':
      return 'orchestrator unreachable'
    case 'alert':
      return `${facts.newNeedsYou} new — ${facts.newNeedsYou === 1 ? 'needs' : 'need'} you`
    case 'busy':
      return facts.activeRuns > 1 ? `busy — ${facts.activeRuns} runs in flight` : 'busy — a run is in flight'
    case 'trouble':
      return 'the last run failed'
    case 'resting':
      return 'autonomous mode off — answers when asked'
    case 'conducting':
      return 'conducting'
  }
}

/** How many signals were raised after `seenUpTo` (an ISO time; null counts them all). */
export function signalsRaisedSince(createdAts: readonly string[], seenUpTo: string | null): number {
  if (seenUpTo === null) return createdAts.length
  const seen = Date.parse(seenUpTo)
  return createdAts.filter((createdAt) => Date.parse(createdAt) > seen).length
}

/** The newest of the signals' raise times — what "seen up to" becomes once you open
 *  them. Null when there are none. */
export function newestSignalTime(createdAts: readonly string[]): string | null {
  let newest: string | null = null
  for (const createdAt of createdAts) if (newest === null || Date.parse(createdAt) > Date.parse(newest)) newest = createdAt
  return newest
}

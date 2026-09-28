import { describe, expect, it } from 'vitest'
import { conductorCanAnswer, conductorState, conductorStatusText, newestSignalTime, signalsRaisedSince, type ConductorFacts } from '../src/conductorState'

const calm: ConductorFacts = { reachable: true, enabled: true, activeRuns: 0, lastRunError: null, needsYou: 0, newNeedsYou: 0 }

describe('conductorState', () => {
  it('conducts when nothing is wrong, running or waiting', () => {
    expect(conductorState(calm)).toBe('conducting')
  })
  it('conducts before the first poll has answered', () => {
    expect(conductorState({ ...calm, reachable: null, enabled: null })).toBe('conducting')
  })
  it('says unreachable over everything else', () => {
    expect(conductorState({ ...calm, reachable: false, needsYou: 3, newNeedsYou: 3, activeRuns: 1 })).toBe('offline')
  })
  it('raises what newly needs you over a run in flight', () => {
    expect(conductorState({ ...calm, needsYou: 2, newNeedsYou: 1, activeRuns: 1 })).toBe('alert')
  })
  it('keeps conducting past signals already seen', () => {
    expect(conductorState({ ...calm, needsYou: 30, newNeedsYou: 0 })).toBe('conducting')
  })
  it('is busy over an older failure', () => {
    expect(conductorState({ ...calm, activeRuns: 1, lastRunError: 'boom' })).toBe('busy')
  })
  it('shows a failed last run', () => {
    expect(conductorState({ ...calm, lastRunError: 'weekly spend limit reached' })).toBe('trouble')
  })
  it('rests with autonomous mode off', () => {
    expect(conductorState({ ...calm, enabled: false })).toBe('resting')
  })
})

describe('conductorCanAnswer', () => {
  it('answers when idle, and not while a run is in flight or unreachable', () => {
    expect(conductorCanAnswer(calm)).toBe(true)
    expect(conductorCanAnswer({ ...calm, activeRuns: 1 })).toBe(false)
    expect(conductorCanAnswer({ ...calm, reachable: false })).toBe(false)
  })
})

describe('conductorStatusText', () => {
  it('counts what newly needs you in the singular and plural', () => {
    expect(conductorStatusText('alert', { ...calm, needsYou: 5, newNeedsYou: 1 })).toBe('1 new — needs you')
    expect(conductorStatusText('alert', { ...calm, needsYou: 5, newNeedsYou: 4 })).toBe('4 new — need you')
  })
})

describe('signalsRaisedSince and newestSignalTime', () => {
  const raised = ['2026-09-28T10:00:00Z', '2026-09-28T12:00:00Z', '2026-09-27T09:00:00Z']
  it('counts every signal when nothing has been seen', () => {
    expect(signalsRaisedSince(raised, null)).toBe(3)
  })
  it('counts only those raised after what was seen', () => {
    expect(signalsRaisedSince(raised, '2026-09-28T10:00:00Z')).toBe(1)
    expect(signalsRaisedSince(raised, newestSignalTime(raised))).toBe(0)
  })
  it('names the newest raise time, or none', () => {
    expect(newestSignalTime(raised)).toBe('2026-09-28T12:00:00Z')
    expect(newestSignalTime([])).toBe(null)
  })
})

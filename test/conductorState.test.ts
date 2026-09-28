import { describe, expect, it } from 'vitest'
import { conductorCanAnswer, conductorState, conductorStatusText, type ConductorFacts } from '../src/conductorState'

const calm: ConductorFacts = { reachable: true, enabled: true, activeRuns: 0, lastRunError: null, needsYou: 0 }

describe('conductorState', () => {
  it('conducts when nothing is wrong, running or waiting', () => {
    expect(conductorState(calm)).toBe('conducting')
  })
  it('conducts before the first poll has answered', () => {
    expect(conductorState({ ...calm, reachable: null, enabled: null })).toBe('conducting')
  })
  it('says unreachable over everything else', () => {
    expect(conductorState({ ...calm, reachable: false, needsYou: 3, activeRuns: 1 })).toBe('offline')
  })
  it('raises what needs you over a run in flight', () => {
    expect(conductorState({ ...calm, needsYou: 2, activeRuns: 1 })).toBe('alert')
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
  it('counts what needs you in the singular and plural', () => {
    expect(conductorStatusText('alert', { ...calm, needsYou: 1 })).toBe('1 thing needs you')
    expect(conductorStatusText('alert', { ...calm, needsYou: 4 })).toBe('4 things need you')
  })
})

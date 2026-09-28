import { describe, expect, it } from 'vitest'
import type { SessionSummary } from '@kayushkin/chat-core'
import type { Link, Project, Rollup } from '@kayushkin/project-store-types'
import {
  NOT_FILED_LABEL,
  cardsByWorkState,
  entityTypeHeading,
  filedSessionSpend,
  groupSessionsByProject,
  lastActivitySeconds,
  openCardCounts,
  ownedThingsByType,
  projectPathName,
  projectSections,
  projectTree,
  sessionLinksPath,
  sessionMovePlan,
  sessionsFiledByProject,
  unmergedBranchCount,
} from '../src/projects'

function project(id: string, name: string, extra: Partial<Project> = {}): Project {
  return {
    id, name, kind: 'project', parent_id: '', goal: '', done_when: '', stage: 'building',
    created_by: 'test', created_at: 100, updated_at: 100, archived_at: 0, ...extra,
  }
}

let nextLinkId = 1
function link(projectId: string, entityType: string, entityRef: string, createdAt = 200): Link {
  return {
    id: nextLinkId++, project_id: projectId, entity_type: entityType, entity_ref: entityRef,
    label: entityRef, note: '', created_by: 'test', created_at: createdAt,
  }
}

function session(sessionId: string, extra: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId, state: 'completed', harness: 'claude_code', instanceId: 'i', type: 'interactive',
    purpose: 'chat', mode: '', folderName: '', displayName: sessionId, agentId: '', principalId: '',
    updatedAt: '2026-09-28T10:00:00Z', createdAt: '2026-09-28T09:00:00Z', harnessSessionId: '',
    managerSessionId: '', ...extra,
  }
}

const PLATFORM = project('project_000003', 'LLM bridge platform', { stage: 'keeping_up' })
const ACCESS = project('project_000004', 'Access and gating', { parent_id: 'project_000003' })
const SESSIONS = project('project_000005', 'Sessions and status', { parent_id: 'project_000003' })
const DISCORD = project('project_000002', 'Discord signups')
const PERSONAL = project('project_000015', 'Personal', { kind: 'stream', stage: 'keeping_up' })
const ALL = [SESSIONS, PERSONAL, DISCORD, ACCESS, PLATFORM]

describe('projectTree — nesting', () => {
  it('puts children under their parent, each level by name', () => {
    expect(projectTree(ALL).map((r) => [r.project.id, r.depth])).toEqual([
      ['project_000002', 0],
      ['project_000003', 0],
      ['project_000004', 1],
      ['project_000005', 1],
      ['project_000015', 0],
    ])
  })

  it('keeps a project whose parent is not in the list, at the top level', () => {
    const orphan = project('project_000099', 'Orphan', { parent_id: 'project_000098' })
    expect(projectTree([orphan]).map((r) => [r.project.id, r.depth])).toEqual([['project_000099', 0]])
  })

  it('does not loop on a cycle in a bad answer, and still draws the projects in it', () => {
    const a = project('project_000010', 'A', { parent_id: 'project_000011' })
    const b = project('project_000011', 'B', { parent_id: 'project_000010' })
    expect(projectTree([a, b]).map((r) => [r.project.id, r.depth])).toEqual([
      ['project_000010', 0],
      ['project_000011', 1],
    ])
  })

  it('splits streams from projects by the top-level project kind', () => {
    const sections = projectSections(ALL)
    expect(sections.projects.map((r) => r.project.id)).toEqual([
      'project_000002', 'project_000003', 'project_000004', 'project_000005',
    ])
    expect(sections.streams.map((r) => r.project.id)).toEqual(['project_000015'])
  })

  it('names a sub-project with its parent', () => {
    const byId = new Map(ALL.map((p) => [p.id, p]))
    expect(projectPathName(ACCESS, byId)).toBe('LLM bridge platform › Access and gating')
    expect(projectPathName(DISCORD, byId)).toBe('Discord signups')
  })
})

describe('groupSessionsByProject — the sidebar', () => {
  const links = [
    link('project_000004', 'session', 'br_1'),
    link('project_000002', 'session', 'br_2'),
    link('project_000003', 'session', 'br_3'),
    link('project_000002', 'session', 'br_3'),
    link('project_000099', 'session', 'br_5'), // a project not in the list (archived)
    link('project_000002', 'repo', '15'), // not a session
  ]

  it('groups in tree order, keeps list order inside a group, and puts Not filed last', () => {
    const sessions = [
      session('br_4', { spendUsd: 1 }),
      session('br_3', { spendUsd: 2 }),
      session('br_1', { spendUsd: 0.5 }),
      session('br_2'),
      session('br_5', { spendUsd: 3 }),
    ]
    const groups = groupSessionsByProject(sessions, links, ALL)
    expect(groups.map((g) => [g.key, g.label, g.sessions.map((s) => s.sessionId)])).toEqual([
      ['project_000002', 'Discord signups', ['br_3', 'br_2']],
      ['project_000003', 'LLM bridge platform', ['br_3']],
      ['project_000004', 'LLM bridge platform › Access and gating', ['br_1']],
      ['', NOT_FILED_LABEL, ['br_4', 'br_5']],
    ])
    const discord = groups[0]
    expect(discord?.spendUsd).toBe(2)
    expect(discord?.sessionsWithoutSpend).toBe(1)
  })

  it('draws no group for a project with no session on screen, and no Not filed when all are filed', () => {
    const groups = groupSessionsByProject([session('br_1')], links, ALL)
    expect(groups.map((g) => g.key)).toEqual(['project_000004'])
  })

  it('reads the session links once for every project', () => {
    expect(sessionLinksPath('/api/projects')).toBe('/api/projects/links?entity_type=session')
    expect(Object.fromEntries(sessionsFiledByProject(links))).toEqual({
      project_000004: ['br_1'],
      project_000002: ['br_2', 'br_3'],
      project_000003: ['br_3'],
      project_000099: ['br_5'],
    })
  })
})

describe('sessionMovePlan — filing and moving', () => {
  const current = [link('project_000002', 'session', 'br_1'), link('project_000003', 'session', 'br_1')]

  it('files an unfiled session and deletes nothing', () => {
    expect(sessionMovePlan([], 'project_000004')).toEqual({ fileUnder: 'project_000004', unfile: [] })
  })

  it('moves: writes the new link and deletes every other', () => {
    const plan = sessionMovePlan(current, 'project_000004')
    expect(plan.fileUnder).toBe('project_000004')
    expect(plan.unfile.map((l) => l.project_id)).toEqual(['project_000002', 'project_000003'])
  })

  it('picking a project it is already under writes nothing and takes it out of the others', () => {
    const plan = sessionMovePlan(current, 'project_000003')
    expect(plan.fileUnder).toBeNull()
    expect(plan.unfile.map((l) => l.project_id)).toEqual(['project_000002'])
  })

  it('null takes it out of every project', () => {
    expect(sessionMovePlan(current, null).unfile).toHaveLength(2)
  })
})

describe('what a project card counts', () => {
  const rollup: Rollup = {
    project: PLATFORM,
    children: [ACCESS],
    links: [link('project_000003', 'session', 'br_3', 300), link('project_000003', 'repo', '52', 150)],
    cards: [
      { card_id: 'c1', title: 'one', status: 'open', work_state: 'working' },
      { card_id: 'c2', title: 'two', status: 'open', work_state: 'waiting' },
      { card_id: 'c3', title: 'three', status: 'open', work_state: '' },
    ],
    cards_by_work_state: { working: 1, waiting: 1, not_started: 0, unmapped: 1 },
    repos: [
      {
        repo_store_id: 52, name: 'llm-bridge-server',
        unmerged_branches: [
          { name: 'a', head_sha: 'x', committed_at: 400, worktree_path: '', session_ids: [] },
          { name: 'b', head_sha: 'y', committed_at: 50, worktree_path: '', session_ids: [] },
        ],
        latest_deploy: { commit_sha: 'z', deployed_by: 'me', created_at: 350 },
      },
      { repo_store_id: 27, name: 'llm-bridge', unmerged_branches: [] },
    ],
  }

  it('puts waiting first and drops states with no cards', () => {
    expect(openCardCounts(rollup)).toEqual([
      { workState: 'waiting', count: 1 },
      { workState: 'unmapped', count: 1 },
      { workState: 'working', count: 1 },
    ])
    expect(cardsByWorkState(rollup).map((g) => g.workState)).toEqual(['waiting', '', 'working'])
  })

  it('counts unmerged branches across repos', () => {
    expect(unmergedBranchCount(rollup)).toBe(2)
  })

  it('sums known spend and counts the sessions it does not know', () => {
    const summaries = new Map([['br_3', session('br_3', { spendUsd: 2.5 })]])
    expect(filedSessionSpend(['br_3', 'br_9'], summaries)).toEqual({ count: 2, spendUsd: 2.5, sessionsWithoutSpend: 1 })
  })

  it('takes the newest of every dated thing as the last activity', () => {
    expect(lastActivitySeconds(rollup, new Map())).toBe(400)
    const later = new Map([['br_3', session('br_3', { updatedAt: '1970-01-01T00:10:00Z' })]])
    expect(lastActivitySeconds(rollup, later)).toBe(600)
  })

  it('groups owned things in the vocabulary order, leaving sessions out', () => {
    const types = [
      { type: 'repo', service: 'repo-store', meaning: '' },
      { type: 'scheduler_job', service: 'scheduler', meaning: '' },
    ]
    const owned = ownedThingsByType(
      [link('p', 'scheduler_job', '7'), link('p', 'session', 'br_1'), link('p', 'widget', 'w'), link('p', 'repo', '15')],
      types,
    )
    expect(owned.map((g) => g.entityType)).toEqual(['repo', 'scheduler_job', 'widget'])
    expect(owned[2]?.info).toBeNull()
    expect(entityTypeHeading('scheduler_job')).toBe('Scheduler jobs')
  })
})

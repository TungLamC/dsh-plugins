import { describe, expect, it } from 'vitest'
import { createPlanBoard, planName } from '../../src/client/plans.ts'

describe('planName', () => {
  it('names known plans', () => {
    expect(planName('pro')).toBe('Pro')
    expect(planName('PLUS')).toBe('Plus')
  })

  it('capitalises unknown ones', () => {
    expect(planName('self_serve_business')).toBe('Self Serve Business')
  })
})

describe('plan board', () => {
  it('holds the plan each route reports, until it is withdrawn', () => {
    const board = createPlanBoard()
    let changes = 0
    const stop = board.subscribe(() => { changes += 1 })
    const empty = board.getSnapshot()
    board.publish('openai-codex', 'pro')
    board.publish('openai-codex', 'pro')
    expect(board.getSnapshot()).toEqual({ 'openai-codex': 'pro' })
    expect(changes).toBe(1)
    board.publish('xai', 'SuperGrok')
    board.publish('openai-codex', undefined)
    expect(board.getSnapshot()).toEqual({ xai: 'SuperGrok' })
    expect(empty).toEqual({})
    stop()
    board.publish('xai', undefined)
    expect(changes).toBe(3)
  })

  it('does not mistake inherited names for plans', () => {
    expect(planName('constructor')).toBe('Constructor')
  })
})

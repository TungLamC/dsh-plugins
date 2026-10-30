import { describe, expect, it } from 'vitest'
import { planName } from '../../../src/client/oauth/plan.ts'

describe('planName', () => {
  it('names known plans', () => {
    expect(planName('pro')).toBe('Pro')
    expect(planName('PLUS')).toBe('Plus')
  })

  it('capitalises unknown ones', () => {
    expect(planName('self_serve_business')).toBe('Self Serve Business')
  })
})

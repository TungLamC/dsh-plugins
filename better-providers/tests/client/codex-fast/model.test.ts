import { describe, expect, it } from 'vitest'
import { fastToggle, type ToggleInput } from '../../../src/client/codex-fast/model.ts'

const input = (overrides: Partial<ToggleInput>): ToggleInput => ({ provider: 'openai-codex', supported: true, enabled: false, saving: undefined, ...overrides })

describe('fastToggle', () => {
  it('shows nothing unless a Codex model is selected and the Host has answered', () => {
    expect(fastToggle(input({ provider: undefined }))).toEqual({ shown: false })
    expect(fastToggle(input({ provider: 'openai' }))).toEqual({ shown: false })
    expect(fastToggle(input({ supported: undefined }))).toEqual({ shown: false })
    expect(fastToggle(input({ enabled: undefined }))).toEqual({ shown: false })
  })

  it('shows a disabled switch saying why when priority does not work in this dsh', () => {
    expect(fastToggle(input({ supported: false, enabled: undefined }))).toEqual({ shown: true, pressed: false, disabled: true, title: 'title.unsupported' })
  })

  it('shows the session\'s switch, and what it asks for while saving', () => {
    expect(fastToggle(input({ enabled: false }))).toEqual({ shown: true, pressed: false, disabled: false, title: 'title.off' })
    expect(fastToggle(input({ enabled: true }))).toEqual({ shown: true, pressed: true, disabled: false, title: 'title.on' })
    expect(fastToggle(input({ enabled: false, saving: true }))).toEqual({ shown: true, pressed: true, disabled: true, title: 'title.on' })
  })
})

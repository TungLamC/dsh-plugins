import { describe, expect, it } from 'vitest'
import { piAiIdentity, type PiAiLocator } from '../../../src/host/kit/pi-ai-identity.ts'

function locator(overrides: Partial<PiAiLocator>): PiAiLocator {
  return { ours: () => '/a/pi-ai/package.json', dsh: () => '/a/pi-ai/package.json', realpath: path => path, platform: 'linux', ...overrides }
}

describe('piAiIdentity', () => {
  it('is shared when both resolve to one real path', () => {
    const identity = piAiIdentity(locator({ ours: () => '/link/pi-ai/package.json', realpath: path => path.replace('/link/', '/a/') }))
    expect(identity).toEqual({ shared: true, path: '/a/pi-ai/package.json' })
  })

  it('is not shared for different copies', () => {
    expect(piAiIdentity(locator({ ours: () => '/plugin/node_modules/pi-ai/package.json' })).shared).toBe(false)
  })

  it('is not shared when either side cannot resolve', () => {
    expect(piAiIdentity(locator({ ours: () => undefined })).shared).toBe(false)
    expect(piAiIdentity(locator({ dsh: () => { throw new Error('no dsh-llm-pi-ai') } })).shared).toBe(false)
  })

  it('compares Windows paths without long-path prefixes or case', () => {
    const identity = piAiIdentity(locator({
      platform: 'win32',
      ours: () => '\\\\?\\C:\\Dsh\\pi-ai\\package.json',
      dsh: () => 'c:\\dsh\\PI-AI\\package.json',
    }))
    expect(identity.shared).toBe(true)
  })
})

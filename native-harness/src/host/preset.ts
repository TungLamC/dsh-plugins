/** Preset entry: gives the agents of one native preset the observation tool. */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from './index.ts'
import { observationTool } from './bridge/observation.ts'

export const name = 'native-harness-preset'
export const inject = ['tools', 'nativeHarness']
export interface Config {
  harness: 'claude-code' | 'codex' | 'antigravity'
}
export const Config = Schema.object({
  harness: Schema.union(['claude-code', 'codex', 'antigravity'] as const).required(),
})

export function apply(ctx: Context, _config: Config): void {
  ctx.effect(() => ctx.tools.register(observationTool(ctx.nativeHarness.bridge)))
}

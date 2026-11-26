/** The dsh tool that displays one native tool call. It waits for the native outcome and executes nothing. */
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { ACTIVITY_TOOL, clip, CONTENT_LIMIT, type ActivityArgs, type ActivityOutcome } from '../../shared/activity.ts'
import { HARNESS_NAMES, object, text, type HarnessId } from '../../shared/types.ts'
import type { TurnBridge } from './index.ts'

/** A known harness id; anything else is read as Claude Code, as before there were more. */
const harnessOf = (value: unknown): HarnessId =>
  typeof value === 'string' && Object.hasOwn(HARNESS_NAMES, value) ? (value as HarnessId) : 'claude-code'

function summary(outcome: ActivityOutcome): string {
  const lines = [`[${outcome.status}${outcome.exitCode !== undefined ? `, exit ${outcome.exitCode}` : ''}]`]
  if (outcome.error) lines.push(outcome.error)
  if (outcome.output) lines.push(outcome.output)
  return clip(lines.join('\n'), CONTENT_LIMIT)
}

export function observationTool(bridge: Pick<TurnBridge, 'observe'>): ToolDefinition {
  return defineTool({
    name: ACTIVITY_TOOL,
    description:
      'Shows a tool call the native harness already ran. It is driven by the harness; never call it.',
    parameters: {
      harness: { type: 'string', required: true },
      tool: { type: 'string', required: true },
      activity: { type: 'json', required: true },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: summary(value as unknown as ActivityOutcome) }],
      presentationMeta: (_args, value) => value,
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const outcome = await bridge.observe(
        {
          harness: harnessOf(args.harness),
          tool: text(args.tool),
          activity: object(args.activity) as unknown as ActivityArgs['activity'],
        },
        exec,
      )
      return JSON.parse(JSON.stringify(outcome)) as never
    },
  })
}

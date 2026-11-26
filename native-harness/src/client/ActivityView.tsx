/** Tool card of the observation tool: one native tool call, rendered from its Activity and outcome. */
import { useMemo } from 'react'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { DiffBlock, DisclosureRow, MarkdownText, StateDot, TerminalBlock } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DiffBlockLabels, MarkdownLabels, TerminalBlockLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ActivityArgs, ActivityOutcome } from '../shared/activity.ts'
import { HARNESS_NAMES, object } from '../shared/types.ts'
import type { Translate } from './locales.ts'
import './style.css'

type Props = ToolCallViewProps & { t: Translate }

function parse(raw: string): Partial<ActivityArgs> {
  try {
    return object(JSON.parse(raw)) as Partial<ActivityArgs>
  } catch {
    return {}
  }
}

export function ActivityView({ block, cwd, home, useDisclosure, t }: Props) {
  const { expanded, toggle } = useDisclosure()
  const done = 'kind' in block
  const raw = done ? (block.call?.argsRaw ?? '{}') : block.phase === 'start' ? block.argsRaw : '{}'
  const args = useMemo(() => parse(raw), [raw])
  const activity = args.activity
  const outcome = (done ? object(block.meta) : {}) as Partial<ActivityOutcome>
  const output =
    outcome.output ??
    (done
      ? (block.content as readonly { type: string; text?: string }[])
          .filter((part) => part.type === 'text')
          .map((part) => part.text ?? '')
          .join('\n')
      : '')
  const status = outcome.status ?? (done ? (block.isError ? 'failed' : 'completed') : undefined)
  const failed = status === 'failed' || status === 'declined'
  const labels = useMemo(
    () =>
      ({
        commandLine: (n: number) => `${t('commandLine')} ${n}`,
        signal: (signal: string) => signal,
        exitCode: (code: number) => `${t('exitCode')} ${code}`,
        noExitCode: t('unknownExit'),
        running: t('running'),
        failed: t('failed'),
        done: t('done'),
        copy: t('copy'),
        copied: t('copied'),
        noOutput: t('noOutput'),
        collapseAria: t('collapse'),
        collapse: t('collapse'),
        expandAria: (n: number) => `${t('expand')} (${n})`,
        expand: (n: number) => `${t('expand')} (${n})`,
        codeLabel: t('code'),
        wrapLabel: t('wrap'),
        unwrapLabel: t('unwrap'),
      }) satisfies TerminalBlockLabels & DiffBlockLabels,
    [t],
  )
  const markdown = useMemo<MarkdownLabels>(
    () => ({ code: { copyLabel: t('copy'), copiedLabel: t('copied') }, footnotes: t('footnotes') }),
    [t],
  )
  const title = activity?.title ?? 'Tool'
  const harness = args.harness ? HARNESS_NAMES[args.harness] : undefined
  const patches = outcome.patches ?? activity?.patches ?? []
  const diffs = outcome.diffs ?? activity?.diffs ?? []
  return (
    <div className="nh-tool" data-native-activity={activity?.kind ?? 'other'}>
      <DisclosureRow
        title={title}
        icon={<StateDot state={done ? (failed ? 'error' : 'done') : 'ongoing'} />}
        open={expanded}
        expandable
        onToggle={toggle}
        expandOnRowClick
        previewChevron
        keepContentWhenOpen
        contentLayoutClassName="nh-tool-heading"
        running={!done}
        collapsedContent={<span className="nh-tool-summary">{activity?.summary ?? ''}</span>}
      >
        {expanded && (
          <div className="nh-tool-body">
            {activity?.kind === 'shell' && activity.command ? (
              <TerminalBlock
                command={activity.command}
                cwd={activity.cwd ?? cwd}
                home={home}
                output={output}
                running={!done}
                runStateDot={false}
                exitCode={outcome.exitCode}
                labels={labels}
              />
            ) : outcome.plan ? (
              <MarkdownText text={outcome.plan} labels={markdown} variant="compact" />
            ) : (
              <>
                {diffs.length > 0 && (
                  <>
                    <span className="nh-tool-caption">{t('requestedChanges')}</span>
                    <DiffBlock diffs={diffs} labels={labels} />
                  </>
                )}
                {patches.map((patch, index) => (
                  <div key={index}>
                    <span>{patch.path}</span>
                    {patch.diff && <pre>{patch.diff}</pre>}
                  </div>
                ))}
                {!diffs.length && !patches.length && activity?.input !== undefined && (
                  <pre>{typeof activity.input === 'string' ? activity.input : JSON.stringify(activity.input, null, 2)}</pre>
                )}
                {output && <pre>{output}</pre>}
              </>
            )}
            {done && status && status !== 'completed' && (
              <span role="status" className="nh-error">
                {t(status === 'unknown' ? 'unknown' : status)}
              </span>
            )}
            {harness && <span className="nh-tool-caption">{harness}</span>}
          </div>
        )}
      </DisclosureRow>
    </div>
  )
}

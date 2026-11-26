/**
 * Provider icons of the model menu: a shipped mark or a configured image.
 * Which provider gets which is decided in `shared/icons.ts`; a provider
 * without one shows nothing.
 */
import { useId, useState, type ReactNode } from 'react'
import { iconOf, type IconSource } from '../shared/icons.ts'
import { MARKS } from './provider-marks.ts'

export function ProviderIcon({ source, size = 16 }: { source: IconSource; size?: number }) {
  const id = useId().replaceAll(':', '')
  const [broken, setBroken] = useState(false)
  if (source.kind === 'image')
    return broken ? null : (
      <img className="nh-provider-image" src={source.url} width={size} height={size} alt="" draggable={false} onError={() => setBroken(true)} />
    )
  const mark = MARKS[source.name]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={mark.fill}
      fillRule={mark.rule}
      aria-hidden="true"
      // Constant markup generated from Lobe Icons, never user input; gradient ids are made unique per instance.
      dangerouslySetInnerHTML={{ __html: mark.body.replaceAll('__ID__', id) }}
    />
  )
}

/** The icon of one provider, or undefined when it has none. */
export function providerIcon(provider: string, configured: Readonly<Record<string, string>>): ReactNode | undefined {
  const source = iconOf(provider, configured)
  return source ? <ProviderIcon source={source} /> : undefined
}

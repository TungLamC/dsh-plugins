/**
 * One Remote contract per row, shared by both halves: the Host registers its
 * descriptors with Typert and the browser mounts the same ones, so parameters are
 * validated against one schema on both sides. Results are plain JSON the Host
 * builds, so only inputs carry codecs.
 */

import type { z } from 'zod'
import type { InvocationDescriptor, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'

export interface MethodSpec {
  /** Positional parameters with their wire schemas (the trailing AbortSignal is not one). */
  readonly params: readonly (readonly [name: string, schema: z.ZodType])[]
  /** The Host method yields many results. */
  readonly stream?: true
  /** The Host method takes a trailing AbortSignal the caller can cancel. */
  readonly signal?: true
}

/**
 * Describe a row's Remote methods.
 * @param pkg - the module that owns them (one Typert registration per module and face).
 * @param namespace - the wire namespace, which is also the Host service key.
 * @param methods - method specs by method name.
 */
export function defineRemote(pkg: string, namespace: string, methods: Readonly<Record<string, MethodSpec>>): TypertRemoteContribution {
  const descriptors = Object.entries(methods).map(([method, spec]): InvocationDescriptor => {
    const id = `${pkg}#${namespace}/${method}`
    return {
      id,
      service: namespace,
      namespace,
      method,
      invocation: { kind: 'direct' },
      parameters: spec.params.map(([name, schema]) => ({
        name,
        wire: name,
        source: 'json',
        codec: { mode: 'strict', typeSymbol: `${id}:${name}`, create: () => schema },
      })),
      result: { mode: 'src-json' },
      ...spec.stream === true ? { mode: 'stream' } : {},
      ...spec.signal === true ? { cancellation: { parameter: 'signal' } } : {},
    }
  })
  return { package: pkg, descriptors }
}

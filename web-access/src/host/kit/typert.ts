/** Register a row's Remote descriptors with Typert for as long as the row runs. */

import type { Context } from '@deepseek-ai/cordis'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-typert-registry'

export function registerHost(ctx: Context, contribution: TypertRemoteContribution): void {
  ctx.effect(() => ctx.typert.register({
    package: contribution.package,
    face: 'host',
    schemas: [],
    model: { services: [], events: [], objects: [] },
    invocations: contribution.descriptors,
  }), `${contribution.package}: Remote descriptors`)
}

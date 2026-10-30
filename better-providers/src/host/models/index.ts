/** The models row (placeholder until its part is implemented). */

import { Service, type Context } from '@deepseek-ai/cordis'
import { SERVICE } from '../../shared/ids.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    betterProvidersModels: BetterProvidersModels
  }
}

export default class BetterProvidersModels extends Service {
  static inject = [SERVICE.main]

  constructor(ctx: Context) {
    super(ctx, SERVICE.models)
  }
}

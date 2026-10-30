/** The codex-fast row (placeholder until its part is implemented). */
import { Service } from '@deepseek-ai/cordis';
import { SERVICE } from "../../shared/ids.js";
export default class BetterProvidersCodexFast extends Service {
    static inject = [SERVICE.main];
    constructor(ctx) {
        super(ctx, SERVICE.codexFast);
    }
}

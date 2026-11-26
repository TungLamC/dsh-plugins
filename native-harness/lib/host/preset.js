import Schema from '@deepseek-ai/schemastery';
import { observationTool } from "./bridge/observation.js";
export const name = 'native-harness-preset';
export const inject = ['tools', 'nativeHarness'];
export const Config = Schema.object({
    harness: Schema.union(['claude-code', 'codex', 'antigravity']).required(),
});
export function apply(ctx, _config) {
    ctx.effect(() => ctx.tools.register(observationTool(ctx.nativeHarness.bridge)));
}

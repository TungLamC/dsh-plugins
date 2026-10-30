/**
 * Whether this plugin loads the same pi-ai as dsh's llm-pi-ai. Model refresh reads
 * the catalog llm-pi-ai serves and codex-fast patches the instance it streams with,
 * so both need dsh's own copy, which they get only through a `peerDependencies`
 * declaration (a linked checkout would otherwise load its own node_modules copy).
 */
import { realpathSync } from 'node:fs';
import { findPackageJSON } from 'node:module';
function comparable(path, platform) {
    if (platform !== 'win32')
        return path;
    // Windows answers some lookups with long-path prefixes, and file names compare without case.
    return path.replace(/^\\\\\?\\UNC\\/i, '\\\\').replace(/^\\\\\?\\/, '').toLowerCase();
}
/** Compare the two pi-ai copies; never throws. */
export function piAiIdentity(locator) {
    try {
        const ours = locator.ours();
        const dsh = locator.dsh();
        if (ours === undefined)
            return { shared: false, detail: 'this plugin cannot resolve @earendil-works/pi-ai' };
        if (dsh === undefined)
            return { shared: false, detail: 'dsh-llm-pi-ai cannot be resolved' };
        const a = comparable(locator.realpath(ours), locator.platform);
        const b = comparable(locator.realpath(dsh), locator.platform);
        return a === b ? { shared: true, path: a } : { shared: false, detail: `plugin loads ${a}, dsh loads ${b}` };
    }
    catch (error) {
        return { shared: false, detail: error instanceof Error ? error.message : String(error) };
    }
}
/**
 * The locator for a running dsh.
 * @param resolve - `import.meta.resolve` of a module of this plugin, so dsh's resolution hooks apply.
 */
export function nodeLocator(resolve) {
    return {
        ours: () => findPackageJSON(resolve('@earendil-works/pi-ai')),
        dsh: () => findPackageJSON('@earendil-works/pi-ai', resolve('@deepseek-ai/dsh-llm-pi-ai')),
        realpath: path => realpathSync.native(path),
        platform: process.platform,
    };
}

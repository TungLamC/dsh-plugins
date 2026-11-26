/**
 * Claude Code applies the `env` of its settings files over the environment it
 * was started with, so an upstream written there wins over the one
 * native-harness passes. Measured on Claude Code 2.1.328: the user file, then
 * `.claude/settings.json` and `.claude/settings.local.json` directly under the
 * working directory (not a parent's, not the git root's), local winning.
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, sep } from 'node:path';
/** Settings files Claude Code reads `env` from, lowest precedence first. */
export function settingsFiles(cwd, env) {
    const user = env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
    return [join(user, 'settings.json'), join(cwd, '.claude', 'settings.json'), join(cwd, '.claude', 'settings.local.json')];
}
/**
 * Which of `keys` each settings file sets to a value other than `passed`.
 * Unreadable files and files that are not JSON objects are skipped, as nothing can be said about them.
 */
export async function upstreamOverrides(files, keys, passed) {
    const found = [];
    for (const path of files) {
        let env;
        try {
            env = JSON.parse(await readFile(path, 'utf8'))?.env;
        }
        catch {
            continue;
        }
        if (!env || typeof env !== 'object')
            continue;
        const values = env;
        const hit = keys.filter((key) => typeof values[key] === 'string' && values[key] !== '' && values[key] !== passed[key]);
        if (hit.length)
            found.push({ path, keys: hit });
    }
    return found;
}
/** Conversation notice naming the files and variables; values are never shown. */
export function overrideNotice(overrides, home = homedir()) {
    const shown = (path) => (path === home || path.startsWith(home + sep) ? `~${path.slice(home.length)}` : path);
    const en = overrides.map((o) => `${o.keys.join(', ')} in ${shown(o.path)}`).join('; ');
    const zh = overrides.map((o) => `${shown(o.path)} 的 env 设置了 ${o.keys.join('、')}`).join('；');
    return (`Claude Code settings override the upstream native-harness passes: ${en}. Remove them there, or move them to your shell environment. / ` +
        `Claude Code 的 settings 盖掉了 native-harness 传入的上游：${zh}。把它们从文件里删掉，或者挪到 shell 的环境变量里。`);
}

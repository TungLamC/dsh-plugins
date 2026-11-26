/** Claude Code tool calls → Activity, and tool results → ActivityOutcome. */
import { boundDiffs, boundInput, boundOutput, } from "../../../shared/activity.js";
import { list, object, text } from "../../../shared/types.js";
const KINDS = {
    Bash: 'shell',
    BashOutput: 'shell',
    KillShell: 'shell',
    Edit: 'edit',
    MultiEdit: 'edit',
    Write: 'edit',
    NotebookEdit: 'edit',
    Read: 'read',
    Glob: 'search',
    Grep: 'search',
    WebSearch: 'web',
    WebFetch: 'web',
    Task: 'task',
    Agent: 'task',
    AskUserQuestion: 'question',
    ExitPlanMode: 'plan',
};
export function activityOf(name, value) {
    const input = object(value);
    const path = text(input.file_path) || text(input.notebook_path) || text(input.path);
    const diffs = [];
    if (name === 'Edit' && path && typeof input.old_string === 'string' && typeof input.new_string === 'string')
        diffs.push({ path, oldText: input.old_string, newText: input.new_string });
    if (name === 'MultiEdit' && path)
        for (const raw of list(input.edits)) {
            const edit = object(raw);
            if (typeof edit.old_string === 'string' && typeof edit.new_string === 'string')
                diffs.push({ path, oldText: edit.old_string, newText: edit.new_string });
        }
    // Write has no before-image; never invent the overwritten content.
    if (name === 'Write' && path && typeof input.content === 'string')
        diffs.push({ path, oldText: null, newText: input.content });
    const kind = KINDS[name] ?? (name.startsWith('mcp__') ? 'other' : 'other');
    const summary = text(input.description) ||
        (kind === 'shell' ? text(input.command) : '') ||
        path ||
        text(input.pattern) ||
        text(input.query) ||
        text(input.url) ||
        text(input.plan).split('\n')[0] ||
        list(input.questions)
            .map((question) => text(object(question).question))
            .join(' · ');
    return {
        name,
        kind,
        title: name.startsWith('mcp__') ? name.slice(5).replaceAll('__', ' · ') : name,
        summary: summary.split('\n')[0].slice(0, 240),
        ...(kind === 'shell' && text(input.command) ? { command: text(input.command) } : {}),
        ...(diffs.length ? { diffs: boundDiffs(diffs) } : {}),
        ...(diffs.length || kind === 'shell' ? {} : { input: boundInput(input) }),
    };
}
/** Text of a tool_result `content`, which is a string or an array of blocks. */
export function resultText(content) {
    if (typeof content === 'string')
        return content;
    return list(content)
        .map((block) => {
        const value = object(block);
        if (value.type === 'text')
            return text(value.text);
        if (value.type === 'image')
            return '[image]';
        return '';
    })
        .filter(Boolean)
        .join('\n');
}
export function outcomeOf(block) {
    const output = resultText(block.content);
    const failed = block.is_error === true;
    return {
        status: failed ? 'failed' : 'completed',
        ...(output ? { output: boundOutput(output) } : {}),
    };
}

export const ACTIVITY_TOOL = 'native_activity';
const OUTPUT_LIMIT = 32 * 1024;
const DIFF_LIMIT = 96 * 1024;
const INPUT_LIMIT = 8 * 1024;
/** What the dsh-side history keeps; the native model never reads it. */
export const CONTENT_LIMIT = 2 * 1024;
export function clip(value, limit) {
    return value.length <= limit ? value : `${value.slice(0, limit)}\n… (${value.length - limit} more characters)`;
}
export function boundOutput(value) {
    return value === undefined ? undefined : clip(value, OUTPUT_LIMIT);
}
export function boundInput(value) {
    if (value === undefined)
        return undefined;
    const json = JSON.stringify(value) ?? 'null';
    return json.length <= INPUT_LIMIT ? JSON.parse(json) : clip(json, INPUT_LIMIT);
}
/** Keep diffs while their total stays displayable; otherwise keep paths only. */
export function boundDiffs(diffs) {
    let total = 0;
    return diffs.map((diff) => {
        total += (diff.oldText?.length ?? 0) + diff.newText.length;
        return total <= DIFF_LIMIT ? diff : { path: diff.path, oldText: null, newText: '' };
    });
}
export function boundPatches(patches) {
    let total = 0;
    return patches.map((patch) => {
        total += patch.diff.length;
        return total <= DIFF_LIMIT ? patch : { path: patch.path, diff: '' };
    });
}

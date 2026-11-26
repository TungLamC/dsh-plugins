import { object, text } from "../../shared/types.js";
/**
 * User input is what a person or a peer session typed, plus the snapshot of
 * sessions the user `@`-referenced, which dsh attaches right behind the
 * message as background for the model. Other producer-owned context
 * (notices, approvals, skill catalogs, model-switch markers, runtime context)
 * is never an instruction to the native harness.
 */
export function isForwardable(source) {
    const value = object(source);
    if (value.kind === undefined || value.kind === 'user' || value.kind === 'user-rpc')
        return true;
    if (value.kind === 'session-reference')
        return true;
    return value.kind === 'agent-message' && value.form === 'relay';
}
/** User messages after the latest assistant message, in order. */
export function pendingInputs(messages) {
    const after = messages.findLastIndex((message) => message.role === 'assistant');
    const result = [];
    for (const message of messages.slice(after + 1)) {
        if (message.role !== 'user' || !isForwardable(message.source))
            continue;
        const id = 'id' in message && typeof message.id === 'string' ? message.id : undefined;
        result.push({ id, content: message.content });
    }
    return result;
}
/** Join pending messages into one native input; a leading `/token` of the first text may pick a native command. */
export async function composeInput(id, inputs, parts) {
    const texts = [];
    const images = [];
    for (const input of inputs) {
        const chunks = [];
        for (const block of input.content) {
            if (block.type === 'text')
                chunks.push(block.text);
            else if (block.type === 'image')
                images.push(parts.image(block));
            else if (block.type === 'file')
                chunks.push(text(object(block.attachment).path));
        }
        const joined = chunks.join('');
        if (joined)
            texts.push(joined);
    }
    let body = texts.join('\n\n');
    let command;
    const match = /^\/(\S+)(?:[ \t]+|\n|$)([\s\S]*)$/.exec(body);
    if (match) {
        command = await parts.command(match[1]);
        if (command)
            body = match[2];
    }
    return { id, text: body, images, ...(command ? { command } : {}) };
}

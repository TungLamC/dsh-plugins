/**
 * Claude Code's task list as dsh shows it. `TodoWrite` replaces the list;
 * `TaskCreate` / `TaskUpdate` edit it by the task id Claude hands back.
 */
import { list, object, text } from "../../../shared/types.js";
export const TASK_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate']);
const status = (value) => value === 'pending' || value === 'in_progress' || value === 'completed' ? value : undefined;
export class ClaudeTasks {
    /** By task id, or by the creating tool's id until Claude names the task. */
    items = new Map();
    /** The whole list after one task tool call; undefined for any other tool. */
    start(name, tool, value) {
        if (!TASK_TOOLS.has(name))
            return undefined;
        const input = object(value);
        if (name === 'TodoWrite') {
            this.items = new Map(list(input.todos).map((raw, index) => {
                const todo = object(raw);
                return [`todo:${index}`, { content: text(todo.content), status: status(todo.status) ?? 'pending' }];
            }));
        }
        else if (name === 'TaskCreate') {
            this.items.set(`tool:${tool}`, { content: text(input.subject), status: 'pending' });
        }
        else {
            const id = text(input.taskId);
            const current = this.items.get(id);
            if (input.status === 'deleted')
                this.items.delete(id);
            else if (current || text(input.subject))
                this.items.set(id, {
                    content: text(input.subject) || current.content,
                    status: status(input.status) ?? current?.status ?? 'pending',
                });
        }
        return [...this.items.values()];
    }
    /** `TaskCreate`'s result names the task id later updates use; the list keeps its order. */
    created(tool, result) {
        const id = text(object(object(result).task).id);
        if (!id || !this.items.has(`tool:${tool}`))
            return;
        this.items = new Map([...this.items].map(([key, todo]) => [key === `tool:${tool}` ? id : key, todo]));
    }
}
const kindOf = (type) => type === 'local_agent' ? 'agent' : type === 'local_bash' ? 'shell' : 'other';
/**
 * Running subagents and background tasks from Claude's `task_*` edges and the
 * `background_tasks_changed` level. Subagents are listed from their start;
 * other tasks only while they run in the background (a foreground shell is
 * just the tool call on screen). The level replaces the background set, so a
 * missed edge cannot leave a stale entry.
 */
export class ClaudeTaskTracker {
    tracked = new Map();
    now;
    constructor(now = Date.now) {
        this.now = now;
    }
    /** Whether closing the process now would kill work running on its own. */
    get background() {
        return this.list().some((task) => task.background);
    }
    list() {
        return [...this.tracked.values()]
            .filter(({ task, nested }) => !nested && (task.kind === 'agent' || task.background))
            .map(({ task }) => ({ ...task }));
    }
    /** The process restarted: every task it ran is gone. */
    reset() {
        this.tracked.clear();
    }
    accept(value) {
        const id = text(value.task_id);
        const entry = this.tracked.get(id);
        switch (value.subtype) {
            case 'task_started': {
                const type = text(value.task_type);
                const description = text(value.description);
                const agent = text(value.subagent_type);
                this.tracked.set(id, {
                    nested: !!text(value.parent_task_id) && type !== 'local_agent',
                    task: {
                        id,
                        kind: kindOf(type),
                        title: agent ? `${agent} · ${description}` : description,
                        background: value.is_backgrounded === true,
                        startedAt: this.now(),
                    },
                });
                return;
            }
            case 'task_progress': {
                if (!entry)
                    return;
                const usage = object(value.usage);
                if (typeof usage.total_tokens === 'number')
                    entry.task.tokens = usage.total_tokens;
                if (typeof usage.tool_uses === 'number')
                    entry.task.toolUses = usage.tool_uses;
                if (text(value.last_tool_name))
                    entry.task.lastTool = text(value.last_tool_name);
                return;
            }
            case 'task_updated': {
                const patch = object(value.patch);
                if (patch.status === 'completed' || patch.status === 'failed' || patch.status === 'killed')
                    this.tracked.delete(id);
                else if (entry && typeof patch.is_backgrounded === 'boolean')
                    entry.task.background = patch.is_backgrounded;
                return;
            }
            case 'task_notification':
                this.tracked.delete(id);
                return;
            case 'background_tasks_changed': {
                const live = new Map(list(value.tasks)
                    .map(object)
                    .filter((task) => task.ambient !== true)
                    .map((task) => [text(task.task_id), task]));
                for (const [key, tracked] of this.tracked) {
                    if (live.has(key))
                        tracked.task.background = true;
                    else if (tracked.task.background)
                        this.tracked.delete(key);
                }
                for (const [key, task] of live)
                    if (!this.tracked.has(key))
                        this.tracked.set(key, {
                            nested: !!text(task.parent_task_id) && text(task.task_type) !== 'local_agent',
                            task: {
                                id: key,
                                kind: kindOf(text(task.task_type)),
                                title: text(task.subagent_type) ? `${text(task.subagent_type)} · ${text(task.description)}` : text(task.description),
                                background: true,
                                startedAt: this.now(),
                            },
                        });
                return;
            }
        }
    }
}

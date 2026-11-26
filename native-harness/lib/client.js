window.__ModuleLoader__.load({ id: "dsh-native-harness", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
let zod = require("zod");
let react = require("react");
let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
let react_jsx_runtime = require("react/jsx-runtime");
let react_dom = require("react-dom");

// src/shared/activity.ts
const ACTIVITY_TOOL = "native_activity";

// src/shared/types.ts
/** dsh agent presets that run a native harness. */
const PRESETS = {
	"claude-code-native": "claude-code",
	"codex-native": "codex",
	"antigravity-native": "antigravity"
};
const HARNESS_NAMES = {
	"claude-code": "Claude Code",
	codex: "Codex",
	antigravity: "Antigravity"
};
function harnessOfPreset(preset) {
	return typeof preset === "string" ? PRESETS[preset] : void 0;
}
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};

// src/shared/wire.ts
/** Plugin-owned Remote methods shared by the Host service and the browser bundle. */
const PACKAGE = "dsh-native-harness";
const SERVICE = "nativeHarness";
const parameter = (name, schema) => ({
	name,
	wire: name,
	source: "json",
	codec: {
		mode: "strict",
		typeSymbol: `${PACKAGE}:${name}`,
		create: () => schema
	}
});
const session = parameter("sessionId", zod.z.string().regex(/^session-[A-Za-z0-9_-]{1,180}$/));
const optionalId = zod.z.string().min(1).max(200).nullable().optional();
const task = parameter("taskId", zod.z.string().min(1).max(200));
const change = parameter("change", zod.z.object({
	model: optionalId,
	effort: optionalId,
	mode: optionalId,
	fast: zod.z.boolean().nullable().optional(),
	endpoint: optionalId
}).strict());
const choice = parameter("choice", zod.z.object({
	id: zod.z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
	fork: zod.z.boolean()
}).strict().nullable());
const REMOTE = {
	package: PACKAGE,
	descriptors: [
		{
			method: "view",
			parameters: [session]
		},
		{
			method: "select",
			parameters: [session, change]
		},
		{
			method: "commands",
			parameters: [session]
		},
		{
			method: "tasks",
			parameters: [session]
		},
		{
			method: "stopTask",
			parameters: [session, task]
		},
		{
			method: "icons",
			parameters: []
		},
		{
			method: "terminalSessions",
			parameters: [session]
		},
		{
			method: "adopt",
			parameters: [session, choice]
		}
	].map(({ method, ...rest }) => ({
		id: `${PACKAGE}#${SERVICE}/${method}`,
		service: SERVICE,
		namespace: SERVICE,
		method,
		invocation: { kind: "direct" },
		result: { mode: "src-json" },
		cancellation: { parameter: "signal" },
		...rest
	}))
};

// \0dsh-css:src/client/style.css.mjs
const tag$1 = "dsh-native-harness/style.css";
if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${tag$1}"]`) === null) {
	const style = document.createElement("style");
	style.dataset.plugin = "dsh-native-harness";
	style.dataset.pluginCss = tag$1;
	style.textContent = ".nh-error{color:#c44;overflow-wrap:anywhere;max-width:320px}.nh-tool{min-width:0;margin-block:4px}.nh-tool-summary{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.nh-tool-heading{gap:8px}.nh-tool-body{margin:8px 0 12px 20px}.nh-tool-body pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:320px;font-size:12px;overflow:auto}.nh-tool-caption{opacity:.7;font-size:12px}.nh-permission-trigger{border-radius:var(--dsw-radius-sm);min-width:0;max-width:220px;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;outline:none;align-items:center;gap:4px;padding:0 4px 0 8px;font-size:13px;font-weight:500;line-height:20px;display:inline-flex}.nh-permission-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.nh-permission-trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}.nh-permission-trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.nh-permission-icon{flex:none;display:inline-flex}.nh-permission-icon svg{width:14px;height:14px}.nh-permission-label{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.nh-permission-chevron{color:var(--dsw-alias-label-caption);flex:none;transition:transform .12s;display:inline-flex}.nh-permission-chevron.is-open{transform:rotate(180deg)}@container (width<=460px){.nh-permission-trigger:has(.nh-permission-icon) .nh-permission-label{display:none}}.nh-resume-trigger{border-radius:var(--dsw-radius-sm);min-height:24px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;align-items:center;gap:4px;padding:2px 6px;font-size:12px;line-height:18px;display:inline-flex}.nh-resume-trigger:hover,.nh-resume-trigger:focus-visible{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-fill-l1)}.nh-resume-id,.nh-resume-full-id{font-family:var(--dsw-font-mono)}.nh-resume-panel{position-area:none;top:max(12px, calc(anchor(bottom) + 5px));bottom:12px;left:max(12px, anchor(left));position-try-fallbacks:--nh-below-window, --nh-above, --nh-viewport;z-index:1100;box-sizing:border-box;--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);width:min(520px,100vw - 32px);height:fit-content;min-height:0;box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary);border:0;flex-direction:column;place-self:start;gap:6px;margin:0;padding:10px 12px;font-size:12px;line-height:18px;display:flex;position:fixed;right:12px}.nh-resume-caption{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}.nh-resume-full-id{overflow-wrap:anywhere;user-select:all}.nh-resume-warning,.nh-resume-note{margin:2px 0 0}.nh-resume-warning{color:var(--dsw-alias-state-warning-primary,#b26b00)}.nh-resume-note{color:var(--dsw-alias-label-secondary)}.nh-terminal-option{align-items:center;gap:2px;min-width:0;max-width:min(340px,50vw);display:inline-flex}.nh-terminal-trigger{min-width:0}.nh-terminal-trigger[aria-pressed=true]{color:var(--dsw-alias-label-secondary)}.nh-terminal-label{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.nh-terminal-cancel{flex:none;padding:2px 4px}.nh-terminal-error{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-state-error-primary);font-size:12px;overflow:hidden}.nh-terminal-panel{width:min(560px,100vw - 32px)}.nh-terminal-heading{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;line-height:20px}.nh-terminal-list{flex-direction:column;gap:2px;max-height:min(360px,45vh);margin:0 -6px;display:flex;overflow-y:auto}.nh-terminal-row{border-radius:var(--dsw-radius-sm);width:100%;color:inherit;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;outline:none;grid-template-columns:minmax(0,1fr) 14px;align-items:center;column-gap:8px;padding:5px 6px;display:grid}.nh-terminal-row:hover,.nh-terminal-row:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}.nh-terminal-row[aria-checked=true]{background:var(--dsw-alias-fill-l1)}.nh-terminal-row-title,.nh-terminal-row-meta{white-space:nowrap;grid-column:1;min-width:0;overflow:hidden}.nh-terminal-row-title{text-overflow:ellipsis;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}.nh-terminal-row-meta{color:var(--dsw-alias-label-tertiary);align-items:center;gap:8px;font-size:11px;line-height:16px;display:flex}.nh-terminal-row-branch{text-overflow:ellipsis;min-width:0;overflow:hidden}.nh-terminal-row .nh-picker-check{grid-area:1/2/span 2}.nh-terminal-warning{color:var(--dsw-alias-state-warn-label);margin:2px 0 0}.nh-terminal-actions{justify-content:flex-end;display:flex}.nh-tasks-anchor{min-width:0;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));display:inline-flex}.nh-tasks-pill{border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;white-space:nowrap;cursor:pointer;background:0 0;border:none;align-items:center;gap:6px;padding:1px 8px;display:inline-flex}.nh-tasks-pill:hover,.nh-tasks-pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}.nh-tasks-panel{position-area:none;top:max(12px, var(--dsh-frame-overlay-top,12px));bottom:max(12px, calc(anchor(top) + 6px));left:max(12px, anchor(left));position-try-fallbacks:--nh-above-window, --nh-below, --nh-viewport;z-index:1100;box-sizing:border-box;--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);width:min(520px,100vw - 32px);height:fit-content;min-height:0;max-height:min(420px,100dvh - 120px);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary);border:0;flex-direction:column;place-self:end start;gap:4px;margin:0;padding:8px;font-size:12px;line-height:17px;display:flex;position:fixed;right:12px}.nh-tasks-title{color:var(--dsw-alias-label-tertiary);padding:2px 6px 4px;font-size:11px;line-height:16px}.nh-tasks-list{flex-direction:column;gap:1px;min-height:0;margin:0;padding:0;list-style:none;display:flex;overflow:auto}.nh-tasks-row{border-radius:var(--dsw-radius-md);align-items:center;gap:8px;padding:5px 6px;display:flex}.nh-tasks-row:hover{background:var(--dsw-alias-fill-l1)}.nh-tasks-main{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex}.nh-tasks-primary{align-items:baseline;gap:6px;min-width:0;display:flex}.nh-tasks-kind{border-radius:var(--dsw-radius-xs);background:var(--dsw-alias-fill-l2);color:var(--dsw-alias-label-secondary);flex:none;padding:0 5px;font-size:10px;line-height:16px}.nh-tasks-label{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;overflow:hidden}.nh-tasks-secondary{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;font-size:11px}.nh-tasks-stop{border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-specific-menu,transparent);color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;flex:none;padding:2px 8px}.nh-tasks-stop:hover:not(:disabled),.nh-tasks-stop:focus-visible{border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent);color:var(--dsw-alias-state-error-primary)}.nh-tasks-stop:disabled{cursor:default;opacity:.6}@position-try --nh-below-window{position-area:none;top:max(12px, calc(anchor(bottom) + 5px));bottom:12px;left:12px;right:12px;margin:0;align-self:safe start;justify-self:safe end}@position-try --nh-above-window{position-area:none;top:max(12px, var(--dsh-frame-overlay-top,12px));bottom:max(12px, calc(anchor(top) + 6px));left:12px;right:12px;margin:0;align-self:safe end;justify-self:safe end}@position-try --nh-above{top:max(12px, var(--dsh-frame-overlay-top,12px));bottom:max(12px, calc(anchor(top) + 5px));align-self:end}@position-try --nh-below{top:max(12px, calc(anchor(bottom) + 6px));bottom:12px;align-self:start}@position-try --nh-viewport{position-area:none;inset:max(12px, var(--dsh-frame-overlay-top,12px)) 12px 12px;margin:0;align-self:safe start;justify-self:safe end}";
	document.head.appendChild(style);
}

// src/client/ActivityView.tsx
/** Tool card of the observation tool: one native tool call, rendered from its Activity and outcome. */
function parse(raw) {
	try {
		return object(JSON.parse(raw));
	} catch {
		return {};
	}
}
function ActivityView({ block, cwd, home, useDisclosure, t }) {
	const { expanded, toggle } = useDisclosure();
	const done = "kind" in block;
	const raw = done ? block.call?.argsRaw ?? "{}" : block.phase === "start" ? block.argsRaw : "{}";
	const args = (0, react.useMemo)(() => parse(raw), [raw]);
	const activity = args.activity;
	const outcome = done ? object(block.meta) : {};
	const output = outcome.output ?? (done ? block.content.filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n") : "");
	const status = outcome.status ?? (done ? block.isError ? "failed" : "completed" : void 0);
	const failed = status === "failed" || status === "declined";
	const labels = (0, react.useMemo)(() => ({
		commandLine: (n) => `${t("commandLine")} ${n}`,
		signal: (signal) => signal,
		exitCode: (code) => `${t("exitCode")} ${code}`,
		noExitCode: t("unknownExit"),
		running: t("running"),
		failed: t("failed"),
		done: t("done"),
		copy: t("copy"),
		copied: t("copied"),
		noOutput: t("noOutput"),
		collapseAria: t("collapse"),
		collapse: t("collapse"),
		expandAria: (n) => `${t("expand")} (${n})`,
		expand: (n) => `${t("expand")} (${n})`,
		codeLabel: t("code"),
		wrapLabel: t("wrap"),
		unwrapLabel: t("unwrap")
	}), [t]);
	const markdown = (0, react.useMemo)(() => ({
		code: {
			copyLabel: t("copy"),
			copiedLabel: t("copied")
		},
		footnotes: t("footnotes")
	}), [t]);
	const title = activity?.title ?? "Tool";
	const harness = args.harness ? HARNESS_NAMES[args.harness] : void 0;
	const patches = outcome.patches ?? activity?.patches ?? [];
	const diffs = outcome.diffs ?? activity?.diffs ?? [];
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		className: "nh-tool",
		"data-native-activity": activity?.kind ?? "other",
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
			title,
			icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: done ? failed ? "error" : "done" : "ongoing" }),
			open: expanded,
			expandable: true,
			onToggle: toggle,
			expandOnRowClick: true,
			previewChevron: true,
			keepContentWhenOpen: true,
			contentLayoutClassName: "nh-tool-heading",
			running: !done,
			collapsedContent: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "nh-tool-summary",
				children: activity?.summary ?? ""
			}),
			children: expanded && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "nh-tool-body",
				children: [
					activity?.kind === "shell" && activity.command ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.TerminalBlock, {
						command: activity.command,
						cwd: activity.cwd ?? cwd,
						home,
						output,
						running: !done,
						runStateDot: false,
						exitCode: outcome.exitCode,
						labels
					}) : outcome.plan ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {
						text: outcome.plan,
						labels: markdown,
						variant: "compact"
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						diffs.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "nh-tool-caption",
							children: t("requestedChanges")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.DiffBlock, {
							diffs,
							labels
						})] }),
						patches.map((patch, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: patch.path }), patch.diff && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", { children: patch.diff })] }, index)),
						!diffs.length && !patches.length && activity?.input !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", { children: typeof activity.input === "string" ? activity.input : JSON.stringify(activity.input, null, 2) }),
						output && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", { children: output })
					] }),
					done && status && status !== "completed" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						role: "status",
						className: "nh-error",
						children: t(status === "unknown" ? "unknown" : status)
					}),
					harness && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "nh-tool-caption",
						children: harness
					})
				]
			})
		})
	});
}

// src/client/actions.ts
async function unwrap(result) {
	const value = await result;
	if (!value.ok) throw new Error(value.error.message);
	return value.value;
}
function nativeActions(remote) {
	return {
		view: (sessionId) => unwrap(remote.view(sessionId)),
		select: (sessionId, change) => unwrap(remote.select(sessionId, change)),
		commands: (sessionId) => unwrap(remote.commands(sessionId)),
		tasks: (sessionId) => unwrap(remote.tasks(sessionId)),
		stopTask: (sessionId, taskId) => unwrap(remote.stopTask(sessionId, taskId)),
		icons: () => unwrap(remote.icons()),
		terminalSessions: (sessionId) => unwrap(remote.terminalSessions(sessionId)),
		adopt: (sessionId, choice) => unwrap(remote.adopt(sessionId, choice))
	};
}

// src/client/commands.ts
/**
* `/` menu groups for native slash commands and skills: one group per
* harness, populated only in that harness's sessions. A pick inserts
* `/token ` literally; the Host turns it into the harness's own invocation.
*/
const FRESH_MS = 3e4;
function commandSources(actions, harnessOf, t) {
	const cache = /* @__PURE__ */ new Map();
	const listeners = /* @__PURE__ */ new Map();
	const notify = (sessionId) => {
		for (const listener of listeners.get(sessionId) ?? []) listener();
	};
	const load = (sessionId) => {
		const entry = cache.get(sessionId) ?? { at: 0 };
		cache.set(sessionId, entry);
		if (entry.entries && Date.now() - entry.at < FRESH_MS) return Promise.resolve(entry.entries);
		entry.loading ??= actions.commands(sessionId).then((entries) => {
			entry.entries = entries;
			entry.at = Date.now();
			notify(sessionId);
			return entries;
		}).finally(() => {
			entry.loading = void 0;
		});
		return entry.loading.catch(() => entry.entries ?? []);
	};
	return Object.keys(HARNESS_NAMES).map((harness) => {
		const mine = (session) => harnessOf(session.sessionId) === harness;
		return {
			trigger: "/",
			name: HARNESS_NAMES[harness],
			order: 1,
			async candidates(session, request) {
				if (!mine(session)) return [];
				const entries = await load(session.sessionId);
				request.signal.throwIfAborted();
				const rows = entries.map((entry) => ({
					name: entry.token,
					description: entry.token === entry.name ? entry.description : `${entry.name} · ${entry.description}`,
					section: `${HARNESS_NAMES[harness]} · ${entry.kind === "skill" ? t("skills") : t("commands")}`,
					...entry.argumentHint && request.position === "leading" ? { hint: entry.argumentHint } : {}
				}));
				return request.query ? (0, _deepseek_ai_dsh_client_ui_primitives.rankByName)(rows, request.query) : rows;
			},
			onPick({ candidate }) {
				return { text: `/${candidate.name} ` };
			},
			lexicon(session) {
				if (!mine(session)) return void 0;
				const entries = cache.get(session.sessionId)?.entries;
				if (!entries) load(session.sessionId);
				return entries?.map((entry) => entry.token);
			},
			subscribeLexicon(session, listener) {
				const set = listeners.get(session.sessionId) ?? /* @__PURE__ */ new Set();
				set.add(listener);
				listeners.set(session.sessionId, set);
				return () => {
					set.delete(listener);
					if (!set.size) listeners.delete(session.sessionId);
				};
			}
		};
	});
}

// src/client/locales.ts
const en = {
	model: "Model",
	effort: "Effort",
	default: "Default",
	chooseModel: "Select model and effort",
	pickerMenu: "Model and reasoning effort",
	searchModels: "Search models…",
	clearSearch: "Clear search",
	noModels: "No matching models.",
	noEfforts: "This model provides no reasoning effort levels.",
	loadingModels: "Refreshing model list…",
	effortLow: "Low",
	effortMedium: "Medium",
	effortHigh: "High",
	effortMax: "Max",
	effortXHigh: "Extra high",
	effortUltra: "Ultra",
	effortMinimal: "Minimal",
	effortNone: "None",
	retry: "Retry",
	nextTurn: "Takes effect on the next turn",
	endpointWaitTurn: "Switches to {name} after this turn",
	endpointWaitTasks: "Switches to {name} once the background tasks finish",
	permission: "Permission",
	permissionMode: "Permission: {name}",
	confirmTitle: "Allow everything?",
	confirmDescription: "The harness will run every tool without asking. Use it only in a workspace you trust.",
	confirmAcknowledge: "I understand the risk",
	autoConfirmTitle: "Turn on Auto review?",
	autoConfirmDescription: "A reviewer model approves or denies each dsh tool call in this session. It can make mistakes.",
	confirmEnable: "Enable",
	cancel: "Cancel",
	close: "Close",
	skills: "Skills",
	commands: "Commands",
	commandLine: "Command line",
	exitCode: "Exit code",
	unknownExit: "Exit status unknown",
	running: "Running",
	failed: "Failed",
	declined: "Declined",
	interrupted: "Interrupted",
	unknown: "Outcome unknown",
	done: "Completed",
	copy: "Copy",
	copied: "Copied",
	noOutput: "No output",
	collapse: "Collapse",
	expand: "Show more",
	code: "Code",
	wrap: "Wrap lines",
	unwrap: "Disable wrapping",
	requestedChanges: "Requested changes",
	footnotes: "Footnotes",
	tasksRunning: "{count} running",
	tasksTitle: "Subagents and background tasks",
	taskAgent: "Subagent",
	taskShell: "Command",
	taskOther: "Task",
	taskBackground: "Background",
	taskTokens: "{count} tokens",
	taskTools: "{count} tool calls",
	taskStop: "Stop",
	taskStopping: "Stopping…",
	resumeTitle: "Native {name} session",
	resumeCommand: "Resume in the terminal",
	terminalResume: "Continue a terminal session",
	terminalTitle: "Continue a Claude Code session from the terminal",
	terminalCaption: "Started in {dir}, newest first",
	terminalLoading: "Reading sessions…",
	terminalEmpty: "No Claude Code session was started in a terminal in this directory.",
	terminalOpen: "Open in a terminal",
	terminalFork: "Continue on a copy; the terminal session stays as it is",
	terminalForkForced: "A terminal still has this session open, so dsh can only continue a copy. To continue it directly, quit it in the terminal first.",
	terminalDirect: "dsh writes on to this very session. Don't open it in a terminal while dsh is using it.",
	terminalHistory: "dsh shows only what comes next; Claude keeps the whole earlier conversation.",
	terminalConfirm: "Continue in dsh",
	terminalAdopted: "Continuing: {title}",
	terminalAdoptedFork: "Continuing a copy: {title}",
	terminalCancel: "Don't continue it",
	agoNow: "just now",
	agoMinutes: "{n} min ago",
	agoHours: "{n} h ago",
	agoDays: "{n} d ago",
	resumeLive: "dsh still holds this session's native process and lets go after {minutes} idle minutes. Don't continue it in the terminal before then: both sides would write to the same session.",
	resumeIdle: "dsh holds no native process for this session now, so you can continue it in the terminal. Back in dsh, the native session keeps what you did there, but dsh does not show it.",
	"mode_claude-code_default": "Ask",
	"mode_claude-code_acceptEdits": "Accept edits",
	"mode_claude-code_plan": "Plan",
	"mode_claude-code_auto": "Auto",
	"mode_claude-code_bypassPermissions": "Bypass permissions",
	"mode_codex_read-only": "Read only",
	mode_codex_auto: "Ask for approval",
	"mode_codex_auto-review": "Auto review",
	"mode_codex_full-access": "Full access",
	mode_antigravity_default: "Ask",
	"mode_antigravity_accept-edits": "Accept edits",
	mode_antigravity_auto: "Auto",
	mode_antigravity_plan: "Plan",
	"preset_read-only": "Read Only",
	"preset_workspace-write": "Workspace Write",
	"preset_danger-full-access": "Full access",
	preset_auto: "Auto review",
	teamLabel: "Enable agent teamwork",
	teamInfo: "About agent teamwork",
	teamDescription: "Coordinate work and progress across agents with a shared task board for better results on complex tasks, with correspondingly higher token costs.",
	teamFailed: "Could not confirm the agent teamwork setting was saved. Try again: {message}",
	teamDisableTitle: "Disable agent teamwork?",
	teamDisableDescription: "Disabling agent teamwork during a conversation stops the use of shared task tools and team coordination instructions.",
	teamDisableWarning: "Disabling it may affect cache reuse, increase subsequent token usage and costs, and affect collaboration on the current task.",
	teamDisableConfirm: "Disable",
	fastLabel: "Fast mode",
	fastOff: "Turn on fast mode (uses more of your limits)",
	fastOn: "Fast mode is on; click to turn it off",
	fastFailed: "Not saved"
};
const zh = {
	model: "模型",
	effort: "推理等级",
	default: "默认",
	chooseModel: "选择模型与推理等级",
	pickerMenu: "模型与推理等级",
	searchModels: "搜索模型…",
	clearSearch: "清除搜索",
	noModels: "没有匹配的模型。",
	noEfforts: "当前模型未提供推理等级。",
	loadingModels: "正在刷新模型列表…",
	effortLow: "低",
	effortMedium: "中",
	effortHigh: "高",
	effortMax: "最高",
	effortXHigh: "极高",
	effortUltra: "超高",
	effortMinimal: "最低",
	effortNone: "无",
	retry: "重试",
	nextTurn: "下一轮生效",
	endpointWaitTurn: "本轮结束后切到 {name}",
	endpointWaitTasks: "后台任务结束后切到 {name}",
	permission: "权限",
	permissionMode: "权限：{name}",
	confirmTitle: "允许所有操作？",
	confirmDescription: "该引擎将不经询问执行所有工具。只在你信任的工作区使用。",
	confirmAcknowledge: "我了解风险",
	autoConfirmTitle: "开启自动审核？",
	autoConfirmDescription: "由审核模型批准或拒绝本会话中的每个 dsh 工具调用，可能出错。",
	confirmEnable: "启用",
	cancel: "取消",
	close: "关闭",
	skills: "技能",
	commands: "命令",
	commandLine: "命令行",
	exitCode: "退出码",
	unknownExit: "退出状态未知",
	running: "运行中",
	failed: "失败",
	declined: "已拒绝",
	interrupted: "已中断",
	unknown: "结果未知",
	done: "已完成",
	copy: "复制",
	copied: "已复制",
	noOutput: "无输出",
	collapse: "收起",
	expand: "展开更多",
	code: "代码",
	wrap: "自动换行",
	unwrap: "取消换行",
	requestedChanges: "请求的修改",
	footnotes: "脚注",
	tasksRunning: "{count} 个运行中",
	tasksTitle: "子代理与后台任务",
	taskAgent: "子代理",
	taskShell: "命令",
	taskOther: "任务",
	taskBackground: "后台",
	taskTokens: "{count} token",
	taskTools: "{count} 次工具调用",
	taskStop: "停止",
	taskStopping: "正在停止…",
	resumeTitle: "原生 {name} 会话",
	resumeCommand: "在终端里继续",
	terminalResume: "从终端会话继续",
	terminalTitle: "接着终端里的 Claude Code 会话继续",
	terminalCaption: "在 {dir} 里开过的会话，最近的在前",
	terminalLoading: "正在读取会话…",
	terminalEmpty: "这个目录下没有在终端里开过的 Claude Code 会话。",
	terminalOpen: "终端里开着",
	terminalFork: "在副本上继续，终端里的原会话不变",
	terminalForkForced: "终端里还开着这个会话，只能在副本上继续。要直接续接，先在终端里退出它。",
	terminalDirect: "dsh 会接着这个会话本身往下写，dsh 用着它的时候不要在终端里打开。",
	terminalHistory: "dsh 只显示之后的对话，之前的内容 Claude 都记得。",
	terminalConfirm: "在 dsh 里继续",
	terminalAdopted: "续接：{title}",
	terminalAdoptedFork: "副本续接：{title}",
	terminalCancel: "不续接了",
	agoNow: "刚刚",
	agoMinutes: "{n} 分钟前",
	agoHours: "{n} 小时前",
	agoDays: "{n} 天前",
	resumeLive: "dsh 仍持有这个会话的原生进程，空闲 {minutes} 分钟后释放。在此之前不要在终端里继续，否则两边会同时写同一个会话。",
	resumeIdle: "dsh 当前没有持有这个会话的原生进程，可以在终端里继续。之后回到 dsh 时，原生会话会带上终端里的内容，但 dsh 里不会显示那部分对话。",
	"mode_claude-code_default": "询问",
	"mode_claude-code_acceptEdits": "自动接受编辑",
	"mode_claude-code_plan": "计划",
	"mode_claude-code_auto": "自动",
	"mode_claude-code_bypassPermissions": "跳过权限检查",
	"mode_codex_read-only": "只读",
	mode_codex_auto: "请求批准",
	"mode_codex_auto-review": "自动审核",
	"mode_codex_full-access": "完全访问",
	mode_antigravity_default: "询问",
	"mode_antigravity_accept-edits": "自动接受编辑",
	mode_antigravity_auto: "自动",
	mode_antigravity_plan: "计划",
	"preset_read-only": "仅可查看",
	"preset_workspace-write": "工作区内修改",
	"preset_danger-full-access": "完全权限",
	preset_auto: "自动审查",
	teamLabel: "启用智能体团队协作",
	teamInfo: "关于智能体团队协作",
	teamDescription: "通过共享任务板协调多个智能体的分工与进度，复杂任务表现更佳，token 开销也相应更高。",
	teamFailed: "无法确认智能体团队协作设置已保存，请重试：{message}",
	teamDisableTitle: "确认停用智能体团队协作？",
	teamDisableDescription: "对话过程中停用智能体团队协作，将停止共享任务工具和团队协调指令。",
	teamDisableWarning: "停用后可能影响缓存复用、增加后续 token 用量与开销，并影响当前任务的协作效果。",
	teamDisableConfirm: "确认停用",
	fastLabel: "快速模式",
	fastOff: "开启快速模式（消耗更多额度）",
	fastOn: "快速模式已开启，点击关闭",
	fastFailed: "保存失败"
};

// src/shared/icons.ts
/**
* Provider icons in the model menu. dsh's own providers and pi-ai's built-in
* ones have a mark by their exact route id; a route the user defined has none
* unless the `providerIcons` option names one: a mark the plugin ships, or an
* image URL. An empty value hides a built-in provider's mark.
*/
/** Marks the plugin ships (from Lobe Icons); also the names `providerIcons` accepts. */
const ICON_NAMES = [
	"anthropic",
	"antigravity",
	"azure",
	"baseten",
	"bedrock",
	"cerebras",
	"claude",
	"cloudflare",
	"deepseek",
	"doubao",
	"fireworks",
	"gemini",
	"githubcopilot",
	"google",
	"groq",
	"huggingface",
	"kimi",
	"ling",
	"meta",
	"minimax",
	"mistral",
	"moonshot",
	"nvidia",
	"openai",
	"opencode",
	"openrouter",
	"qwen",
	"together",
	"vercel",
	"vertexai",
	"volcengine",
	"xai",
	"xiaomimimo",
	"zai",
	"zhipu"
];
/** dsh's DeepSeek providers and pi-ai's built-in providers (as of dsh 0.2.2-rc.5), by route id. */
const BUILTIN_ICONS = {
	deepseek: "deepseek",
	"deepseek-account": "deepseek",
	"deepseek-official": "deepseek",
	"amazon-bedrock": "bedrock",
	"ant-ling": "ling",
	anthropic: "anthropic",
	azure: "azure",
	baseten: "baseten",
	cerebras: "cerebras",
	"cloudflare-ai-gateway": "cloudflare",
	"cloudflare-workers-ai": "cloudflare",
	fireworks: "fireworks",
	"github-copilot": "githubcopilot",
	google: "google",
	"google-vertex": "vertexai",
	groq: "groq",
	huggingface: "huggingface",
	"kimi-coding": "kimi",
	meta: "meta",
	minimax: "minimax",
	"minimax-cn": "minimax",
	mistral: "mistral",
	moonshotai: "moonshot",
	"moonshotai-cn": "moonshot",
	nvidia: "nvidia",
	openai: "openai",
	"openai-codex": "openai",
	opencode: "opencode",
	"opencode-go": "opencode",
	openrouter: "openrouter",
	"qwen-token-plan": "qwen",
	"qwen-token-plan-cn": "qwen",
	"qwen-token-plan-individual": "qwen",
	together: "together",
	"vercel-ai-gateway": "vercel",
	xai: "xai",
	xiaomi: "xiaomimimo",
	"xiaomi-token-plan-ams": "xiaomimimo",
	"xiaomi-token-plan-cn": "xiaomimimo",
	"xiaomi-token-plan-sgp": "xiaomimimo",
	zai: "zai",
	"zai-coding-cn": "zhipu"
};
/** An `https:`, `http:` or `data:image/` address, shown as an image. */
const ICON_URL = /^(https?:\/\/|data:image\/)/i;
/** A provider's icon: the configured value when there is one (empty hides it), else its built-in mark. */
function iconOf(provider, configured) {
	const value = Object.hasOwn(configured, provider) ? configured[provider] : BUILTIN_ICONS[provider];
	if (!value) return void 0;
	if (ICON_NAMES.includes(value)) return {
		kind: "mark",
		name: value
	};
	return ICON_URL.test(value) ? {
		kind: "image",
		url: value
	} : void 0;
}

// src/client/provider-marks.ts
/*! Lobe Icons (@lobehub/icons-static-svg 1.102.0), MIT.
* Copyright (c) 2023 LobeHub. Full license and source attribution in README.md.
* SVG bodies of the files named below, unchanged except for the dropped title and gradient ids.
*/
const MARKS = {
	"anthropic": {
		file: "anthropic.svg",
		fill: "currentColor",
		rule: "evenodd",
		body: "<path d=\"M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48zm-7.258 0h3.767L16.906 20h-3.674l-1.343-3.461H5.017l-1.344 3.46H0L6.57 3.522zm4.132 9.959L8.453 7.687 6.205 13.48H10.7z\"></path>"
	},
	"antigravity": {
		file: "antigravity-color.svg",
		body: "<mask height=\"23\" id=\"__ID__-0\" maskUnits=\"userSpaceOnUse\" width=\"24\" x=\"0\" y=\"1\"><path d=\"M21.751 22.607c1.34 1.005 3.35.335 1.508-1.508C17.73 15.74 18.904 1 12.037 1 5.17 1 6.342 15.74.815 21.1c-2.01 2.009.167 2.511 1.507 1.506 5.192-3.517 4.857-9.714 9.715-9.714 4.857 0 4.522 6.197 9.714 9.715z\" fill=\"#fff\"></path></mask><g mask=\"url(#__ID__-0)\"><g filter=\"url(#__ID__-1)\"><path d=\"M-1.018-3.992c-.408 3.591 2.686 6.89 6.91 7.37 4.225.48 7.98-2.043 8.387-5.633.408-3.59-2.686-6.89-6.91-7.37-4.225-.479-7.98 2.043-8.387 5.633z\" fill=\"#FFE432\"></path></g><g filter=\"url(#__ID__-2)\"><path d=\"M15.269 7.747c1.058 4.557 5.691 7.374 10.348 6.293 4.657-1.082 7.575-5.653 6.516-10.21-1.058-4.556-5.691-7.374-10.348-6.292-4.657 1.082-7.575 5.653-6.516 10.21z\" fill=\"#FC413D\"></path></g><g filter=\"url(#__ID__-3)\"><path d=\"M-12.443 10.804c1.338 4.703 7.36 7.11 13.453 5.378 6.092-1.733 9.947-6.95 8.61-11.652C8.282-.173 2.26-2.58-3.833-.848-9.925.884-13.78 6.1-12.443 10.804z\" fill=\"#00B95C\"></path></g><g filter=\"url(#__ID__-4)\"><path d=\"M-12.443 10.804c1.338 4.703 7.36 7.11 13.453 5.378 6.092-1.733 9.947-6.95 8.61-11.652C8.282-.173 2.26-2.58-3.833-.848-9.925.884-13.78 6.1-12.443 10.804z\" fill=\"#00B95C\"></path></g><g filter=\"url(#__ID__-5)\"><path d=\"M-7.608 14.703c3.352 3.424 9.126 3.208 12.896-.483 3.77-3.69 4.108-9.459.756-12.883C2.69-2.087-3.083-1.871-6.853 1.82c-3.77 3.69-4.108 9.458-.755 12.883z\" fill=\"#00B95C\"></path></g><g filter=\"url(#__ID__-6)\"><path d=\"M9.932 27.617c1.04 4.482 5.384 7.303 9.7 6.3 4.316-1.002 6.971-5.448 5.93-9.93-1.04-4.483-5.384-7.304-9.7-6.301-4.316 1.002-6.971 5.448-5.93 9.93z\" fill=\"#3186FF\"></path></g><g filter=\"url(#__ID__-7)\"><path d=\"M2.572-8.185C.392-3.329 2.778 2.472 7.9 4.771c5.122 2.3 11.042.227 13.222-4.63 2.18-4.855-.205-10.656-5.327-12.955-5.122-2.3-11.042-.227-13.222 4.63z\" fill=\"#FBBC04\"></path></g><g filter=\"url(#__ID__-8)\"><path d=\"M-3.267 38.686c-5.277-2.072 3.742-19.117 5.984-24.83 2.243-5.712 8.34-8.664 13.616-6.592 5.278 2.071 11.533 13.482 9.29 19.195-2.242 5.713-23.613 14.298-28.89 12.227z\" fill=\"#3186FF\"></path></g><g filter=\"url(#__ID__-9)\"><path d=\"M28.71 17.471c-1.413 1.649-5.1.808-8.236-1.878-3.135-2.687-4.531-6.201-3.118-7.85 1.412-1.649 5.1-.808 8.235 1.878s4.532 6.2 3.119 7.85z\" fill=\"#749BFF\"></path></g><g filter=\"url(#__ID__-10)\"><path d=\"M18.163 9.077c5.81 3.93 12.502 4.19 14.946.577 2.443-3.612-.287-9.727-6.098-13.658-5.81-3.931-12.502-4.19-14.946-.577-2.443 3.612.287 9.727 6.098 13.658z\" fill=\"#FC413D\"></path></g><g filter=\"url(#__ID__-11)\"><path d=\"M-.915 2.684c-1.44 3.473-.97 6.967 1.05 7.804 2.02.837 4.824-1.3 6.264-4.772 1.44-3.473.97-6.967-1.05-7.804-2.02-.837-4.824 1.3-6.264 4.772z\" fill=\"#FFEE48\"></path></g></g><defs><filter color-interpolation-filters=\"sRGB\" filterUnits=\"userSpaceOnUse\" height=\"17.587\" id=\"__ID__-1\" width=\"19.838\" x=\"-3.288\" y=\"-11.917\"><feFlood flood-opacity=\"0\" result=\"BackgroundImageFix\"></feFlood><feBlend in=\"SourceGraphic\" in2=\"BackgroundImageFix\" result=\"shape\"></feBlend><feGaussianBlur result=\"effect1_foregroundBlur_977_115\" stdDeviation=\"1.117\"></feGaussianBlur></filter><filter color-interpolation-filters=\"sRGB\" filterUnits=\"userSpaceOnUse\" height=\"38.565\" id=\"__ID__-2\" width=\"38.9\" x=\"4.251\" y=\"-13.493\"><feFlood flood-opacity=\"0\" result=\"BackgroundImageFix\"></feFlood><feBlend in=\"SourceGraphic\" in2=\"BackgroundImageFix\" result=\"shape\"></feBlend><feGaussianBlur result=\"effect1_foregroundBlur_977_115\" stdDeviation=\"5.4\"></feGaussianBlur></filter><filter color-interpolation-filters=\"sRGB\" filterUnits=\"userSpaceOnUse\" height=\"36.517\" id=\"__ID__-3\" width=\"40.955\" x=\"-21.889\" y=\"-10.592\"><feFlood flood-opacity=\"0\" result=\"BackgroundImageFix\"></feFlood><feBlend in=\"SourceGraphic\" in2=\"BackgroundImageFix\" result=\"shape\"></feBlend><feGaussianBlur result=\"effect1_foregroundBlur_977_115\" stdDeviation=\"4.591\"></feGaussianBlur></filter><filter color-interpolation-filters=\"sRGB\" filterUnits=\"userSpaceOnUse\" height=\"36.517\" id=\"__ID__-4\" width=\"40.955\" x=\"-21.889\" y=\"-10.592\"><feFlood flood-opacity=\"0\" result=\"BackgroundImageFix\"></feFlood><feBlend in=\"SourceGraphic\" in2=\"BackgroundImageFix\" result=\"shape\"></feBlend><feGaussianBlur result=\"effect1_foregroundBlur_977_115\" stdDeviation=\"4.591\"></feGaussianBlur></filter><filter color-interpolation-filters=\"sRGB\" filterUnits=\"userSpaceOnUse\" height=\"36.595\" id=\"__ID__-5\" width=\"36.632\" x=\"-19.099\" y=\"-10.278\"><feFlood flood-opacity=\"0\" result=\"BackgroundImageFix\"></feFlood><feBlend in=\"SourceGraphic\" in2=\"BackgroundImageFix\" result=\"shape\"></feBlend><feGaussianBlur result=\"effect1_foregroundBlur_977_115\" stdDeviation=\"4.591\"></feGaussianBlur></filter><filter color-interpolation-filters=\"sRGB\" filterUnits=\"userSpaceOnUse\" height=\"34.087\" id=\"__ID__-6\" width=\"33.533\" x=\".981\" y=\"8.758\"><feFlood flood-opacity=\"0\" result=\"BackgroundImageFix\"></feFlood><feBlend in=\"SourceGraphic\" in2=\"BackgroundImageFix\" result=\"shape\"></feBlend><feGaussianBlur result=\"effect1_foregroundBlur_977_115\" stdDeviation=\"4.363\"></feGaussianBlur></filter><filter color-interpolation-filters=\"sRGB\" filterUnits=\"userSpaceOnUse\" height=\"35.276\" id=\"__ID__-7\" width=\"35.978\" x=\"-6.143\" y=\"-21.659\"><feFlood flood-opacity=\"0\" result=\"BackgroundImageFix\"></feFlood><feBlend in=\"SourceGraphic\" in2=\"BackgroundImageFix\" result=\"shape\"></feBlend><feGaussianBlur result=\"effect1_foregroundBlur_977_115\" stdDeviation=\"3.954\"></feGaussianBlur></filter><filter color-interpolation-filters=\"sRGB\" filterUnits=\"userSpaceOnUse\" height=\"46.523\" id=\"__ID__-8\" width=\"45.114\" x=\"-11.96\" y=\"-.46\"><feFlood flood-opacity=\"0\" result=\"BackgroundImageFix\"></feFlood><feBlend in=\"SourceGraphic\" in2=\"BackgroundImageFix\" result=\"shape\"></feBlend><feGaussianBlur result=\"effect1_foregroundBlur_977_115\" stdDeviation=\"3.531\"></feGaussianBlur></filter><filter color-interpolation-filters=\"sRGB\" filterUnits=\"userSpaceOnUse\" height=\"24.054\" id=\"__ID__-9\" width=\"25.094\" x=\"10.485\" y=\".58\"><feFlood flood-opacity=\"0\" result=\"BackgroundImageFix\"></feFlood><feBlend in=\"SourceGraphic\" in2=\"BackgroundImageFix\" result=\"shape\"></feBlend><feGaussianBlur result=\"effect1_foregroundBlur_977_115\" stdDeviation=\"3.159\"></feGaussianBlur></filter><filter color-interpolation-filters=\"sRGB\" filterUnits=\"userSpaceOnUse\" height=\"30.007\" id=\"__ID__-10\" width=\"33.508\" x=\"5.833\" y=\"-12.467\"><feFlood flood-opacity=\"0\" result=\"BackgroundImageFix\"></feFlood><feBlend in=\"SourceGraphic\" in2=\"BackgroundImageFix\" result=\"shape\"></feBlend><feGaussianBlur result=\"effect1_foregroundBlur_977_115\" stdDeviation=\"2.669\"></feGaussianBlur></filter><filter color-interpolation-filters=\"sRGB\" filterUnits=\"userSpaceOnUse\" height=\"26.151\" id=\"__ID__-11\" width=\"22.194\" x=\"-8.355\" y=\"-8.876\"><feFlood flood-opacity=\"0\" result=\"BackgroundImageFix\"></feFlood><feBlend in=\"SourceGraphic\" in2=\"BackgroundImageFix\" result=\"shape\"></feBlend><feGaussianBlur result=\"effect1_foregroundBlur_977_115\" stdDeviation=\"3.303\"></feGaussianBlur></filter></defs>"
	},
	"azure": {
		file: "azure-color.svg",
		body: "<path d=\"M7.242 1.613A1.11 1.11 0 018.295.857h6.977L8.03 22.316a1.11 1.11 0 01-1.052.755h-5.43a1.11 1.11 0 01-1.053-1.466L7.242 1.613z\" fill=\"url(#__ID__-0)\"></path><path d=\"M18.397 15.296H7.4a.51.51 0 00-.347.882l7.066 6.595c.206.192.477.298.758.298h6.226l-2.706-7.775z\" fill=\"#0078D4\"></path><path d=\"M15.272.857H7.497L0 23.071h7.775l1.596-4.73 5.068 4.73h6.665l-2.707-7.775h-7.998L15.272.857z\" fill=\"url(#__ID__-1)\"></path><path d=\"M17.193 1.613a1.11 1.11 0 00-1.052-.756h-7.81.035c.477 0 .9.304 1.052.756l6.748 19.992a1.11 1.11 0 01-1.052 1.466h-.12 7.895a1.11 1.11 0 001.052-1.466L17.193 1.613z\" fill=\"url(#__ID__-2)\"></path><defs><linearGradient gradientUnits=\"userSpaceOnUse\" id=\"__ID__-0\" x1=\"8.247\" x2=\"1.002\" y1=\"1.626\" y2=\"23.03\"><stop stop-color=\"#114A8B\"></stop><stop offset=\"1\" stop-color=\"#0669BC\"></stop></linearGradient><linearGradient gradientUnits=\"userSpaceOnUse\" id=\"__ID__-1\" x1=\"14.042\" x2=\"12.324\" y1=\"15.302\" y2=\"15.888\"><stop stop-opacity=\".3\"></stop><stop offset=\".071\" stop-opacity=\".2\"></stop><stop offset=\".321\" stop-opacity=\".1\"></stop><stop offset=\".623\" stop-opacity=\".05\"></stop><stop offset=\"1\" stop-opacity=\"0\"></stop></linearGradient><linearGradient gradientUnits=\"userSpaceOnUse\" id=\"__ID__-2\" x1=\"12.841\" x2=\"20.793\" y1=\"1.626\" y2=\"22.814\"><stop stop-color=\"#3CCBF4\"></stop><stop offset=\"1\" stop-color=\"#2892DF\"></stop></linearGradient></defs>"
	},
	"baseten": {
		file: "baseten.svg",
		fill: "currentColor",
		rule: "evenodd",
		body: "<path d=\"M2.316 4.8h14.682v4.8H7.31a.302.302 0 00-.308.3v4.2c0 .171.14.3.308.3h9.688v4.8h-4.686a.302.302 0 00-.308.3v4.2c0 .171.141.3.308.3h4.378a.297.297 0 00.308-.3v-4.5h4.694a.302.302 0 00.308-.3v-4.2c0-.171-.14-.3-.308-.3h-4.694V9.6h4.694A.302.302 0 0022 9.3V5.1c0-.171-.14-.3-.308-.3h-4.694V.3c0-.171-.14-.3-.308-.3H2.316A.31.31 0 002 .3v4.2c0 .171.14.3.316.3z\"></path>"
	},
	"bedrock": {
		file: "bedrock-color.svg",
		body: "<defs><linearGradient id=\"__ID__-0\" x1=\"80%\" x2=\"20%\" y1=\"20%\" y2=\"80%\"><stop offset=\"0%\" stop-color=\"#6350FB\"></stop><stop offset=\"50%\" stop-color=\"#3D8FFF\"></stop><stop offset=\"100%\" stop-color=\"#9AD8F8\"></stop></linearGradient></defs><path d=\"M13.05 15.513h3.08c.214 0 .389.177.389.394v1.82a1.704 1.704 0 011.296 1.661c0 .943-.755 1.708-1.685 1.708-.931 0-1.686-.765-1.686-1.708 0-.807.554-1.484 1.297-1.662v-1.425h-2.69v4.663a.395.395 0 01-.188.338l-2.69 1.641a.385.385 0 01-.405-.002l-4.926-3.086a.395.395 0 01-.185-.336V16.3L2.196 14.87A.395.395 0 012 14.555L2 14.528V9.406c0-.14.073-.27.192-.34l2.465-1.462V4.448c0-.129.062-.249.165-.322l.021-.014L9.77 1.058a.385.385 0 01.407 0l2.69 1.675a.395.395 0 01.185.336V7.6h3.856V5.683a1.704 1.704 0 01-1.296-1.662c0-.943.755-1.708 1.685-1.708.931 0 1.685.765 1.685 1.708 0 .807-.553 1.484-1.296 1.662v2.311a.391.391 0 01-.389.394h-4.245v1.806h6.624a1.69 1.69 0 011.64-1.313c.93 0 1.685.764 1.685 1.707 0 .943-.754 1.708-1.685 1.708a1.69 1.69 0 01-1.64-1.314H13.05v1.937h4.953l.915 1.18a1.66 1.66 0 01.84-.227c.931 0 1.685.764 1.685 1.707 0 .943-.754 1.708-1.685 1.708-.93 0-1.685-.765-1.685-1.708 0-.346.102-.668.276-.937l-.724-.935H13.05v1.806zM9.973 1.856L7.93 3.122V6.09h-.778V3.604L5.435 4.669v2.945l2.11 1.36L9.712 7.61V5.334h.778V7.83c0 .136-.07.263-.184.335L7.963 9.638v2.081l1.422 1.009-.446.646-1.406-.998-1.53 1.005-.423-.66 1.605-1.055v-1.99L5.038 8.29l-2.26 1.34v1.676l1.972-1.189.398.677-2.37 1.429V14.3l2.166 1.258 2.27-1.368.397.677-2.176 1.311V19.3l1.876 1.175 2.365-1.426.398.678-2.017 1.216 1.918 1.201 2.298-1.403v-5.78l-4.758 2.893-.4-.675 5.158-3.136V3.289L9.972 1.856zM16.13 18.47a.913.913 0 00-.908.92c0 .507.406.918.908.918a.913.913 0 00.907-.919.913.913 0 00-.907-.92zm3.63-3.81a.913.913 0 00-.908.92c0 .508.406.92.907.92a.913.913 0 00.908-.92.913.913 0 00-.908-.92zm1.555-4.99a.913.913 0 00-.908.92c0 .507.407.918.908.918a.913.913 0 00.907-.919.913.913 0 00-.907-.92zM17.296 3.1a.913.913 0 00-.907.92c0 .508.406.92.907.92a.913.913 0 00.908-.92.913.913 0 00-.908-.92z\" fill=\"url(#__ID__-0)\" fill-rule=\"nonzero\"></path>"
	},
	"cerebras": {
		file: "cerebras-color.svg",
		fill: "currentColor",
		body: "<path clip-rule=\"evenodd\" d=\"M14.121 2.701a9.299 9.299 0 000 18.598V22.7c-5.91 0-10.7-4.791-10.7-10.701S8.21 1.299 14.12 1.299V2.7zm4.752 3.677A7.353 7.353 0 109.42 17.643l-.901 1.074a8.754 8.754 0 01-1.08-12.334 8.755 8.755 0 0112.335-1.08l-.901 1.075zm-2.255.844a5.407 5.407 0 00-5.048 9.563l-.656 1.24a6.81 6.81 0 016.358-12.043l-.654 1.24zM14.12 8.539a3.46 3.46 0 100 6.922v1.402a4.863 4.863 0 010-9.726v1.402z\" fill=\"#F15A29\" fill-rule=\"evenodd\"></path><path d=\"M15.407 10.836a2.24 2.24 0 00-.51-.409 1.084 1.084 0 00-.544-.152c-.255 0-.483.047-.684.14a1.58 1.58 0 00-.84.912c-.074.203-.11.416-.11.631 0 .218.036.43.11.631a1.594 1.594 0 00.84.913c.2.093.43.14.684.14.216 0 .417-.046.602-.135.188-.09.35-.225.475-.392l.928 1.006c-.14.14-.3.261-.482.363a3.367 3.367 0 01-1.083.38c-.17.026-.317.04-.44.04a3.315 3.315 0 01-1.182-.21 2.825 2.825 0 01-.961-.597 2.816 2.816 0 01-.644-.929 2.987 2.987 0 01-.238-1.21c0-.444.08-.847.238-1.21.15-.35.368-.666.643-.929.278-.261.605-.464.962-.596a3.315 3.315 0 011.182-.21c.355 0 .712.068 1.072.204.361.138.685.36.944.649l-.962.97z\"></path>"
	},
	"claude": {
		file: "claude-color.svg",
		body: "<path d=\"M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z\" fill=\"#D97757\" fill-rule=\"nonzero\"></path>"
	},
	"cloudflare": {
		file: "cloudflare-color.svg",
		body: "<path d=\"M16.493 17.4c.135-.52.08-.983-.161-1.338-.215-.328-.592-.519-1.05-.519l-8.663-.109a.148.148 0 01-.135-.082c-.027-.054-.027-.109-.027-.163.027-.082.108-.164.189-.164l8.744-.11c1.05-.054 2.153-.9 2.556-1.937l.511-1.31c.027-.055.027-.11.027-.164C17.92 8.91 15.66 7 12.942 7c-2.503 0-4.628 1.638-5.381 3.903a2.432 2.432 0 00-1.803-.491c-1.21.109-2.153 1.092-2.287 2.32-.027.328 0 .628.054.9C1.56 13.688 0 15.326 0 17.319c0 .19.027.355.027.545 0 .082.08.137.161.137h15.983c.08 0 .188-.055.215-.164l.107-.437\" fill=\"#F38020\"></path><path d=\"M19.238 11.75h-.242c-.054 0-.108.054-.135.109l-.35 1.2c-.134.52-.08.983.162 1.338.215.328.592.518 1.05.518l1.855.11c.054 0 .108.027.135.082.027.054.027.109.027.163-.027.082-.108.164-.188.164l-1.91.11c-1.05.054-2.153.9-2.557 1.937l-.134.355c-.027.055.026.137.107.137h6.592c.081 0 .162-.055.162-.137.107-.41.188-.846.188-1.31-.027-2.62-2.153-4.777-4.762-4.777\" fill=\"#FCAD32\"></path>"
	},
	"deepseek": {
		file: "deepseek-color.svg",
		body: "<path d=\"M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 011.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 01.415-.287.302.302 0 01.2.288.306.306 0 01-.31.307.303.303 0 01-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 01-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 01.016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 01-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z\" fill=\"#4D6BFE\"></path>"
	},
	"doubao": {
		file: "doubao-color.svg",
		body: "<path d=\"M5.31 15.756c.172-3.75 1.883-5.999 2.549-6.739-3.26 2.058-5.425 5.658-6.358 8.308v1.12C1.501 21.513 4.226 24 7.59 24a6.59 6.59 0 002.2-.375c.353-.12.7-.248 1.039-.378.913-.899 1.65-1.91 2.243-2.992-4.877 2.431-7.974.072-7.763-4.5l.002.001z\" fill=\"#1E37FC\"></path><path d=\"M22.57 10.283c-1.212-.901-4.109-2.404-7.397-2.8.295 3.792.093 8.766-2.1 12.773a12.782 12.782 0 01-2.244 2.992c3.764-1.448 6.746-3.457 8.596-5.219 2.82-2.683 3.353-5.178 3.361-6.66a2.737 2.737 0 00-.216-1.084v-.002z\" fill=\"#37E1BE\"></path><path d=\"M14.303 1.867C12.955.7 11.248 0 9.39 0 7.532 0 5.883.677 4.545 1.807 2.791 3.29 1.627 5.557 1.5 8.125v9.201c.932-2.65 3.097-6.25 6.357-8.307.5-.318 1.025-.595 1.569-.829 1.883-.801 3.878-.932 5.746-.706-.222-2.83-.718-5.002-.87-5.617h.001z\" fill=\"#A569FF\"></path><path d=\"M17.305 4.961a199.47 199.47 0 01-1.08-1.094c-.202-.213-.398-.419-.586-.622l-1.333-1.378c.151.615.648 2.786.869 5.617 3.288.395 6.185 1.898 7.396 2.8-1.306-1.275-3.475-3.487-5.266-5.323z\" fill=\"#1E37FC\"></path>"
	},
	"fireworks": {
		file: "fireworks-color.svg",
		body: "<path clip-rule=\"evenodd\" d=\"M14.8 5l-2.801 6.795L9.195 5H7.397l3.072 7.428a1.64 1.64 0 003.038.002L16.598 5H14.8zm1.196 10.352l5.124-5.244-.699-1.669-5.596 5.739a1.664 1.664 0 00-.343 1.807 1.642 1.642 0 001.516 1.012L16 17l8-.02-.699-1.669-7.303.041h-.002zM2.88 10.104l.699-1.669 5.596 5.739c.468.479.603 1.189.343 1.807a1.643 1.643 0 01-1.516 1.012l-8-.018-.002.002.699-1.669 7.303.042-5.122-5.246z\" fill=\"#5019C5\" fill-rule=\"evenodd\"></path>"
	},
	"gemini": {
		file: "gemini-color.svg",
		body: "<path d=\"M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z\" fill=\"#3186FF\"></path><path d=\"M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z\" fill=\"url(#__ID__-0)\"></path><path d=\"M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z\" fill=\"url(#__ID__-1)\"></path><path d=\"M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z\" fill=\"url(#__ID__-2)\"></path><defs><linearGradient gradientUnits=\"userSpaceOnUse\" id=\"__ID__-0\" x1=\"7\" x2=\"11\" y1=\"15.5\" y2=\"12\"><stop stop-color=\"#08B962\"></stop><stop offset=\"1\" stop-color=\"#08B962\" stop-opacity=\"0\"></stop></linearGradient><linearGradient gradientUnits=\"userSpaceOnUse\" id=\"__ID__-1\" x1=\"8\" x2=\"11.5\" y1=\"5.5\" y2=\"11\"><stop stop-color=\"#F94543\"></stop><stop offset=\"1\" stop-color=\"#F94543\" stop-opacity=\"0\"></stop></linearGradient><linearGradient gradientUnits=\"userSpaceOnUse\" id=\"__ID__-2\" x1=\"3.5\" x2=\"17.5\" y1=\"13.5\" y2=\"12\"><stop stop-color=\"#FABC12\"></stop><stop offset=\".46\" stop-color=\"#FABC12\" stop-opacity=\"0\"></stop></linearGradient></defs>"
	},
	"githubcopilot": {
		file: "githubcopilot.svg",
		fill: "currentColor",
		rule: "evenodd",
		body: "<path d=\"M19.245 5.364c1.322 1.36 1.877 3.216 2.11 5.817.622 0 1.2.135 1.592.654l.73.964c.21.278.323.61.323.955v2.62c0 .339-.173.669-.453.868C20.239 19.602 16.157 21.5 12 21.5c-4.6 0-9.205-2.583-11.547-4.258-.28-.2-.452-.53-.453-.868v-2.62c0-.345.113-.679.321-.956l.73-.963c.392-.517.974-.654 1.593-.654l.029-.297c.25-2.446.81-4.213 2.082-5.52 2.461-2.54 5.71-2.851 7.146-2.864h.198c1.436.013 4.685.323 7.146 2.864zm-7.244 4.328c-.284 0-.613.016-.962.05-.123.447-.305.85-.57 1.108-1.05 1.023-2.316 1.18-2.994 1.18-.638 0-1.306-.13-1.851-.464-.516.165-1.012.403-1.044.996a65.882 65.882 0 00-.063 2.884l-.002.48c-.002.563-.005 1.126-.013 1.69.002.326.204.63.51.765 2.482 1.102 4.83 1.657 6.99 1.657 2.156 0 4.504-.555 6.985-1.657a.854.854 0 00.51-.766c.03-1.682.006-3.372-.076-5.053-.031-.596-.528-.83-1.046-.996-.546.333-1.212.464-1.85.464-.677 0-1.942-.157-2.993-1.18-.266-.258-.447-.661-.57-1.108-.32-.032-.64-.049-.96-.05zm-2.525 4.013c.539 0 .976.426.976.95v1.753c0 .525-.437.95-.976.95a.964.964 0 01-.976-.95v-1.752c0-.525.437-.951.976-.951zm5 0c.539 0 .976.426.976.95v1.753c0 .525-.437.95-.976.95a.964.964 0 01-.976-.95v-1.752c0-.525.437-.951.976-.951zM7.635 5.087c-1.05.102-1.935.438-2.385.906-.975 1.037-.765 3.668-.21 4.224.405.394 1.17.657 1.995.657h.09c.649-.013 1.785-.176 2.73-1.11.435-.41.705-1.433.675-2.47-.03-.834-.27-1.52-.63-1.813-.39-.336-1.275-.482-2.265-.394zm6.465.394c-.36.292-.6.98-.63 1.813-.03 1.037.24 2.06.675 2.47.968.957 2.136 1.104 2.776 1.11h.044c.825 0 1.59-.263 1.995-.657.555-.556.765-3.187-.21-4.224-.45-.468-1.335-.804-2.385-.906-.99-.088-1.875.058-2.265.394zM12 7.615c-.24 0-.525.015-.84.044.03.16.045.336.06.526l-.001.159a2.94 2.94 0 01-.014.25c.225-.022.425-.027.612-.028h.366c.187 0 .387.006.612.028-.015-.146-.015-.277-.015-.409.015-.19.03-.365.06-.526a9.29 9.29 0 00-.84-.044z\"></path>"
	},
	"google": {
		file: "google-color.svg",
		body: "<path d=\"M23 12.245c0-.905-.075-1.565-.236-2.25h-10.54v4.083h6.186c-.124 1.014-.797 2.542-2.294 3.569l-.021.136 3.332 2.53.23.022C21.779 18.417 23 15.593 23 12.245z\" fill=\"#4285F4\"></path><path d=\"M12.225 23c3.03 0 5.574-.978 7.433-2.665l-3.542-2.688c-.948.648-2.22 1.1-3.891 1.1a6.745 6.745 0 01-6.386-4.572l-.132.011-3.465 2.628-.045.124C4.043 20.531 7.835 23 12.225 23z\" fill=\"#34A853\"></path><path d=\"M5.84 14.175A6.65 6.65 0 015.463 12c0-.758.138-1.491.361-2.175l-.006-.147-3.508-2.67-.115.054A10.831 10.831 0 001 12c0 1.772.436 3.447 1.197 4.938l3.642-2.763z\" fill=\"#FBBC05\"></path><path d=\"M12.225 5.253c2.108 0 3.529.892 4.34 1.638l3.167-3.031C17.787 2.088 15.255 1 12.225 1 7.834 1 4.043 3.469 2.197 7.062l3.63 2.763a6.77 6.77 0 016.398-4.572z\" fill=\"#EB4335\"></path>"
	},
	"groq": {
		file: "groq.svg",
		fill: "currentColor",
		rule: "evenodd",
		body: "<path d=\"M12.036 2c-3.853-.035-7 3-7.036 6.781-.035 3.782 3.055 6.872 6.908 6.907h2.42v-2.566h-2.292c-2.407.028-4.38-1.866-4.408-4.23-.029-2.362 1.901-4.298 4.308-4.326h.1c2.407 0 4.358 1.915 4.365 4.278v6.305c0 2.342-1.944 4.25-4.323 4.279a4.375 4.375 0 01-3.033-1.252l-1.851 1.818A7 7 0 0012.029 22h.092c3.803-.056 6.858-3.083 6.879-6.816v-6.5C18.907 4.963 15.817 2 12.036 2z\"></path>"
	},
	"huggingface": {
		file: "huggingface-color.svg",
		body: "<path d=\"M2.25 11.535c0-3.407 1.847-6.554 4.844-8.258a9.822 9.822 0 019.687 0c2.997 1.704 4.844 4.851 4.844 8.258 0 5.266-4.337 9.535-9.687 9.535S2.25 16.8 2.25 11.535z\" fill=\"#FF9D0B\"></path><path d=\"M11.938 20.086c4.797 0 8.687-3.829 8.687-8.551 0-4.722-3.89-8.55-8.687-8.55-4.798 0-8.688 3.828-8.688 8.55 0 4.722 3.89 8.55 8.688 8.55z\" fill=\"#FFD21E\"></path><path d=\"M11.875 15.113c2.457 0 3.25-2.156 3.25-3.263 0-.576-.393-.394-1.023-.089-.582.283-1.365.675-2.224.675-1.798 0-3.25-1.693-3.25-.586 0 1.107.79 3.263 3.25 3.263h-.003z\" fill=\"#FF323D\"></path><path d=\"M14.76 9.21c.32.108.445.753.767.585.447-.233.707-.708.659-1.204a1.235 1.235 0 00-.879-1.059 1.262 1.262 0 00-1.33.394c-.322.384-.377.92-.14 1.36.153.283.638-.177.925-.079l-.002.003zm-5.887 0c-.32.108-.448.753-.768.585a1.226 1.226 0 01-.658-1.204c.048-.495.395-.913.878-1.059a1.262 1.262 0 011.33.394c.322.384.377.92.14 1.36-.152.283-.64-.177-.925-.079l.003.003zm1.12 5.34a2.166 2.166 0 011.325-1.106c.07-.02.144.06.219.171l.192.306c.069.1.139.175.209.175.074 0 .15-.074.223-.172l.205-.302c.08-.11.157-.188.234-.165.537.168.986.536 1.25 1.026.932-.724 1.275-1.905 1.275-2.633 0-.508-.306-.426-.81-.19l-.616.296c-.52.24-1.148.48-1.824.48-.676 0-1.302-.24-1.823-.48l-.589-.283c-.52-.248-.838-.342-.838.177 0 .703.32 1.831 1.187 2.56l.18.14z\" fill=\"#3A3B45\"></path><path d=\"M17.812 10.366a.806.806 0 00.813-.8c0-.441-.364-.8-.813-.8a.806.806 0 00-.812.8c0 .442.364.8.812.8zm-11.624 0a.806.806 0 00.812-.8c0-.441-.364-.8-.812-.8a.806.806 0 00-.813.8c0 .442.364.8.813.8zM4.515 13.073c-.405 0-.765.162-1.017.46a1.455 1.455 0 00-.333.925 1.801 1.801 0 00-.485-.074c-.387 0-.737.146-.985.409a1.41 1.41 0 00-.2 1.722 1.302 1.302 0 00-.447.694c-.06.222-.12.69.2 1.166a1.267 1.267 0 00-.093 1.236c.238.533.81.958 1.89 1.405l.24.096c.768.3 1.473.492 1.478.494.89.243 1.808.375 2.732.394 1.465 0 2.513-.443 3.115-1.314.93-1.342.842-2.575-.274-3.763l-.151-.154c-.692-.684-1.155-1.69-1.25-1.912-.195-.655-.71-1.383-1.562-1.383-.46.007-.889.233-1.15.605-.25-.31-.495-.553-.715-.694a1.87 1.87 0 00-.993-.312zm14.97 0c.405 0 .767.162 1.017.46.216.262.333.588.333.925.158-.047.322-.071.487-.074.388 0 .738.146.985.409a1.41 1.41 0 01.2 1.722c.22.178.377.422.445.694.06.222.12.69-.2 1.166.244.37.279.836.093 1.236-.238.533-.81.958-1.889 1.405l-.239.096c-.77.3-1.475.492-1.48.494-.89.243-1.808.375-2.732.394-1.465 0-2.513-.443-3.115-1.314-.93-1.342-.842-2.575.274-3.763l.151-.154c.695-.684 1.157-1.69 1.252-1.912.195-.655.708-1.383 1.56-1.383.46.007.889.233 1.15.605.25-.31.495-.553.718-.694.244-.162.523-.265.814-.3l.176-.012z\" fill=\"#FF9D0B\"></path><path d=\"M9.785 20.132c.688-.994.638-1.74-.305-2.667-.945-.928-1.495-2.288-1.495-2.288s-.205-.788-.672-.714c-.468.074-.81 1.25.17 1.971.977.721-.195 1.21-.573.534-.375-.677-1.405-2.416-1.94-2.751-.532-.332-.907-.148-.782.541.125.687 2.357 2.35 2.14 2.707-.218.362-.983-.42-.983-.42S2.953 14.9 2.43 15.46c-.52.558.398 1.026 1.7 1.803 1.308.778 1.41.985 1.225 1.28-.187.295-3.07-2.1-3.34-1.083-.27 1.011 2.943 1.304 2.745 2.006-.2.7-2.265-1.324-2.685-.537-.425.79 2.913 1.718 2.94 1.725 1.075.276 3.813.859 4.77-.522zm4.432 0c-.687-.994-.64-1.74.305-2.667.943-.928 1.493-2.288 1.493-2.288s.205-.788.675-.714c.465.074.807 1.25-.17 1.971-.98.721.195 1.21.57.534.377-.677 1.407-2.416 1.94-2.751.532-.332.91-.148.782.541-.125.687-2.355 2.35-2.137 2.707.215.362.98-.42.98-.42S21.05 14.9 21.57 15.46c.52.558-.395 1.026-1.7 1.803-1.308.778-1.408.985-1.225 1.28.187.295 3.07-2.1 3.34-1.083.27 1.011-2.94 1.304-2.743 2.006.2.7 2.263-1.324 2.685-.537.423.79-2.912 1.718-2.94 1.725-1.077.276-3.815.859-4.77-.522z\" fill=\"#FFD21E\"></path>"
	},
	"kimi": {
		file: "kimi-color.svg",
		body: "<path d=\"M21.846 0a1.923 1.923 0 110 3.846H20.15a.226.226 0 01-.227-.226V1.923C19.923.861 20.784 0 21.846 0z\" fill=\"#1783FF\"></path><path d=\"M11.065 11.199l7.257-7.2c.137-.136.06-.41-.116-.41H14.3a.164.164 0 00-.117.051l-7.82 7.756c-.122.12-.302.013-.302-.179V3.82c0-.127-.083-.23-.185-.23H3.186c-.103 0-.186.103-.186.23V19.77c0 .128.083.23.186.23h2.69c.103 0 .186-.102.186-.23v-3.25c0-.069.025-.135.069-.178l2.424-2.406a.158.158 0 01.205-.023l6.484 4.772a7.677 7.677 0 003.453 1.283c.108.012.2-.095.2-.23v-3.06c0-.117-.07-.212-.164-.227a5.028 5.028 0 01-2.027-.807l-5.613-4.064c-.117-.078-.132-.279-.028-.381z\" fill=\"currentColor\"></path>"
	},
	"ling": {
		file: "ling-color.svg",
		fill: "#144DFF",
		rule: "evenodd",
		body: "<path d=\"M9.561 0.074a0.46 0.46 0 0 1 0.517 0.011l2.848 1.357a0.222 0.222 0 0 1-0.033 0.374C9.008 3.93 6.663 5.994 5.43 7.997c-0.798 1.296-2.264 4.83-0.937 8.02 1.375 3.301 4.49 4.493 6.797 4.493 1.743 0 2.927-0.522 4.13-1.334 3.262-2.204 3.638-6.503 1.21-9.46a10 10 0 0 1 2.2 2.902 6.5 6.5 0 0 0-0.72-1.664c-0.72-1.176-1.688-2.163-3.056-2.849-3.045-1.526-9.397-0.79-10.397 5.78 0.1-4.557 3.127-7.416 5.868-8.3a9.7 9.7 0 0 1 4.654-0.314c2.029-1.639 4.272-2.376 5.075-2.601a0.53 0.53 0 0 1 0.522 0.137c0.23 0.23 0.63 0.632 1.142 1.135h0.003c0.152 0.15 0.073 0.41-0.138 0.45-1.974 0.38-3.322 0.755-4.746 1.412 1.727 0.698 3.206 1.92 4.108 3.606a0.367 0.367 0 0 1-0.199 0.52l-1.207 0.437c1.061 1.8 1.334 4.006 0.813 6.266-0.884 3.843-3.845 6.562-7.626 7.209a9.5 9.5 0 0 1-1.756 0.157 0.37 0.37 0 0 1-0.363-0.341 0.36 0.36 0 0 1-0.043-0.245l0.231-1.295c-1.055-0.074-2.045-0.248-3.036-0.648C2.077 19.094 1.46 13.297 2.304 9.785 3.4 5.23 6.766 1.78 9.561 0.074\"></path>"
	},
	"meta": {
		file: "meta-color.svg",
		body: "<path d=\"M6.897 4h-.024l-.031 2.615h.022c1.715 0 3.046 1.357 5.94 6.246l.175.297.012.02 1.62-2.438-.012-.019a48.763 48.763 0 00-1.098-1.716 28.01 28.01 0 00-1.175-1.629C10.413 4.932 8.812 4 6.896 4z\" fill=\"url(#__ID__-0)\"></path><path d=\"M6.873 4C4.95 4.01 3.247 5.258 2.02 7.17a4.352 4.352 0 00-.01.017l2.254 1.231.011-.017c.718-1.083 1.61-1.774 2.568-1.785h.021L6.896 4h-.023z\" fill=\"url(#__ID__-1)\"></path><path d=\"M2.019 7.17l-.011.017C1.2 8.447.598 9.995.274 11.664l-.005.022 2.534.6.004-.022c.27-1.467.786-2.828 1.456-3.845l.011-.017L2.02 7.17z\" fill=\"url(#__ID__-2)\"></path><path d=\"M2.807 12.264l-2.533-.6-.005.022c-.177.918-.267 1.851-.269 2.786v.023l2.598.233v-.023a12.591 12.591 0 01.21-2.44z\" fill=\"url(#__ID__-3)\"></path><path d=\"M2.677 15.537a5.462 5.462 0 01-.079-.813v-.022L0 14.468v.024a8.89 8.89 0 00.146 1.652l2.535-.585a4.106 4.106 0 01-.004-.022z\" fill=\"url(#__ID__-4)\"></path><path d=\"M3.27 16.89c-.284-.31-.484-.756-.589-1.328l-.004-.021-2.535.585.004.021c.192 1.01.568 1.85 1.106 2.487l.014.017 2.018-1.745a2.106 2.106 0 01-.015-.016z\" fill=\"url(#__ID__-5)\"></path><path d=\"M10.78 9.654c-1.528 2.35-2.454 3.825-2.454 3.825-2.035 3.2-2.739 3.917-3.871 3.917a1.545 1.545 0 01-1.186-.508l-2.017 1.744.014.017C2.01 19.518 3.058 20 4.356 20c1.963 0 3.374-.928 5.884-5.33l1.766-3.13a41.283 41.283 0 00-1.227-1.886z\" fill=\"#0082FB\"></path><path d=\"M13.502 5.946l-.016.016c-.4.43-.786.908-1.16 1.416.378.483.768 1.024 1.175 1.63.48-.743.928-1.345 1.367-1.807l.016-.016-1.382-1.24z\" fill=\"url(#__ID__-6)\"></path><path d=\"M20.918 5.713C19.853 4.633 18.583 4 17.225 4c-1.432 0-2.637.787-3.723 1.944l-.016.016 1.382 1.24.016-.017c.715-.747 1.408-1.12 2.176-1.12.826 0 1.6.39 2.27 1.075l.015.016 1.589-1.425-.016-.016z\" fill=\"#0082FB\"></path><path d=\"M23.998 14.125c-.06-3.467-1.27-6.566-3.064-8.396l-.016-.016-1.588 1.424.015.016c1.35 1.392 2.277 3.98 2.361 6.971v.023h2.292v-.022z\" fill=\"url(#__ID__-7)\"></path><path d=\"M23.998 14.15v-.023h-2.292v.022c.004.14.006.282.006.424 0 .815-.121 1.474-.368 1.95l-.011.022 1.708 1.782.013-.02c.62-.96.946-2.293.946-3.91 0-.083 0-.165-.002-.247z\" fill=\"url(#__ID__-8)\"></path><path d=\"M21.344 16.52l-.011.02c-.214.402-.519.67-.917.787l.778 2.462a3.493 3.493 0 00.438-.182 3.558 3.558 0 001.366-1.218l.044-.065.012-.02-1.71-1.784z\" fill=\"url(#__ID__-9)\"></path><path d=\"M19.92 17.393c-.262 0-.492-.039-.718-.14l-.798 2.522c.449.153.927.222 1.46.222.492 0 .943-.073 1.352-.215l-.78-2.462c-.167.05-.341.075-.517.073z\" fill=\"url(#__ID__-10)\"></path><path d=\"M18.323 16.534l-.014-.017-1.836 1.914.016.017c.637.682 1.246 1.105 1.937 1.337l.797-2.52c-.291-.125-.573-.353-.9-.731z\" fill=\"url(#__ID__-11)\"></path><path d=\"M18.309 16.515c-.55-.642-1.232-1.712-2.303-3.44l-1.396-2.336-.011-.02-1.62 2.438.012.02.989 1.668c.959 1.61 1.74 2.774 2.493 3.585l.016.016 1.834-1.914a2.353 2.353 0 01-.014-.017z\" fill=\"url(#__ID__-12)\"></path><defs><linearGradient id=\"__ID__-0\" x1=\"75.897%\" x2=\"26.312%\" y1=\"89.199%\" y2=\"12.194%\"><stop offset=\".06%\" stop-color=\"#0867DF\"></stop><stop offset=\"45.39%\" stop-color=\"#0668E1\"></stop><stop offset=\"85.91%\" stop-color=\"#0064E0\"></stop></linearGradient><linearGradient id=\"__ID__-1\" x1=\"21.67%\" x2=\"97.068%\" y1=\"75.874%\" y2=\"23.985%\"><stop offset=\"13.23%\" stop-color=\"#0064DF\"></stop><stop offset=\"99.88%\" stop-color=\"#0064E0\"></stop></linearGradient><linearGradient id=\"__ID__-2\" x1=\"38.263%\" x2=\"60.895%\" y1=\"89.127%\" y2=\"16.131%\"><stop offset=\"1.47%\" stop-color=\"#0072EC\"></stop><stop offset=\"68.81%\" stop-color=\"#0064DF\"></stop></linearGradient><linearGradient id=\"__ID__-3\" x1=\"47.032%\" x2=\"52.15%\" y1=\"90.19%\" y2=\"15.745%\"><stop offset=\"7.31%\" stop-color=\"#007CF6\"></stop><stop offset=\"99.43%\" stop-color=\"#0072EC\"></stop></linearGradient><linearGradient id=\"__ID__-4\" x1=\"52.155%\" x2=\"47.591%\" y1=\"58.301%\" y2=\"37.004%\"><stop offset=\"7.31%\" stop-color=\"#007FF9\"></stop><stop offset=\"100%\" stop-color=\"#007CF6\"></stop></linearGradient><linearGradient id=\"__ID__-5\" x1=\"37.689%\" x2=\"61.961%\" y1=\"12.502%\" y2=\"63.624%\"><stop offset=\"7.31%\" stop-color=\"#007FF9\"></stop><stop offset=\"100%\" stop-color=\"#0082FB\"></stop></linearGradient><linearGradient id=\"__ID__-6\" x1=\"34.808%\" x2=\"62.313%\" y1=\"68.859%\" y2=\"23.174%\"><stop offset=\"27.99%\" stop-color=\"#007FF8\"></stop><stop offset=\"91.41%\" stop-color=\"#0082FB\"></stop></linearGradient><linearGradient id=\"__ID__-7\" x1=\"43.762%\" x2=\"57.602%\" y1=\"6.235%\" y2=\"98.514%\"><stop offset=\"0%\" stop-color=\"#0082FB\"></stop><stop offset=\"99.95%\" stop-color=\"#0081FA\"></stop></linearGradient><linearGradient id=\"__ID__-8\" x1=\"60.055%\" x2=\"39.88%\" y1=\"4.661%\" y2=\"69.077%\"><stop offset=\"6.19%\" stop-color=\"#0081FA\"></stop><stop offset=\"100%\" stop-color=\"#0080F9\"></stop></linearGradient><linearGradient id=\"__ID__-9\" x1=\"30.282%\" x2=\"61.081%\" y1=\"59.32%\" y2=\"33.244%\"><stop offset=\"0%\" stop-color=\"#027AF3\"></stop><stop offset=\"100%\" stop-color=\"#0080F9\"></stop></linearGradient><linearGradient id=\"__ID__-10\" x1=\"20.433%\" x2=\"82.112%\" y1=\"50.001%\" y2=\"50.001%\"><stop offset=\"0%\" stop-color=\"#0377EF\"></stop><stop offset=\"99.94%\" stop-color=\"#0279F1\"></stop></linearGradient><linearGradient id=\"__ID__-11\" x1=\"40.303%\" x2=\"72.394%\" y1=\"35.298%\" y2=\"57.811%\"><stop offset=\".19%\" stop-color=\"#0471E9\"></stop><stop offset=\"100%\" stop-color=\"#0377EF\"></stop></linearGradient><linearGradient id=\"__ID__-12\" x1=\"32.254%\" x2=\"68.003%\" y1=\"19.719%\" y2=\"84.908%\"><stop offset=\"27.65%\" stop-color=\"#0867DF\"></stop><stop offset=\"100%\" stop-color=\"#0471E9\"></stop></linearGradient></defs>"
	},
	"minimax": {
		file: "minimax-color.svg",
		body: "<defs><linearGradient id=\"__ID__-0\" x1=\"0%\" x2=\"100.182%\" y1=\"50.057%\" y2=\"50.057%\"><stop offset=\"0%\" stop-color=\"#E2167E\"></stop><stop offset=\"100%\" stop-color=\"#FE603C\"></stop></linearGradient></defs><path d=\"M16.278 2c1.156 0 2.093.927 2.093 2.07v12.501a.74.74 0 00.744.709.74.74 0 00.743-.709V9.099a2.06 2.06 0 012.071-2.049A2.06 2.06 0 0124 9.1v6.561a.649.649 0 01-.652.645.649.649 0 01-.653-.645V9.1a.762.762 0 00-.766-.758.762.762 0 00-.766.758v7.472a2.037 2.037 0 01-2.048 2.026 2.037 2.037 0 01-2.048-2.026v-12.5a.785.785 0 00-.788-.753.785.785 0 00-.789.752l-.001 15.904A2.037 2.037 0 0113.441 22a2.037 2.037 0 01-2.048-2.026V18.04c0-.356.292-.645.652-.645.36 0 .652.289.652.645v1.934c0 .263.142.506.372.638.23.131.514.131.744 0a.734.734 0 00.372-.638V4.07c0-1.143.937-2.07 2.093-2.07zm-5.674 0c1.156 0 2.093.927 2.093 2.07v11.523a.648.648 0 01-.652.645.648.648 0 01-.652-.645V4.07a.785.785 0 00-.789-.78.785.785 0 00-.789.78v14.013a2.06 2.06 0 01-2.07 2.048 2.06 2.06 0 01-2.071-2.048V9.1a.762.762 0 00-.766-.758.762.762 0 00-.766.758v3.8a2.06 2.06 0 01-2.071 2.049A2.06 2.06 0 010 12.9v-1.378c0-.357.292-.646.652-.646.36 0 .653.29.653.646V12.9c0 .418.343.757.766.757s.766-.339.766-.757V9.099a2.06 2.06 0 012.07-2.048 2.06 2.06 0 012.071 2.048v8.984c0 .419.343.758.767.758.423 0 .766-.339.766-.758V4.07c0-1.143.937-2.07 2.093-2.07z\" fill=\"url(#__ID__-0)\" fill-rule=\"nonzero\"></path>"
	},
	"mistral": {
		file: "mistral-color.svg",
		body: "<path d=\"M3.428 3.4h3.429v3.428H3.428V3.4zm13.714 0h3.43v3.428h-3.43V3.4z\" fill=\"gold\"></path><path d=\"M3.428 6.828h6.857v3.429H3.429V6.828zm10.286 0h6.857v3.429h-6.857V6.828z\" fill=\"#FFAF00\"></path><path d=\"M3.428 10.258h17.144v3.428H3.428v-3.428z\" fill=\"#FF8205\"></path><path d=\"M3.428 13.686h3.429v3.428H3.428v-3.428zm6.858 0h3.429v3.428h-3.429v-3.428zm6.856 0h3.43v3.428h-3.43v-3.428z\" fill=\"#FA500F\"></path><path d=\"M0 17.114h10.286v3.429H0v-3.429zm13.714 0H24v3.429H13.714v-3.429z\" fill=\"#E10500\"></path>"
	},
	"moonshot": {
		file: "moonshot.svg",
		fill: "currentColor",
		rule: "evenodd",
		body: "<path d=\"M1.052 16.916l9.539 2.552a21.007 21.007 0 00.06 2.033l5.956 1.593a11.997 11.997 0 01-5.586.865l-.18-.016-.044-.004-.084-.009-.094-.01a11.605 11.605 0 01-.157-.02l-.107-.014-.11-.016a11.962 11.962 0 01-.32-.051l-.042-.008-.075-.013-.107-.02-.07-.015-.093-.019-.075-.016-.095-.02-.097-.023-.094-.022-.068-.017-.088-.022-.09-.024-.095-.025-.082-.023-.109-.03-.062-.02-.084-.025-.093-.028-.105-.034-.058-.019-.08-.026-.09-.031-.066-.024a6.293 6.293 0 01-.044-.015l-.068-.025-.101-.037-.057-.022-.08-.03-.087-.035-.088-.035-.079-.032-.095-.04-.063-.028-.063-.027a5.655 5.655 0 01-.041-.018l-.066-.03-.103-.047-.052-.024-.096-.046-.062-.03-.084-.04-.086-.044-.093-.047-.052-.027-.103-.055-.057-.03-.058-.032a6.49 6.49 0 01-.046-.026l-.094-.053-.06-.034-.051-.03-.072-.041-.082-.05-.093-.056-.052-.032-.084-.053-.061-.039-.079-.05-.07-.047-.053-.035a7.785 7.785 0 01-.054-.036l-.044-.03-.044-.03a6.066 6.066 0 01-.04-.028l-.057-.04-.076-.054-.069-.05-.074-.054-.056-.042-.076-.057-.076-.059-.086-.067-.045-.035-.064-.052-.074-.06-.089-.073-.046-.039-.046-.039a7.516 7.516 0 01-.043-.037l-.045-.04-.061-.053-.07-.062-.068-.06-.062-.058-.067-.062-.053-.05-.088-.084a13.28 13.28 0 01-.099-.097l-.029-.028-.041-.042-.069-.07-.05-.051-.05-.053a6.457 6.457 0 01-.168-.179l-.08-.088-.062-.07-.071-.08-.042-.049-.053-.062-.058-.068-.046-.056a7.175 7.175 0 01-.027-.033l-.045-.055-.066-.082-.041-.052-.05-.064-.02-.025a11.99 11.99 0 01-1.44-2.402zm-1.02-5.794l11.353 3.037a20.468 20.468 0 00-.469 2.011l10.817 2.894a12.076 12.076 0 01-1.845 2.005L.657 15.923l-.016-.046-.035-.104a11.965 11.965 0 01-.05-.153l-.007-.023a11.896 11.896 0 01-.207-.741l-.03-.126-.018-.08-.021-.097-.018-.081-.018-.09-.017-.084-.018-.094c-.026-.141-.05-.283-.071-.426l-.017-.118-.011-.083-.013-.102a12.01 12.01 0 01-.019-.161l-.005-.047a12.12 12.12 0 01-.034-2.145zm1.593-5.15l11.948 3.196c-.368.605-.705 1.231-1.01 1.875l11.295 3.022c-.142.82-.368 1.612-.668 2.365l-11.55-3.09L.124 10.26l.015-.1.008-.049.01-.067.015-.087.018-.098c.026-.148.056-.295.088-.442l.028-.124.02-.085.024-.097c.022-.09.045-.18.07-.268l.028-.102.023-.083.03-.1.025-.082.03-.096.026-.082.031-.095a11.896 11.896 0 011.01-2.232zm4.442-4.4L17.352 4.59a20.77 20.77 0 00-1.688 1.721l7.823 2.093c.267.852.442 1.744.513 2.665L2.106 5.213l.045-.065.027-.04.04-.055.046-.065.055-.076.054-.072.064-.086.05-.065.057-.073.055-.07.06-.074.055-.069.065-.077.054-.066.066-.077.053-.06.072-.082.053-.06.067-.074.054-.058.073-.078.058-.06.063-.067.168-.17.1-.098.059-.056.076-.071a12.084 12.084 0 012.272-1.677zM12.017 0h.097l.082.001.069.001.054.002.068.002.046.001.076.003.047.002.06.003.054.002.087.005.105.007.144.011.088.007.044.004.077.008.082.008.047.005.102.012.05.006.108.014.081.01.042.006.065.01.207.032.07.012.065.011.14.026.092.018.11.022.046.01.075.016.041.01L14.7.3l.042.01.065.015.049.012.071.017.096.024.112.03.113.03.113.032.05.015.07.02.078.024.073.023.05.016.05.016.076.025.099.033.102.036.048.017.064.023.093.034.11.041.116.045.1.04.047.02.06.024.041.018.063.026.04.018.057.025.11.048.1.046.074.035.075.036.06.028.092.046.091.045.102.052.053.028.049.026.046.024.06.033.041.022.052.029.088.05.106.06.087.051.057.034.053.032.096.059.088.055.098.062.036.024.064.041.084.056.04.027.062.042.062.043.023.017c.054.037.108.075.161.114l.083.06.065.048.056.043.086.065.082.064.04.03.05.041.086.069.079.065.085.071c.712.6 1.353 1.283 1.909 2.031L7.222.994l.062-.027.065-.028.081-.034.086-.035c.113-.045.227-.09.341-.131l.096-.035.093-.033.084-.03.096-.031c.087-.03.176-.058.264-.085l.091-.027.086-.025.102-.03.085-.023.1-.026L9.04.37l.09-.023.091-.022.095-.022.09-.02.098-.021.091-.02.095-.018.092-.018.1-.018.091-.016.098-.017.092-.014.097-.015.092-.013.102-.013.091-.012.105-.012.09-.01.105-.01c.093-.01.186-.018.28-.024l.106-.008.09-.005.11-.006.093-.004.1-.004.097-.002.099-.002.197-.002z\"></path>"
	},
	"nvidia": {
		file: "nvidia-color.svg",
		body: "<path d=\"M10.212 8.976V7.62c.127-.01.256-.017.388-.021 3.596-.117 5.957 3.184 5.957 3.184s-2.548 3.647-5.282 3.647a3.227 3.227 0 01-1.063-.175v-4.109c1.4.174 1.681.812 2.523 2.258l1.873-1.627a4.905 4.905 0 00-3.67-1.846 6.594 6.594 0 00-.729.044m0-4.476v2.025c.13-.01.259-.019.388-.024 5.002-.174 8.261 4.226 8.261 4.226s-3.743 4.69-7.643 4.69c-.338 0-.675-.031-1.007-.092v1.25c.278.038.558.057.838.057 3.629 0 6.253-1.91 8.794-4.169.421.347 2.146 1.193 2.501 1.564-2.416 2.083-8.048 3.763-11.24 3.763-.308 0-.603-.02-.894-.048V19.5H24v-15H10.21zm0 9.756v1.068c-3.356-.616-4.287-4.21-4.287-4.21a7.173 7.173 0 014.287-2.138v1.172h-.005a3.182 3.182 0 00-2.502 1.178s.615 2.276 2.507 2.931m-5.961-3.3c1.436-1.935 3.604-3.148 5.961-3.336V6.523C5.81 6.887 2 10.723 2 10.723s2.158 6.427 8.21 7.015v-1.166C5.77 16 4.25 10.958 4.25 10.958h-.002z\" fill=\"#74B71B\" fill-rule=\"nonzero\"></path>"
	},
	"openai": {
		file: "openai.svg",
		fill: "currentColor",
		rule: "evenodd",
		body: "<path d=\"M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z\"></path>"
	},
	"opencode": {
		file: "opencode.svg",
		fill: "currentColor",
		rule: "evenodd",
		body: "<path d=\"M16 6H8v12h8V6zm4 16H4V2h16v20z\"></path>"
	},
	"openrouter": {
		file: "openrouter-color.svg",
		body: "<path d=\"M18.654 3.87a5.087 5.087 0 110 10.174L23.7 19.09c.64.641.187 1.737-.72 1.737H8.48a8.479 8.479 0 010-16.958h10.175zM8.479 7.26a5.087 5.087 0 100 10.176 5.087 5.087 0 000-10.175z\" fill=\"#C8FF00\"></path>"
	},
	"qwen": {
		file: "qwen-color.svg",
		body: "<path d=\"M19.713 2.825h-5.907c0-.251-.066-.503-.196-.728L12.819.728A1.46 1.46 0 0 0 11.559 0h-1.58c-.52 0-1 .275-1.26.728l-2.42 4.19a1.45 1.45 0 0 0 0 1.453l.791 1.37c.26.448.74.727 1.26.727h11.36c.52 0 1-.275 1.26-.728l.79-1.37a1.45 1.45 0 0 0 0-1.451l-.79-1.37a1.46 1.46 0 0 0-1.26-.728zM.195 9.905l2.951 5.115a1.46 1.46 0 0 0-.531.531l-.791 1.37a1.45 1.45 0 0 0 0 1.452l.79 1.37c.26.448.74.727 1.26.727h4.84c.52 0 1-.275 1.26-.728l.79-1.37a1.45 1.45 0 0 0 0-1.451L5.086 7.083a1.46 1.46 0 0 0-1.26-.728h-1.58c-.52 0-1 .276-1.26.728l-.79 1.37a1.45 1.45 0 0 0 0 1.452m15.888 13.367 2.951-5.115c.217.125.469.196.728.196h1.582c.52 0 1-.275 1.26-.728l.79-1.37a1.45 1.45 0 0 0 0-1.451l-2.42-4.191a1.46 1.46 0 0 0-1.259-.728h-1.582c-.52 0-1 .276-1.259.728l-5.678 9.838a1.45 1.45 0 0 0 0 1.452l.79 1.37c.26.448.74.727 1.26.727h1.582c.52 0 1-.275 1.26-.728z\" fill=\"#082dff\"></path>"
	},
	"together": {
		file: "together-color.svg",
		body: "<path d=\"M23.197 4.503A6 6 0 0015 2.307a5.973 5.973 0 00-2.995 4.933l5.996.008v.515h-5.996c.039.937.298 1.87.8 2.74a6 6 0 1010.39-6z\" fill=\"#EF2CC1\"></path><path d=\"M.805 4.5A6 6 0 003 12.697a5.972 5.972 0 005.77.127L5.779 7.627l.446-.257 2.997 5.192A6 6 0 10.804 4.5z\" fill=\"#CAAEF5\"></path><path d=\"M12 23.894a6 6 0 005.999-6c0-2.13-1.1-3.996-2.775-5.06l-3.005 5.189-.444-.258 2.997-5.192A6 6 0 1012 23.894z\" fill=\"#FC4C02\"></path>"
	},
	"vercel": {
		file: "vercel.svg",
		fill: "currentColor",
		rule: "evenodd",
		body: "<path d=\"M12 0l12 20.785H0L12 0z\"></path>"
	},
	"vertexai": {
		file: "vertexai-color.svg",
		body: "<path d=\"M11.995 20.216a1.892 1.892 0 100 3.785 1.892 1.892 0 000-3.785zm0 2.806a.927.927 0 11.927-.914.914.914 0 01-.927.914z\" fill=\"#4285F4\"></path><path clip-rule=\"evenodd\" d=\"M21.687 14.144c.237.038.452.16.605.344a.978.978 0 01-.18 1.3l-8.24 6.082a1.892 1.892 0 00-1.147-1.508l8.28-6.08a.991.991 0 01.682-.138z\" fill=\"#669DF6\" fill-rule=\"evenodd\"></path><path clip-rule=\"evenodd\" d=\"M10.122 21.842l-8.217-6.066a.952.952 0 01-.206-1.287.978.978 0 011.287-.206l8.28 6.08a1.893 1.893 0 00-1.144 1.479z\" fill=\"#AECBFA\" fill-rule=\"evenodd\"></path><path d=\"M4.273 4.475a.978.978 0 01-.965-.965V1.09a.978.978 0 111.943 0v2.42a.978.978 0 01-.978.965zM4.247 13.034a.978.978 0 100-1.956.978.978 0 000 1.956zM4.247 10.19a.978.978 0 100-1.956.978.978 0 000 1.956zM4.247 7.332a.978.978 0 100-1.956.978.978 0 000 1.956z\" fill=\"#AECBFA\"></path><path d=\"M19.718 7.307a.978.978 0 01-.965-.979v-2.42a.965.965 0 011.93 0v2.42a.964.964 0 01-.965.979zM19.743 13.047a.978.978 0 100-1.956.978.978 0 000 1.956zM19.743 10.151a.978.978 0 100-1.956.978.978 0 000 1.956zM19.743 2.068a.978.978 0 100-1.956.978.978 0 000 1.956z\" fill=\"#4285F4\"></path><path d=\"M11.995 15.917a.978.978 0 01-.965-.965v-2.459a.978.978 0 011.943 0v2.433a.976.976 0 01-.978.991zM11.995 18.762a.978.978 0 100-1.956.978.978 0 000 1.956zM11.995 10.64a.978.978 0 100-1.956.978.978 0 000 1.956zM11.995 7.783a.978.978 0 100-1.956.978.978 0 000 1.956z\" fill=\"#669DF6\"></path><path d=\"M15.856 10.177a.978.978 0 01-.965-.965v-2.42a.977.977 0 011.702-.763.979.979 0 01.241.763v2.42a.978.978 0 01-.978.965zM15.869 4.913a.978.978 0 100-1.956.978.978 0 000 1.956zM15.869 15.853a.978.978 0 100-1.956.978.978 0 000 1.956zM15.869 12.996a.978.978 0 100-1.956.978.978 0 000 1.956z\" fill=\"#4285F4\"></path><path d=\"M8.121 15.853a.978.978 0 100-1.956.978.978 0 000 1.956zM8.121 7.783a.978.978 0 100-1.956.978.978 0 000 1.956zM8.121 4.913a.978.978 0 100-1.957.978.978 0 000 1.957zM8.134 12.996a.978.978 0 01-.978-.94V9.611a.965.965 0 011.93 0v2.445a.966.966 0 01-.952.94z\" fill=\"#AECBFA\"></path>"
	},
	"volcengine": {
		file: "volcengine-color.svg",
		body: "<path d=\"M19.44 10.153l-2.936 11.586a.215.215 0 00.214.261h5.87a.215.215 0 00.214-.261l-2.95-11.586a.214.214 0 00-.412 0zM3.28 12.778l-2.275 8.96A.214.214 0 001.22 22h4.532a.212.212 0 00.214-.165.214.214 0 000-.097l-2.276-8.96a.214.214 0 00-.41 0z\" fill=\"#00E5E5\"></path><path d=\"M7.29 5.359L3.148 21.738a.215.215 0 00.203.261h8.29a.214.214 0 00.215-.261L7.7 5.358a.214.214 0 00-.41 0z\" fill=\"#006EFF\"></path><path d=\"M14.44.15a.214.214 0 00-.41 0L8.366 21.739a.214.214 0 00.214.261H19.9a.216.216 0 00.171-.078.214.214 0 00.044-.183L14.439.15z\" fill=\"#006EFF\"></path><path d=\"M10.278 7.741L6.685 21.736a.214.214 0 00.214.264h7.17a.215.215 0 00.214-.264L10.688 7.741a.214.214 0 00-.41 0z\" fill=\"#00E5E5\"></path>"
	},
	"xai": {
		file: "xai.svg",
		fill: "currentColor",
		rule: "evenodd",
		body: "<path d=\"M6.469 8.776L16.512 23h-4.464L2.005 8.776H6.47zm-.004 7.9l2.233 3.164L6.467 23H2l4.465-6.324zM22 2.582V23h-3.659V7.764L22 2.582zM22 1l-9.952 14.095-2.233-3.163L17.533 1H22z\"></path>"
	},
	"xiaomimimo": {
		file: "xiaomimimo.svg",
		fill: "currentColor",
		rule: "evenodd",
		body: "<path d=\"M.958 15.936a.459.459 0 01.459.44v2.729a.46.46 0 01-.918 0v-2.729a.459.459 0 01.459-.44zm4.814-2.035a.46.46 0 01.553.45v4.754a.458.458 0 11-.918 0V15.48L3.74 17.202a.462.462 0 01-.655.016.462.462 0 01-.065-.082L.628 14.67a.459.459 0 01.658-.637l2.124 2.187 2.127-2.188a.46.46 0 01.235-.13zm2.068.004a.46.46 0 01.458.445v4.755a.46.46 0 01-.458.458.459.459 0 01-.458-.458V14.35a.459.459 0 01.458-.445zm1.973 2.014a.46.46 0 01.46.457v2.729a.46.46 0 01-.784.324.46.46 0 01-.134-.324v-2.729a.46.46 0 01.458-.458zm.002-2.045a.458.458 0 01.328.157l2.127 2.19 2.125-2.19a.459.459 0 01.784.318v4.756a.46.46 0 01-.455.458.46.46 0 01-.458-.458V15.48l-1.667 1.723a.46.46 0 01-.65.008l-.005-.005c0-.002-.002-.002-.004-.003l-2.455-2.534a.46.46 0 01-.008-.667.461.461 0 01.338-.128zm6.797 1.206a.46.46 0 01.53.651A1.966 1.966 0 0019.81 18.4a.462.462 0 01.623.18.46.46 0 01-.181.624 2.863 2.863 0 01-1.38.353l-.142-.004a2.88 2.88 0 01-2.393-4.263.461.461 0 01.274-.21zm.864-.931a2.884 2.884 0 013.915 3.914.46.46 0 01-.402.24l-.057-.004a.458.458 0 01-.164-.055.46.46 0 01-.182-.622 1.967 1.967 0 00-2.669-2.67.459.459 0 11-.441-.803zM9.59 6.368c1.481 0 1.696 1.202 1.696 1.654v2.648h-.917v-.432c-.26.346-.792.535-1.36.535-.133 0-1.289-.03-1.384-1.136-.082-.932.675-1.61 2.053-1.61h.691c0-.563-.367-.886-.983-.886-.44.013-.864.174-1.2.458l-.36-.664c.484-.379 1.012-.567 1.764-.567zm4.427.1c1.263 0 2.082.97 2.083 2.15 0 1.181-.824 2.154-2.083 2.154-1.26 0-2.084-.972-2.084-2.152 0-1.18.82-2.153 2.084-2.153zm6.801.015c.68 0 1.202.465 1.197 1.548v2.642H21.1V8.29c0-.312-.002-.98-.63-.98s-.628.667-.628.838v2.524h-.89V8.148c0-.17-.001-.838-.63-.838-.628 0-.628.668-.628.98v2.383h-.917v-4.03h.917V7a1.22 1.22 0 01.947-.516c.398 0 .76.193.982.686a1.321 1.321 0 011.195-.686zm-18.093.872l1.457-1.772H5.32L3.311 8.07l2.14 2.602H4.24L2.725 8.796 1.21 10.672H0L2.138 8.07.13 5.583h1.138l1.458 1.772zm4.149 3.317h-.916V6.644h.916v4.028zm16.99 0h-.916V6.644h.916v4.028zM9.925 8.71c-1.055 0-1.359.412-1.326.742.032.329.324.537.757.537a1.013 1.013 0 001.014-.968l.002-.31h-.447zM14.018 7.3c-.663 0-1.184.487-1.184 1.32 0 .832.52 1.32 1.184 1.32.662 0 1.182-.49 1.182-1.32 0-.832-.52-1.32-1.182-1.32zM6.417 5.001a.568.568 0 01.587.582.588.588 0 01-1.175 0A.57.57 0 016.417 5zm16.991 0a.57.57 0 01.592.582.588.588 0 01-1.174 0 .57.57 0 01.357-.542.572.572 0 01.225-.04z\"></path>"
	},
	"zai": {
		file: "zai.svg",
		fill: "currentColor",
		rule: "evenodd",
		body: "<path d=\"M12.105 2L9.927 4.953H.653L2.83 2h9.276zM23.254 19.048L21.078 22h-9.242l2.174-2.952h9.244zM24 2L9.264 22H0L14.736 2H24z\"></path>"
	},
	"zhipu": {
		file: "zhipu-color.svg",
		body: "<path d=\"M11.991 23.503a.24.24 0 00-.244.248.24.24 0 00.244.249.24.24 0 00.245-.249.24.24 0 00-.22-.247l-.025-.001zM9.671 5.365a1.697 1.697 0 011.099 2.132l-.071.172-.016.04-.018.054c-.07.16-.104.32-.104.498-.035.71.47 1.279 1.186 1.314h.366c1.309.053 2.338 1.173 2.286 2.523-.052 1.332-1.152 2.38-2.478 2.327h-.174c-.715.018-1.274.64-1.239 1.368 0 .124.018.23.053.337.209.373.54.658.96.8.75.23 1.517-.125 1.9-.782l.018-.035c.402-.64 1.17-.96 1.92-.711.854.284 1.378 1.226 1.099 2.167a1.661 1.661 0 01-2.077 1.102 1.711 1.711 0 01-.907-.711l-.017-.035c-.2-.323-.463-.58-.851-.711l-.056-.018a1.646 1.646 0 00-1.954.746 1.66 1.66 0 01-1.065.764 1.677 1.677 0 01-1.989-1.279c-.209-.906.332-1.83 1.257-2.043a1.51 1.51 0 01.296-.035h.018c.68-.071 1.151-.622 1.116-1.333a1.307 1.307 0 00-.227-.693 2.515 2.515 0 01-.366-1.403 2.39 2.39 0 01.366-1.208c.14-.195.21-.444.227-.693.018-.71-.506-1.261-1.186-1.332l-.07-.018a1.43 1.43 0 01-.299-.07l-.05-.019a1.7 1.7 0 01-1.047-2.114 1.68 1.68 0 012.094-1.101zm-5.575 10.11c.26-.264.639-.367.994-.27.355.096.633.379.728.74.095.362-.007.748-.267 1.013-.402.41-1.053.41-1.455 0a1.062 1.062 0 010-1.482zm14.845-.294c.359-.09.738.024.992.297.254.274.344.665.237 1.025-.107.36-.396.634-.756.718-.551.128-1.1-.22-1.23-.781a1.05 1.05 0 01.757-1.26zm-.064-4.39c.314.32.49.753.49 1.206 0 .452-.176.886-.49 1.206-.315.32-.74.5-1.185.5-.444 0-.87-.18-1.184-.5a1.727 1.727 0 010-2.412 1.654 1.654 0 012.369 0zm-11.243.163c.364.484.447 1.128.218 1.691a1.665 1.665 0 01-2.188.923c-.855-.36-1.26-1.358-.907-2.228a1.68 1.68 0 011.33-1.038c.593-.08 1.183.169 1.547.652zm11.545-4.221c.368 0 .708.2.892.524.184.324.184.724 0 1.048a1.026 1.026 0 01-.892.524c-.568 0-1.03-.47-1.03-1.048 0-.579.462-1.048 1.03-1.048zm-14.358 0c.368 0 .707.2.891.524.184.324.184.724 0 1.048a1.026 1.026 0 01-.891.524c-.569 0-1.03-.47-1.03-1.048 0-.579.461-1.048 1.03-1.048zm10.031-1.475c.925 0 1.675.764 1.675 1.706s-.75 1.705-1.675 1.705-1.674-.763-1.674-1.705c0-.942.75-1.706 1.674-1.706zm-2.626-.684c.362-.082.653-.356.761-.718a1.062 1.062 0 00-.238-1.028 1.017 1.017 0 00-.996-.294c-.547.14-.881.7-.752 1.257.13.558.675.907 1.225.783zm0 16.876c.359-.087.644-.36.75-.72a1.062 1.062 0 00-.237-1.019 1.018 1.018 0 00-.985-.301 1.037 1.037 0 00-.762.717c-.108.361-.017.754.239 1.028.245.263.606.377.953.305l.043-.01zM17.19 3.5a.631.631 0 00.628-.64c0-.355-.279-.64-.628-.64a.631.631 0 00-.628.64c0 .355.28.64.628.64zm-10.38 0a.631.631 0 00.628-.64c0-.355-.28-.64-.628-.64a.631.631 0 00-.628.64c0 .355.279.64.628.64zm-5.182 7.852a.631.631 0 00-.628.64c0 .354.28.639.628.639a.63.63 0 00.627-.606l.001-.034a.62.62 0 00-.628-.64zm5.182 9.13a.631.631 0 00-.628.64c0 .355.279.64.628.64a.631.631 0 00.628-.64c0-.355-.28-.64-.628-.64zm10.38.018a.631.631 0 00-.628.64c0 .355.28.64.628.64a.631.631 0 00.628-.64c0-.355-.279-.64-.628-.64zm5.182-9.148a.631.631 0 00-.628.64c0 .354.279.639.628.639a.631.631 0 00.628-.64c0-.355-.28-.64-.628-.64zm-.384-4.992a.24.24 0 00.244-.249.24.24 0 00-.244-.249.24.24 0 00-.244.249c0 .142.122.249.244.249zM11.991.497a.24.24 0 00.245-.248A.24.24 0 0011.99 0a.24.24 0 00-.244.249c0 .133.108.236.223.247l.021.001zM2.011 6.36a.24.24 0 00.245-.249.24.24 0 00-.244-.249.24.24 0 00-.244.249.24.24 0 00.244.249zm0 11.263a.24.24 0 00-.243.248.24.24 0 00.244.249.24.24 0 00.244-.249.252.252 0 00-.244-.248zm19.995-.018a.24.24 0 00-.245.248.24.24 0 00.245.25.24.24 0 00.244-.25.252.252 0 00-.244-.248z\" fill=\"#3859FF\" fill-rule=\"nonzero\"></path>"
	}
};

// src/client/ProviderIcon.tsx
/**
* Provider icons of the model menu: a shipped mark or a configured image.
* Which provider gets which is decided in `shared/icons.ts`; a provider
* without one shows nothing.
*/
function ProviderIcon({ source, size = 16 }) {
	const id = (0, react.useId)().replaceAll(":", "");
	const [broken, setBroken] = (0, react.useState)(false);
	if (source.kind === "image") return broken ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
		className: "nh-provider-image",
		src: source.url,
		width: size,
		height: size,
		alt: "",
		draggable: false,
		onError: () => setBroken(true)
	});
	const mark = MARKS[source.name];
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: mark.fill,
		fillRule: mark.rule,
		"aria-hidden": "true",
		dangerouslySetInnerHTML: { __html: mark.body.replaceAll("__ID__", id) }
	});
}
/** The icon of one provider, or undefined when it has none. */
function providerIcon(provider, configured) {
	const source = iconOf(provider, configured);
	return source ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderIcon, { source }) : void 0;
}

// src/client/BrandIcon.tsx
/*! Lobe Icons (@lobehub/icons-static-svg 1.102.0), MIT.
* Copyright (c) 2023 LobeHub. Full license and source attribution in README.md.
* Paths from codex.svg and claude-color.svg, unchanged; Antigravity uses the
* provider mark generated from antigravity-color.svg.
*/
function BrandIcon({ harness, size = 16 }) {
	if (harness === "antigravity") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderIcon, {
		source: {
			kind: "mark",
			name: "antigravity"
		},
		size
	});
	const claude = harness === "claude-code";
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: claude ? "#D97757" : "currentColor",
		"aria-hidden": "true",
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
			fillRule: claude ? "nonzero" : "evenodd",
			clipRule: claude ? void 0 : "evenodd",
			d: claude ? "M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" : "M8.086.457a6.105 6.105 0 013.046-.415c1.333.153 2.521.72 3.564 1.7a.117.117 0 00.107.029c1.408-.346 2.762-.224 4.061.366l.063.03.154.076c1.357.703 2.33 1.77 2.918 3.198.278.679.418 1.388.421 2.126a5.655 5.655 0 01-.18 1.631.167.167 0 00.04.155 5.982 5.982 0 011.578 2.891c.385 1.901-.01 3.615-1.183 5.14l-.182.22a6.063 6.063 0 01-2.934 1.851.162.162 0 00-.108.102c-.255.736-.511 1.364-.987 1.992-1.199 1.582-2.962 2.462-4.948 2.451-1.583-.008-2.986-.587-4.21-1.736a.145.145 0 00-.14-.032c-.518.167-1.04.191-1.604.185a5.924 5.924 0 01-2.595-.622 6.058 6.058 0 01-2.146-1.781c-.203-.269-.404-.522-.551-.821a7.74 7.74 0 01-.495-1.283 6.11 6.11 0 01-.017-3.064.166.166 0 00.008-.074.115.115 0 00-.037-.064 5.958 5.958 0 01-1.38-2.202 5.196 5.196 0 01-.333-1.589 6.915 6.915 0 01.188-2.132c.45-1.484 1.309-2.648 2.577-3.493.282-.188.55-.334.802-.438.286-.12.573-.22.861-.304a.129.129 0 00.087-.087A6.016 6.016 0 015.635 2.31C6.315 1.464 7.132.846 8.086.457zm-.804 7.85a.848.848 0 00-1.473.842l1.694 2.965-1.688 2.848a.849.849 0 001.46.864l1.94-3.272a.849.849 0 00.007-.854l-1.94-3.393zm5.446 6.24a.849.849 0 000 1.695h4.848a.849.849 0 000-1.696h-4.848z"
		})
	});
}

// \0dsh-css:src/client/picker.css.mjs
const tag = "dsh-native-harness/picker.css";
if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${tag}"]`) === null) {
	const style = document.createElement("style");
	style.dataset.plugin = "dsh-native-harness";
	style.dataset.pluginCss = tag;
	style.textContent = ".nh-controls{min-width:0;position:relative}.nh-brand{flex:none;justify-content:center;align-items:center;display:inline-flex}.nh-picker-pending{background:var(--dsw-alias-state-warn-primary);border-radius:50%;flex:none;width:6px;height:6px}.nh-picker-trigger{border-radius:var(--dsw-radius-sm);min-width:0;max-width:min(360px,45cqw);height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;outline:none;align-items:center;gap:4px;padding:0 4px 0 8px;font-size:13px;font-weight:400;line-height:20px;display:flex}.nh-picker-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.nh-picker-trigger:focus-visible:not([data-selection-focus]){box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}.nh-picker-trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.nh-picker-trigger-label,.nh-picker-trigger-effort{display:var(--dsh-composer-model-text-display,block);text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.nh-picker-trigger-effort{color:var(--dsw-alias-label-caption);flex-shrink:1000}.nh-picker-chevron{color:var(--dsw-alias-label-caption);flex:none;transition:transform .12s}.nh-picker-chevron.is-open{transform:rotate(180deg)}.nh-picker-menu{box-sizing:border-box;top:max(12px, var(--dsh-frame-overlay-top,12px));left:12px;right:anchor(right);bottom:calc(anchor(top) + 8px);z-index:1100;--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);width:fit-content;min-width:min(240px,100vw - 24px);max-width:min(560px,100vw - 24px);height:fit-content;max-height:min(400px,100dvh - 96px);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border:0;flex-direction:column;place-self:safe end;margin:0;padding:4px;display:flex;position:fixed;overflow:hidden}.nh-picker-columns{flex:auto;gap:4px;min-height:0;display:flex}.nh-picker-models{flex-direction:column;flex:260px;min-width:220px;max-width:280px;min-height:0;display:flex}.nh-picker-efforts{border-left:1px solid var(--dsw-alias-border-l2);flex:0 0 140px;padding-left:4px}@media (width<=520px){.nh-picker-columns{flex-direction:column}.nh-picker-models{flex:auto;max-width:none}.nh-picker-efforts{border-left:0;border-top:1px solid var(--dsw-alias-border-l2);flex:0 auto;max-height:40%;padding:4px 0 0}}.nh-picker-footer{border-top:1px solid var(--dsw-alias-border-l2);flex:none;margin-top:4px;padding-top:4px}.nh-picker-scroll{min-height:0;overflow-y:auto}.nh-picker-option{box-sizing:border-box;border-radius:var(--dsw-radius-md);width:auto;min-width:100%;min-height:34px;color:inherit;text-align:left;cursor:pointer;background:0 0;border:none;outline:none;align-items:center;gap:6px;padding:5px 7px;font-size:13px;font-weight:400;line-height:18px;display:flex}.nh-picker-option>svg{flex:none}.nh-picker-option:not(.nh-picker-model-option):hover:not([aria-disabled]),.nh-picker-option:focus-visible,.nh-picker-model-option[data-highlighted]:not([aria-disabled]){background:var(--dsw-alias-interactive-bg-hover)}.nh-picker-option[aria-disabled]{color:var(--dsw-alias-label-dimmed);cursor:default}.nh-picker-option[aria-disabled] .nh-picker-check{color:inherit}.nh-picker-option-icon svg,.nh-picker-trigger-icon svg{display:block}.nh-picker-option-name{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;overflow:hidden}.nh-picker-check{color:var(--dsw-alias-label-primary);flex:0 0 14px;place-items:center;display:grid}.nh-picker-check svg{width:14px;height:14px}.nh-picker-option-icon{width:16px;height:16px}.nh-provider-image{object-fit:contain;display:block}.nh-picker-search-row{flex:none;margin:2px 0 3px;position:relative}.nh-picker-search-row .nh-picker-search{border-radius:var(--dsw-radius-md);background:0 0;border:0 solid #0000;height:auto;padding:5px 7px;display:flex}.nh-picker-search-row .nh-picker-search.has-query{padding-right:34px}.nh-picker-search-row .nh-picker-search:focus-within{border-color:#0000}.nh-picker-search input{padding:0;font-size:12px;line-height:normal}.nh-picker-search input::placeholder{color:var(--dsw-alias-label-caption)}.nh-picker-search-clear{width:24px;height:24px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:50%;justify-content:center;align-items:center;padding:0;display:inline-flex;position:absolute;top:50%;right:4px;transform:translateY(-50%)}.nh-picker-search-clear:hover,.nh-picker-search-clear:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}.nh-picker-status{color:var(--dsw-alias-label-tertiary);padding:8px;font-size:12px;line-height:18px}.nh-picker-error{border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere;justify-content:space-between;align-items:flex-start;gap:6px;max-width:320px;margin-bottom:3px;padding:6px 7px;font-size:11px;line-height:16px;display:flex}.nh-picker-error button{color:inherit;font:inherit;cursor:pointer;background:0 0;border:none;flex:none;padding:0}.nh-team-row{border-radius:var(--dsw-radius-md);min-height:34px;color:var(--dsw-alias-label-primary);justify-content:space-between;align-items:center;gap:16px;padding:0 8px;font-size:13px;line-height:20px;display:flex;position:relative}.nh-team-label{align-items:center;gap:4px;min-width:0;display:inline-flex}.nh-team-info{z-index:1;width:20px;height:20px;color:var(--dsw-alias-label-caption);flex:none;padding:0;position:relative}.nh-team-row .nh-team-switch{position:static}.nh-team-switch:after{content:\"\";border-radius:var(--dsw-radius-md);position:absolute;inset:0}.nh-team-row:has(.nh-team-switch:focus-visible){background:var(--dsw-alias-interactive-bg-hover)}@media (hover:hover){.nh-team-row:has(.nh-team-switch:not(:disabled)):hover{background:var(--dsw-alias-interactive-bg-hover)}}.nh-team-dialog{width:min(440px,100%);max-height:100%}.nh-team-dialog-content{overscroll-behavior:contain;min-height:0;overflow-y:auto}.nh-team-dialog-copy{overflow-wrap:anywhere;min-width:0;color:var(--dsw-alias-label-secondary);font-size:14px;line-height:22px}.nh-team-dialog-copy p{margin:0}.nh-team-dialog-copy p+p{margin-top:12px}.nh-team-dialog-error{color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere}.nh-fast{align-items:center;margin-right:-8px;display:inline-flex;position:relative}.nh-fast-bolt{border-radius:var(--dsw-radius-sm);height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;justify-content:center;align-items:center;padding:0 2px;display:inline-flex}.nh-fast-bolt:hover:not(:disabled){color:var(--dsw-alias-label-secondary)}.nh-fast-bolt:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}.nh-fast-bolt:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.nh-fast-bolt.is-on,.nh-fast-bolt.is-on:hover:not(:disabled){color:var(--dsw-alias-state-business-primary)}.nh-fast-bolt.is-on:disabled{color:var(--dsw-alias-state-business-primary);opacity:.6}.nh-fast-message{color:var(--dsw-alias-label-tertiary);white-space:nowrap;margin-bottom:4px;font-size:12px;line-height:18px;position:absolute;bottom:100%;right:0}.nh-fast-message.is-error{color:var(--dsw-alias-state-error-primary)}";
	document.head.appendChild(style);
}

// src/client/ModelMenu.tsx
/**
* Composer model/effort control built from public primitives; the trigger and
* placement follow dsh's ModelSelect. Used for both native-harness and ordinary
* dsh sessions.
*
* One panel shows models and efforts side by side: the left column is a search
* field over the provider-grouped models, the right one the efforts of the
* current model. Picking a model applies it and keeps the panel open so its
* efforts can be picked next; a model without efforts, or an effort, closes it.
* ↑/↓ move within a column (search keeps focus while they move the model
* highlight), ←/→ switch columns, Enter picks, Escape closes; the search only
* filters the models. An optional footer sits below both columns.
*/
const EFFORT_KEYS = {
	low: "effortLow",
	medium: "effortMedium",
	high: "effortHigh",
	xhigh: "effortXHigh",
	max: "effortMax",
	ultra: "effortUltra",
	minimal: "effortMinimal",
	none: "effortNone"
};
function ModelMenu({ title, groups, current, defaultEffort = true, disabled, busy, loading, error, note, pending, retry, choose, footer, t }) {
	const [open, setOpen] = (0, react.useState)(false);
	const [query, setQuery] = (0, react.useState)("");
	const [highlighted, setHighlighted] = (0, react.useState)(null);
	const [selectionFocus, setSelectionFocus] = (0, react.useState)(false);
	const root = (0, react.useRef)(null);
	const trigger = (0, react.useRef)(null);
	const menu = (0, react.useRef)(null);
	const search = (0, react.useRef)(null);
	const models = (0, react.useRef)(null);
	const efforts = (0, react.useRef)(null);
	const footerRef = (0, react.useRef)(null);
	const mounted = (0, react.useRef)(true);
	const id = (0, react.useId)();
	const anchorName = `--nh-model-${id.replaceAll(":", "")}`;
	const rows = (0, react.useMemo)(() => groups.flatMap((group) => group.models.map((model) => ({
		...model,
		group: group.id,
		icon: group.icon,
		label: model.id,
		key: `${group.id}\0${model.id}`
	}))), [groups]);
	const sections = (0, react.useMemo)(() => groups.map((group) => ({
		group,
		rows: (0, _deepseek_ai_dsh_client_ui_primitives.rankByName)(rows.filter((row) => row.group === group.id), query.trim())
	})).filter((section) => section.rows.length > 0), [
		groups,
		rows,
		query
	]);
	const visible = (0, react.useMemo)(() => sections.flatMap((section) => section.rows), [sections]);
	const currentKey = `${current.group}\0${current.model}`;
	const selected = rows.find((row) => row.key === currentKey);
	const selectedIndex = visible.findIndex((row) => row.key === currentKey);
	const activeIndex = Math.min(highlighted ?? Math.max(0, selectedIndex), visible.length - 1);
	const levels = selected?.efforts ?? [];
	const effective = current.effort || selected?.defaultEffort || "";
	const effortName = (effort) => {
		if (!effort) return t("default");
		const known = EFFORT_KEYS[effort];
		return known ? t(known) : levels.find((item) => item.id === effort)?.name ?? effort;
	};
	const choices = levels.length ? [.../* @__PURE__ */ new Set([
		...defaultEffort && !selected?.defaultEffort ? [""] : [],
		...levels.map((level) => level.id),
		...effective ? [effective] : []
	])] : [];
	const modelName = selected?.name ?? (current.model || t("default"));
	const effortLabel = levels.length || effective ? effortName(effective) : "";
	const triggerIcon = groups.find((group) => group.id === current.group)?.icon;
	(0, react.useEffect)(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	(0, react.useEffect)(() => {
		if (!open) return;
		const outside = (event) => {
			const target = event.target;
			if (!root.current?.contains(target) && !menu.current?.contains(target)) setOpen(false);
		};
		document.addEventListener("pointerdown", outside);
		return () => document.removeEventListener("pointerdown", outside);
	}, [open]);
	(0, react.useEffect)(() => {
		if (disabled) setOpen(false);
	}, [disabled]);
	(0, react.useLayoutEffect)(() => {
		if (open && !(0, _deepseek_ai_dsh_client_ui_primitives.isMobileDevice)()) search.current?.focus();
	}, [open]);
	(0, react.useLayoutEffect)(() => {
		if (open) models.current?.querySelector(`[data-model-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
	}, [
		open,
		activeIndex,
		visible
	]);
	(0, react.useLayoutEffect)(() => {
		if (open && models.current) return (0, _deepseek_ai_dsh_client_ui_primitives.observeStickyMenuGroups)(models.current);
	}, [open, sections]);
	const effortNodes = () => [...efforts.current?.querySelectorAll("[data-nh-effort]") ?? []];
	const focusEfforts = () => {
		const nodes = effortNodes();
		const target = nodes.find((node) => node.getAttribute("aria-checked") === "true") ?? nodes[0];
		if (!target) return false;
		target.focus();
		return true;
	};
	const focusFooter = () => {
		const first = footerRef.current?.querySelector("button:not(:disabled), input:not(:disabled), [tabindex=\"0\"]");
		first?.focus();
		return first !== void 0 && first !== null;
	};
	const dismiss = () => {
		setOpen(false);
		trigger.current?.focus();
	};
	const close = (restore = false) => {
		setOpen(false);
		if (restore) queueMicrotask(() => {
			if (mounted.current) trigger.current?.focus();
		});
	};
	const show = () => {
		setSelectionFocus(false);
		setQuery("");
		setHighlighted(null);
		setOpen(true);
		trigger.current?.focus();
	};
	const finish = () => {
		setSelectionFocus(true);
		close(true);
	};
	const chooseModel = async (row) => {
		if (busy || disabled) return;
		if (row.key === currentKey) {
			if (!row.efforts.length) finish();
			return;
		}
		if (await choose({
			group: row.group,
			model: row.id,
			effort: ""
		}) && mounted.current && !row.efforts.length) finish();
	};
	const chooseEffort = async (effort) => {
		if (busy || disabled) return;
		if (effort === effective) return finish();
		if (await choose({
			...current,
			effort
		}) && mounted.current) finish();
	};
	const onKeyDown = (event) => {
		if (event.nativeEvent.isComposing) return;
		const arrow = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
		if (!open) {
			if (arrow && !disabled) {
				event.preventDefault();
				show();
			}
			return;
		}
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			close(true);
			return;
		}
		const target = event.target;
		if (footerRef.current?.contains(target)) return;
		if (efforts.current?.contains(target) ?? false) {
			const nodes = effortNodes();
			const at = nodes.findIndex((node) => node === target);
			if (arrow) {
				event.preventDefault();
				nodes[(at + arrow + nodes.length) % nodes.length]?.focus();
			} else if (event.key === "ArrowLeft" || event.key === "Tab" && event.shiftKey) {
				event.preventDefault();
				search.current?.focus();
			} else if (event.key === "Tab") {
				event.preventDefault();
				if (!focusFooter()) close(true);
			}
			return;
		}
		const input = search.current;
		if (arrow) {
			event.preventDefault();
			if (visible.length) setHighlighted((activeIndex + arrow + visible.length) % visible.length);
			input?.focus();
			return;
		}
		const caretAtEnd = target !== input || input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
		if (event.key === "ArrowRight" && caretAtEnd || event.key === "Tab" && !event.shiftKey) {
			if (focusEfforts()) event.preventDefault();
			else if (event.key === "Tab") {
				event.preventDefault();
				if (!focusFooter()) close(true);
			}
			return;
		}
		if (event.key === "Tab") {
			event.preventDefault();
			close(true);
			return;
		}
		if (event.key === "Enter" && target === input) {
			event.preventDefault();
			const row = visible[activeIndex];
			if (row) chooseModel(row);
		}
	};
	const status = (error || note) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: error ? "nh-picker-error" : "nh-picker-status",
		role: error ? "alert" : "status",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: error || note }), error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
			type: "button",
			onClick: retry,
			children: t("retry")
		})]
	});
	const grouped = groups.length > 1;
	const iconColumn = groups.some((group) => group.icon);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		ref: root,
		className: "nh-controls",
		onKeyDown,
		onBlur: (event) => {
			const next = event.relatedTarget;
			if (next instanceof Node && (root.current?.contains(next) || menu.current?.contains(next))) return;
			close();
		},
		onMouseDown: (event) => {
			const target = event.target;
			if (!(target instanceof Element) || footerRef.current?.contains(target) || target.closest("input")) return;
			if (target.closest("button") || menu.current?.contains(target)) event.preventDefault();
		},
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				ref: trigger,
				type: "button",
				className: "nh-picker-trigger",
				style: { anchorName },
				"aria-label": [
					t("chooseModel"),
					modelName,
					effortLabel,
					pending
				].filter(Boolean).join(", "),
				"aria-haspopup": "dialog",
				"aria-expanded": open,
				"aria-controls": open ? `${id}-menu` : void 0,
				title: [[
					title,
					modelName,
					effortLabel
				].filter(Boolean).join(" · "), pending].filter(Boolean).join("\n"),
				"aria-busy": busy,
				"data-selection-focus": selectionFocus ? "" : void 0,
				disabled,
				onBlur: () => setSelectionFocus(false),
				onClick: () => open ? close(true) : show(),
				children: [
					triggerIcon && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "nh-brand nh-picker-trigger-icon",
						children: triggerIcon
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "nh-picker-trigger-label",
						children: modelName
					}),
					effortLabel && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "nh-picker-trigger-effort",
						children: effortLabel
					}),
					pending && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "nh-picker-pending",
						"aria-hidden": "true"
					}),
					busy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "ongoing" }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, {
						size: 12,
						className: `nh-picker-chevron${open ? " is-open" : ""}`
					})
				]
			}),
			!open && error && status,
			open && (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.MenuSurface, {
				ref: menu,
				id: `${id}-menu`,
				className: "nh-picker-menu",
				role: "dialog",
				"aria-label": t("pickerMenu"),
				"aria-busy": busy || loading,
				style: { positionAnchor: anchorName },
				children: [
					status,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "nh-picker-columns",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "nh-picker-models",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "nh-picker-search-row",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
										ref: search,
										type: "text",
										role: "searchbox",
										className: `nh-picker-search${query ? " has-query" : ""}`,
										value: query,
										placeholder: t("searchModels"),
										"aria-label": t("searchModels"),
										"aria-controls": `${id}-models`,
										"aria-activedescendant": activeIndex < 0 ? void 0 : `${id}-model-${activeIndex}`,
										onChange: (event) => {
											setQuery(event.target.value);
											setHighlighted(0);
										}
									}), query && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "nh-picker-search-clear",
										"aria-label": t("clearSearch"),
										onClick: () => {
											setQuery("");
											setHighlighted(null);
											search.current?.focus();
										},
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseFillRegular, {})
									})]
								}),
								loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "nh-picker-status",
									role: "status",
									children: t("loadingModels")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									ref: models,
									id: `${id}-models`,
									className: "nh-picker-scroll",
									role: "menu",
									"aria-label": t("model"),
									children: visible.length > 0 ? sections.map(({ group, rows: members }) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MenuGroup, {
										label: grouped ? group.name : title,
										children: members.map((row) => {
											const index = visible.indexOf(row);
											const checked = row.key === currentKey;
											return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
												type: "button",
												role: "menuitemradio",
												"aria-checked": checked,
												"aria-disabled": busy || void 0,
												id: `${id}-model-${index}`,
												"data-model-index": index,
												"data-highlighted": index === activeIndex ? "" : void 0,
												className: "nh-picker-option nh-picker-model-option",
												tabIndex: -1,
												title: row.name,
												onClick: () => void chooseModel(row),
												onMouseMove: () => {
													if (!busy && index !== activeIndex) setHighlighted(index);
												},
												children: [
													iconColumn && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: "nh-brand nh-picker-option-icon",
														children: row.icon
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: "nh-picker-option-name",
														children: row.name
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: "nh-picker-check",
														children: checked && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutlineRegular, {})
													})
												]
											}, row.key);
										})
									}, group.id)) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "nh-picker-status",
										role: "status",
										children: t("noModels")
									})
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							ref: efforts,
							className: "nh-picker-efforts nh-picker-scroll",
							role: "menu",
							"aria-label": t("effort"),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MenuGroup, {
								label: t("effort"),
								children: choices.length ? choices.map((effort) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									role: "menuitemradio",
									"aria-checked": effort === effective,
									"aria-disabled": busy || void 0,
									"data-nh-effort": true,
									className: "nh-picker-option",
									tabIndex: -1,
									onClick: () => void chooseEffort(effort),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "nh-picker-option-name",
										children: effortName(effort)
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "nh-picker-check",
										children: effort === effective && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutlineRegular, {})
									})]
								}, effort || "default")) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "nh-picker-status",
									children: t("noEfforts")
								})
							})
						})]
					}),
					footer && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						ref: footerRef,
						className: "nh-picker-footer",
						children: footer({ dismiss })
					})
				]
			}), document.body)
		]
	});
}

// src/client/TeamToggle.tsx
/**
* Agent-team switch for ordinary dsh sessions, at the bottom of the model menu.
*
* dsh rc.5 puts this switch in its own model button (`conversation.input.model.options`),
* which this plugin replaces; its component is not exported, so it is redrawn here from
* public parts with the same behaviour: hidden for subagent sessions and without
* agent-team; disabled while locked, saving, or before the model selection is known;
* turning it off after the session has used a model asks first; no optimistic update.
*/
const record = (value) => typeof value === "object" && value !== null ? value : void 0;
/** The `agentTeam` projection, or undefined when agent-team is not installed. */
function teamMode(value) {
	const enabled = record(value)?.enabled;
	return typeof enabled === "boolean" ? { enabled } : void 0;
}
/** Whether the session has sent a model request; undefined until the projection arrives. */
function hasUsedModel(value) {
	const selection = record(value);
	return selection && "lastUsed" in selection ? selection.lastUsed !== null : void 0;
}
/** A failed change shows in an error strip above the row until the next try or the menu closes. */
function TeamToggle({ sessionId, port, mode, used, locked, requestDisable, t }) {
	const [pending, setPending] = (0, react.useState)(false);
	const [failure, setFailure] = (0, react.useState)("");
	const select = (enabled) => {
		if (!enabled && used) {
			requestDisable();
			return;
		}
		setPending(true);
		setFailure("");
		port.setEnabled(sessionId, enabled).catch((error) => setFailure(t("teamFailed", { message: error instanceof Error ? error.message : String(error) }))).finally(() => setPending(false));
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [failure && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		className: "nh-picker-error",
		role: "alert",
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: failure })
	}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "nh-team-row",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
			className: "nh-team-label",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("teamLabel") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
				label: t("teamDescription"),
				side: "top",
				delayMs: 300,
				maxWidth: 300,
				portal: true,
				openOnClick: true,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "ghost",
					size: "sm",
					className: "nh-team-info",
					"aria-label": t("teamInfo"),
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconInfoOutlineRegular, {
						size: 11,
						"aria-hidden": "true"
					})
				})
			})]
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Switch, {
			className: "nh-team-switch",
			checked: mode.enabled,
			disabled: locked || pending || used === void 0,
			label: t("teamLabel"),
			onChange: select
		})]
	})] });
}
/** Confirmation that outlives the menu that opened it; a failure stays visible until retry or cancel. */
function TeamDisableDialog({ sessionId, port, onClose, t }) {
	const [state, setState] = (0, react.useState)({ kind: "ready" });
	const saving = state.kind === "saving";
	const cancel = () => {
		if (!saving) onClose();
	};
	const confirm = () => {
		if (saving) return;
		setState({ kind: "saving" });
		port.setEnabled(sessionId, false).then(onClose, (error) => setState({
			kind: "failed",
			message: error instanceof Error ? error.message : String(error)
		}));
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
		open: true,
		tone: "warning",
		title: t("teamDisableTitle"),
		closeLabel: t("close"),
		onClose: cancel,
		className: "nh-team-dialog",
		contentClassName: "nh-team-dialog-content",
		footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
			variant: "outline",
			disabled: saving,
			"data-modal-autofocus": true,
			onClick: cancel,
			children: t("cancel")
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
			variant: "primary",
			disabled: saving,
			onClick: confirm,
			children: t("teamDisableConfirm")
		})] }),
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "nh-team-dialog-copy",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("teamDisableDescription") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("teamDisableWarning") })]
		}), state.kind === "failed" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
			role: "alert",
			className: "nh-team-dialog-error",
			children: t("teamFailed", { message: state.message })
		})]
	});
}

// src/client/views.ts
/**
* Each native session's SessionView, shared by the composer controls that show
* it (model, permission, fast mode), so a change made through one shows in the
* others at once: after a model change the fast switch knows whether the new
* model offers fast mode.
*
* Reads are deduplicated per session (asks in the same tick share one read; an
* ask while one runs reads once more afterwards) and the latest answer wins; a pick's returned
* settings outrank any read that started before it. An entry is dropped when
* its last subscriber leaves.
*/
const INITIAL = {
	view: null,
	loading: true,
	error: ""
};
function createViews(actions) {
	const entries = /* @__PURE__ */ new Map();
	const entryOf = (sessionId) => {
		let entry = entries.get(sessionId);
		if (!entry) {
			entry = {
				state: INITIAL,
				listeners: /* @__PURE__ */ new Set(),
				epoch: 0,
				scheduled: false,
				reading: false,
				again: false
			};
			entries.set(sessionId, entry);
		}
		return entry;
	};
	const publish = (entry, state) => {
		entry.state = state;
		for (const listener of entry.listeners) listener();
	};
	const read = (sessionId, entry) => {
		if (entry.reading) {
			entry.again = true;
			return;
		}
		entry.reading = true;
		entry.again = false;
		const epoch = ++entry.epoch;
		if (!entry.state.loading) publish(entry, {
			...entry.state,
			loading: true
		});
		actions.view(sessionId).then((view) => {
			if (epoch === entry.epoch) publish(entry, {
				view,
				loading: false,
				error: view?.error ?? ""
			});
		}, (reason) => {
			if (epoch === entry.epoch) publish(entry, {
				...entry.state,
				loading: false,
				error: String(reason)
			});
		}).finally(() => {
			entry.reading = false;
			if (entry.again && entries.get(sessionId) === entry) read(sessionId, entry);
			else if (epoch !== entry.epoch && entry.state.loading) publish(entry, {
				...entry.state,
				loading: false
			});
		});
	};
	return {
		subscribe(sessionId, listener) {
			const entry = entryOf(sessionId);
			entry.listeners.add(listener);
			return () => {
				entry.listeners.delete(listener);
				if (!entry.listeners.size && entries.get(sessionId) === entry) entries.delete(sessionId);
			};
		},
		get: (sessionId) => entries.get(sessionId)?.state ?? INITIAL,
		refresh(sessionId) {
			const entry = entryOf(sessionId);
			if (entry.scheduled) return;
			entry.scheduled = true;
			queueMicrotask(() => {
				entry.scheduled = false;
				if (entries.get(sessionId) === entry) read(sessionId, entry);
			});
		},
		async select(sessionId, change) {
			const outcome = await actions.select(sessionId, change);
			const entry = entries.get(sessionId);
			if (entry) {
				entry.epoch++;
				const view = entry.state.view;
				publish(entry, {
					...entry.state,
					...view ? { view: {
						...view,
						settings: outcome.settings
					} } : {}
				});
			}
			return outcome;
		}
	};
}
/**
* One session's view as run by `harness`; reads it on mount and again whenever
* `refreshKey` changes. A view kept from the other harness (a blank session
* switched presets) counts as not read yet.
*/
function useView(views, sessionId, harness, refreshKey) {
	const subscribe = (0, react.useCallback)((listener) => views.subscribe(sessionId, listener), [views, sessionId]);
	const state = (0, react.useSyncExternalStore)(subscribe, () => views.get(sessionId));
	(0, react.useEffect)(() => {
		views.refresh(sessionId);
	}, [
		views,
		sessionId,
		harness,
		refreshKey
	]);
	return state.view && state.view.harness !== harness ? {
		...state,
		view: null
	} : state;
}

// src/client/ModelSeat.tsx
/**
* The composer model seat. Native-harness sessions read and write their own
* settings through the plugin Remote; every other session keeps dsh's model
* selection through the public `modelDirectories` service.
*/
function ModelSeat(props) {
	const harness = harnessOfPreset(props.useProjection("agentPreset"));
	return harness ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(HarnessModel, {
		...props,
		harness
	}, `${props.sessionId}:${harness}`) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DshModel, { ...props }, props.sessionId);
}
/** How often a seat with a pending endpoint switch reads the session again; background tasks can end it any time. */
const SWITCH_POLL_MS = 2e3;
function HarnessModel({ sessionId, locked, views, useProjection, t, harness }) {
	const { view, loading, error: readError } = useView(views, sessionId, harness, useProjection("tokenUsage"));
	const [busy, setBusy] = (0, react.useState)(false);
	const [error, setError] = (0, react.useState)("");
	const [note, setNote] = (0, react.useState)("");
	const catalog = view?.catalog;
	const endpoints = view?.endpoints;
	const groups = (0, react.useMemo)(() => {
		const models = (catalog?.models ?? []).map((model) => ({
			id: model.id,
			name: model.name,
			efforts: model.efforts
		}));
		const icon = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BrandIcon, { harness });
		if (endpoints?.length) return endpoints.map((endpoint) => ({
			id: endpoint.id,
			name: endpoint.name,
			icon,
			models
		}));
		return [{
			id: harness,
			name: HARNESS_NAMES[harness],
			icon,
			models
		}];
	}, [
		catalog,
		endpoints,
		harness
	]);
	const settings = view?.settings ?? {};
	const endpoint = endpoints?.find((candidate) => candidate.id === settings.endpoint);
	const current = {
		group: endpoints?.length ? settings.endpoint ?? "" : harness,
		model: settings.model ?? "",
		effort: settings.effort ?? ""
	};
	const switching = view?.switching;
	const pending = switching && endpoint ? t(switching === "tasks" ? "endpointWaitTasks" : "endpointWaitTurn", { name: endpoint.name }) : "";
	(0, react.useEffect)(() => {
		if (!switching) return;
		const timer = setInterval(() => views.refresh(sessionId), SWITCH_POLL_MS);
		return () => clearInterval(timer);
	}, [
		switching,
		views,
		sessionId
	]);
	const choose = (0, react.useCallback)(async (selection) => {
		setBusy(true);
		setError("");
		const change = {};
		if (endpoints?.length && selection.group !== current.group) change.endpoint = selection.group;
		if (selection.model !== current.model) change.model = selection.model || null;
		const sameModelElsewhere = "endpoint" in change && !("model" in change);
		if ("model" in change || selection.effort !== current.effort && !sameModelElsewhere) change.effort = selection.effort || null;
		try {
			const outcome = await views.select(sessionId, change);
			setNote(outcome.result.status === "next-turn" && !("endpoint" in change) ? t("nextTurn") : "");
			if ("endpoint" in change) views.refresh(sessionId);
			if (outcome.result.status === "rejected" || outcome.result.status === "unsupported") setError(outcome.result.detail ?? outcome.result.status);
			return true;
		} catch (reason) {
			setError(String(reason));
			return false;
		} finally {
			setBusy(false);
		}
	}, [
		views,
		sessionId,
		endpoints,
		current.group,
		current.model,
		current.effort,
		t
	]);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelMenu, {
		title: endpoint ? `${HARNESS_NAMES[harness]} · ${endpoint.name}` : HARNESS_NAMES[harness],
		groups,
		current,
		defaultEffort: false,
		disabled: locked,
		busy,
		loading,
		error: error || readError,
		note: pending || note,
		pending,
		retry: () => {
			setError("");
			views.refresh(sessionId);
		},
		choose,
		t
	});
}
/** Ordinary sessions: dsh's model directory, plus the agent-team switch native sessions have no use for. */
function DshModel({ sessionId, locked, directories, team, icons, useProjection, useSession, useSessions, t }) {
	const directory = (0, react.useMemo)(() => directories.directoryFor(sessionId), [directories, sessionId]);
	const state = (0, react.useSyncExternalStore)(directory.store.subscribe, directory.store.getSnapshot);
	const [busy, setBusy] = (0, react.useState)(false);
	const port = (0, react.useSyncExternalStore)(team.subscribe, team.getSnapshot);
	const configuredIcons = (0, react.useSyncExternalStore)(icons.subscribe, icons.getSnapshot);
	const mode = teamMode(useProjection("agentTeam"));
	const used = hasUsedModel(useProjection("modelSelection"));
	const addressedChild = useSession((snapshot) => snapshot.subagent !== null);
	const listedChild = useSessions((list) => list.byId[sessionId]?.origin === "subagent");
	const [confirming, setConfirming] = (0, react.useState)(false);
	const footer = port && mode && !addressedChild && !listedChild ? ({ dismiss }) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TeamToggle, {
		sessionId,
		port,
		mode,
		used,
		locked,
		requestDisable: () => {
			dismiss();
			setConfirming(true);
		},
		t
	}) : void 0;
	(0, react.useEffect)(() => {
		directory.load().catch(() => void 0);
	}, [directory]);
	const groups = (0, react.useMemo)(() => state.groups.map((group) => ({
		id: group.id,
		name: group.name,
		icon: providerIcon(group.id, configuredIcons),
		models: group.models.map((model) => ({
			id: model.id,
			name: model.name,
			efforts: model.reasoning?.efforts.map((effort) => ({
				id: effort.id,
				name: effort.name
			})) ?? [],
			...model.reasoning?.defaultEffort ? { defaultEffort: model.reasoning.defaultEffort } : {}
		}))
	})), [state.groups, configuredIcons]);
	const current = {
		group: state.current?.provider ?? "",
		model: state.current?.model ?? "",
		effort: state.current?.reasoningEffort ?? ""
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelMenu, {
		title: "DeepSeek Harness",
		groups,
		current,
		disabled: locked || state.status === "selecting",
		busy,
		loading: state.status === "loading",
		error: state.error ?? "",
		retry: () => void directory.load().catch(() => void 0),
		choose: async (selection) => {
			setBusy(true);
			try {
				return (await directory.select({
					provider: selection.group,
					model: selection.model,
					...selection.effort ? { reasoningEffort: selection.effort } : {}
				})).ok;
			} finally {
				setBusy(false);
			}
		},
		footer,
		t
	}), confirming && port && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TeamDisableDialog, {
		sessionId,
		port,
		onClose: () => setConfirming(false),
		t
	})] });
}

// src/client/PermissionSeat.tsx
/**
* The composer permission seat. Native-harness sessions list their own
* harness's modes; other sessions keep dsh's preset control (same catalog,
* projection and `/permission` command path as dsh's own seat).
*/
const GLYPHS = {
	"read-only": /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.PermissionIconReadOnlyRegular, {}),
	plan: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.PermissionIconReadOnlyRegular, {}),
	"workspace-write": /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.PermissionIconWorkspaceWriteRegular, {}),
	default: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.PermissionIconWorkspaceWriteRegular, {}),
	acceptEdits: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.PermissionIconWorkspaceWriteRegular, {}),
	auto: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.PermissionIconAutoReviewRegular, {}),
	"auto-review": /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.PermissionIconAutoReviewRegular, {}),
	"danger-full-access": /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.PermissionIconFullAccessRegular, {}),
	"full-access": /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.PermissionIconFullAccessRegular, {}),
	bypassPermissions: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.PermissionIconFullAccessRegular, {})
};
function PermissionSeat(props) {
	const harness = harnessOfPreset(props.useProjection("agentPreset"));
	return harness ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(HarnessModes, {
		...props,
		harness
	}, `${props.sessionId}:${harness}`) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DshPresets, { ...props }, props.sessionId);
}
function Choice({ options, current, locked, busy, title, onChoose, t }) {
	const [open, setOpen] = (0, react.useState)(false);
	const [confirm, setConfirm] = (0, react.useState)(null);
	const [acknowledged, setAcknowledged] = (0, react.useState)(false);
	const available = (id) => id !== null && options.some((option) => option.id === id);
	(0, react.useEffect)(() => {
		if (!locked && (confirm === null || available(confirm))) return;
		setOpen(false);
		setAcknowledged(false);
		setConfirm(null);
	}, [
		locked,
		confirm,
		options
	]);
	const selected = options.find((option) => option.id === current);
	const label = selected?.name ?? current ?? t("default");
	const choose = (id) => {
		setOpen(false);
		if (locked || id === current || !available(id)) return;
		if (options.find((option) => option.id === id)?.risky) {
			setAcknowledged(false);
			setConfirm(id);
			return;
		}
		onChoose(id);
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
		open,
		items: options.map((option) => ({
			id: option.id,
			label: option.name,
			...GLYPHS[option.id] ? { icon: GLYPHS[option.id] } : {}
		})),
		...current ? { selectedId: current } : {},
		onSelect: choose,
		onClose: () => setOpen(false),
		side: "top",
		portal: true,
		anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
			type: "button",
			className: "nh-permission-trigger",
			"aria-label": t("permissionMode", { name: label }),
			title: title ?? selected?.description,
			disabled: locked || busy,
			onClick: () => setOpen(!open),
			children: [
				current && GLYPHS[current] && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "nh-permission-icon",
					children: GLYPHS[current]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "nh-permission-label",
					children: label
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: `nh-permission-chevron${open ? " is-open" : ""}`,
					"aria-hidden": true,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, {})
				})
			]
		})
	}), confirm !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.RiskConfirmation, {
		open: true,
		title: confirm === "auto" ? t("autoConfirmTitle") : t("confirmTitle"),
		description: confirm === "auto" ? t("autoConfirmDescription") : options.find((option) => option.id === confirm)?.description ?? t("confirmDescription"),
		acknowledgeLabel: t("confirmAcknowledge"),
		cancelLabel: t("cancel"),
		closeLabel: t("close"),
		confirmLabel: t("confirmEnable"),
		acknowledged,
		disabled: locked || busy,
		onAcknowledgedChange: setAcknowledged,
		onCancel: () => setConfirm(null),
		onConfirm: () => {
			const id = confirm;
			setConfirm(null);
			if (!locked && available(id)) onChoose(id);
		}
	})] });
}
function localized(key, fallback, t) {
	const value = t(key);
	return value === key ? fallback : value;
}
/** Mode ids are native and may repeat across harnesses (both have `auto`), so labels are keyed per harness. */
function modeLabel(harness, option, t) {
	return {
		...option,
		name: localized(`mode_${harness}_${option.id}`, option.name, t)
	};
}
function HarnessModes({ sessionId, locked, useProjection, views, t, harness }) {
	const [busy, setBusy] = (0, react.useState)(false);
	const [message, setMessage] = (0, react.useState)("");
	const { view } = useView(views, sessionId, harness, useProjection("tokenUsage"));
	const options = (view?.catalog?.modes ?? []).map((option) => modeLabel(harness, option, t));
	if (!options.length) return null;
	const current = view?.settings.mode;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Choice, {
		options,
		current,
		locked,
		busy,
		...message ? { title: message } : {},
		onChoose: (id) => {
			setBusy(true);
			setMessage("");
			views.select(sessionId, { mode: id }).then((outcome) => {
				if (outcome.result.status === "next-turn") setMessage(t("nextTurn"));
				else if (outcome.result.status !== "applied") setMessage(outcome.result.detail ?? outcome.result.status);
			}).catch((reason) => setMessage(String(reason))).finally(() => setBusy(false));
		},
		t
	});
}
function DshPresets({ sessionId, locked, useProjection, dsh, t }) {
	const selection = useProjection("permissions");
	const catalog = (0, react.useSyncExternalStore)(dsh.catalog.subscribe, dsh.catalog.getSnapshot);
	const [pending, setPending] = (0, react.useState)(null);
	if (!selection || !catalog) return null;
	const options = catalog.options.map((option) => ({
		id: option.value,
		name: option.name === option.value ? localized(`preset_${option.value}`, option.name, t) : option.name,
		...option.description ? { description: option.description } : {},
		...option.value === "danger-full-access" || option.value === "auto" ? { risky: true } : {}
	}));
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Choice, {
		options,
		current: pending ?? selection.currentValue,
		locked,
		busy: pending !== null,
		onChoose: (id) => {
			setPending(id);
			dsh.select(sessionId, id).catch(() => void 0).finally(() => setPending(null));
		},
		t
	});
}

// src/client/ResumeAction.tsx
/**
* Session header action of a native-harness session: the native session id
* and the command that resumes it in the harness's own terminal UI.
*/
const quote = (value) => `'${value.replaceAll(`'`, `'\\''`)}'`;
/**
* Claude keeps sessions per project directory, so every command starts from the
* session's cwd. A Claude session on an endpoint with a `command` (e.g. a shell
* alias that points `claude` at it) resumes with that command.
*/
function resumeCommand(harness, native, view) {
	const command = view?.endpoints?.find((endpoint) => endpoint.id === view.settings.endpoint)?.command || "claude";
	const resume = harness === "claude-code" ? `${command} --resume ${native.id}` : harness === "antigravity" ? `agy --conversation ${native.id}` : `codex resume ${native.id}`;
	return `cd ${quote(native.cwd)} && ${resume}`;
}
function ResumeAction({ sessionId, useProjection, actions, t }) {
	const harness = harnessOfPreset(useProjection("agentPreset"));
	const steps = useProjection("tokenUsage");
	const [view, setView] = (0, react.useState)(null);
	const native = view?.native;
	const [open, setOpen] = (0, react.useState)(false);
	const trigger = (0, react.useRef)(null);
	const panel = (0, react.useRef)(null);
	const anchorName = `--nh-resume-${(0, react.useId)().replaceAll(":", "")}`;
	(0, react.useEffect)(() => {
		if (!harness) return;
		let live = true;
		actions.view(sessionId).then((next) => live && setView(next)).catch(() => void 0);
		return () => {
			live = false;
		};
	}, [
		sessionId,
		harness,
		actions,
		steps,
		open
	]);
	(0, react.useEffect)(() => {
		if (!open) return;
		const outside = (event) => {
			const target = event.target;
			if (!trigger.current?.contains(target) && !panel.current?.contains(target)) setOpen(false);
		};
		const escape = (event) => {
			if (event.key === "Escape") setOpen(false);
		};
		document.addEventListener("pointerdown", outside);
		document.addEventListener("keydown", escape);
		return () => {
			document.removeEventListener("pointerdown", outside);
			document.removeEventListener("keydown", escape);
		};
	}, [open]);
	if (!harness || !native) return null;
	const name = HARNESS_NAMES[harness];
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
		ref: trigger,
		type: "button",
		className: "nh-resume-trigger",
		style: { anchorName },
		"aria-haspopup": "dialog",
		"aria-expanded": open,
		title: t("resumeTitle", { name }),
		onClick: () => setOpen(!open),
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(BrandIcon, {
			harness,
			size: 14
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			className: "nh-resume-id",
			children: native.id.slice(0, 8)
		})]
	}), open && (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.MenuSurface, {
		ref: panel,
		role: "dialog",
		"aria-label": t("resumeTitle", { name }),
		className: "nh-resume-panel",
		style: { positionAnchor: anchorName },
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "nh-resume-caption",
				children: t("resumeTitle", { name })
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
				className: "nh-resume-full-id",
				children: native.id
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "nh-resume-caption",
				children: t("resumeCommand")
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.CodeBlock, {
				code: resumeCommand(harness, native, view ?? void 0),
				lang: "bash",
				copyLabel: t("copy"),
				copiedLabel: t("copied")
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: native.live ? "nh-resume-warning" : "nh-resume-note",
				children: native.live ? t("resumeLive", { minutes: String(native.idleMinutes) }) : t("resumeIdle")
			})
		]
	}), document.body)] });
}

// src/client/BackgroundTasks.tsx
/**
* Composer dock pill of a native-harness session: the subagents and
* background tasks its native process is running, each with its own stop
* control when the harness can stop it alone. The main Stop spares them, so
* this list is how a user stops one.
*/
/** Live work changes without dsh steps, so the list is re-read while anything runs. */
const POLL_MS = 2e3;
function elapsed(ms) {
	const seconds = Math.max(0, Math.floor(ms / 1e3));
	if (seconds < 60) return `${seconds}s`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, "0")}s`;
	return `${Math.floor(seconds / 3600)}h${String(Math.floor(seconds % 3600 / 60)).padStart(2, "0")}m`;
}
const tokens = (count) => count >= 1e3 ? `${(count / 1e3).toFixed(1)}K` : String(count);
function BackgroundTasks({ sessionId, useProjection, useSession, actions, t }) {
	const harness = harnessOfPreset(useProjection("agentPreset"));
	const steps = useProjection("tokenUsage");
	const running = useSession((session) => session.running);
	const [tasks, setTasks] = (0, react.useState)([]);
	const [stopping, setStopping] = (0, react.useState)(/* @__PURE__ */ new Set());
	const [failed, setFailed] = (0, react.useState)("");
	const [open, setOpen] = (0, react.useState)(false);
	const [now, setNow] = (0, react.useState)(Date.now());
	const [reload, setReload] = (0, react.useState)(0);
	const trigger = (0, react.useRef)(null);
	const panel = (0, react.useRef)(null);
	const anchorName = `--nh-tasks-${(0, react.useId)().replaceAll(":", "")}`;
	const active = tasks.length > 0;
	(0, react.useEffect)(() => {
		if (!harness) return;
		let live = true;
		actions.tasks(sessionId).then((value) => {
			if (!live) return;
			setTasks(value);
			setStopping((previous) => new Set([...previous].filter((id) => value.some((task) => task.id === id))));
		}).catch(() => void 0);
		return () => {
			live = false;
		};
	}, [
		sessionId,
		harness,
		actions,
		steps,
		running,
		reload
	]);
	(0, react.useEffect)(() => {
		if (!harness || !active && !running) return;
		const timer = setInterval(() => setReload((value) => value + 1), POLL_MS);
		return () => clearInterval(timer);
	}, [
		harness,
		active,
		running
	]);
	(0, react.useEffect)(() => {
		if (!open) return;
		const timer = setInterval(() => setNow(Date.now()), 1e3);
		const outside = (event) => {
			const target = event.target;
			if (!trigger.current?.contains(target) && !panel.current?.contains(target)) setOpen(false);
		};
		const escape = (event) => {
			if (event.key === "Escape") setOpen(false);
		};
		document.addEventListener("pointerdown", outside);
		document.addEventListener("keydown", escape);
		return () => {
			clearInterval(timer);
			document.removeEventListener("pointerdown", outside);
			document.removeEventListener("keydown", escape);
		};
	}, [open]);
	(0, react.useEffect)(() => {
		if (!active) setOpen(false);
	}, [active]);
	if (!harness || !active) return null;
	const stop = (id) => {
		setFailed("");
		setStopping((previous) => new Set(previous).add(id));
		actions.stopTask(sessionId, id).then(() => setReload((value) => value + 1)).catch((reason) => {
			setFailed(String(reason));
			setStopping((previous) => new Set([...previous].filter((item) => item !== id)));
		});
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
		className: "nh-tasks-anchor",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
			ref: trigger,
			type: "button",
			className: "nh-tasks-pill",
			style: { anchorName },
			"aria-haspopup": "dialog",
			"aria-expanded": open,
			onClick: () => {
				setNow(Date.now());
				setOpen(!open);
			},
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "ongoing" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("tasksRunning", { count: String(tasks.length) }) })]
		}), open && (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.MenuSurface, {
			ref: panel,
			role: "dialog",
			"aria-label": t("tasksTitle"),
			className: "nh-tasks-panel",
			style: { positionAnchor: anchorName },
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "nh-tasks-title",
					children: t("tasksTitle")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
					className: "nh-tasks-list",
					children: tasks.map((task) => {
						const halting = stopping.has(task.id);
						const details = [
							elapsed(now - task.startedAt),
							task.tokens !== void 0 ? t("taskTokens", { count: tokens(task.tokens) }) : "",
							task.toolUses !== void 0 ? t("taskTools", { count: String(task.toolUses) }) : "",
							task.lastTool ?? ""
						].filter(Boolean);
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
							className: "nh-tasks-row",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: halting ? "warning" : "ongoing" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "nh-tasks-main",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "nh-tasks-primary",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "nh-tasks-kind",
												children: t(task.kind === "agent" ? "taskAgent" : task.kind === "shell" ? "taskShell" : "taskOther")
											}),
											task.background && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "nh-tasks-kind",
												children: t("taskBackground")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "nh-tasks-label",
												title: task.title,
												children: task.title
											})
										]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "nh-tasks-secondary",
										children: details.join(" · ")
									})]
								}),
								task.stoppable !== false && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "nh-tasks-stop",
									disabled: halting,
									onClick: () => stop(task.id),
									children: halting ? t("taskStopping") : t("taskStop")
								})
							]
						}, task.id);
					})
				}),
				failed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "nh-error",
					children: failed
				})
			]
		}), document.body)]
	});
}

// src/client/FastToggle.tsx
/**
* Fast mode of a native Codex session: a bare lightning bolt before the model
* button, where better-providers puts its own for dsh's Codex route, coloured
* while on. Shown only when the session's model offers fast mode. Switching it
* during a turn takes effect from the next turn.
*/
function FastToggle(props) {
	return harnessOfPreset(props.useProjection("agentPreset")) === "codex" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodexFast, { ...props }, props.sessionId) : null;
}
function CodexFast({ sessionId, views, t }) {
	const { view } = useView(views, sessionId, "codex");
	const [saving, setSaving] = (0, react.useState)();
	const [message, setMessage] = (0, react.useState)();
	(0, react.useEffect)(() => {
		if (!message || message.failed) return;
		const timer = setTimeout(() => setMessage(void 0), 4e3);
		return () => clearTimeout(timer);
	}, [message]);
	const model = view?.catalog?.models.find((candidate) => candidate.id === view.settings.model);
	if (!view || !model?.fast) return null;
	const pressed = saving ?? view.settings.fast === true;
	const about = model.fast.description ? `\n${model.fast.name}: ${model.fast.description}` : "";
	const toggle = () => {
		const next = !pressed;
		setSaving(next);
		setMessage(void 0);
		views.select(sessionId, { fast: next }).then((outcome) => {
			if (outcome.result.status === "next-turn") setMessage({
				text: t("nextTurn"),
				failed: false
			});
			else if (outcome.result.status !== "applied") setMessage({
				text: outcome.result.detail ?? t("fastFailed"),
				failed: true
			});
		}, () => setMessage({
			text: t("fastFailed"),
			failed: true
		})).finally(() => setSaving(void 0));
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
		className: "nh-fast",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
			type: "button",
			className: `nh-fast-bolt${pressed ? " is-on" : ""}`,
			"aria-label": t("fastLabel"),
			"aria-pressed": pressed,
			title: `${t(pressed ? "fastOn" : "fastOff")}${about}`,
			disabled: saving !== void 0,
			onClick: toggle,
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: "16",
				height: "16",
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1.8",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M13 2 4 14h7l-1 8 10-13h-7l1-7Z" })
			})
		}), message && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			className: `nh-fast-message${message.failed ? " is-error" : ""}`,
			role: "status",
			children: message.text
		})]
	});
}

// src/client/SessionMark.tsx
/** Sidebar row mark: the brand of whatever runs the session, the native harness or dsh itself. */
function useHarness(sessionId, sessions) {
	return (0, react.useSyncExternalStore)(sessions.subscribe, () => harnessOfPreset(sessions.getSnapshot().byId[sessionId]?.projectionValues?.agentPreset));
}
function SessionMark({ sessionId, sessions }) {
	const harness = useHarness(sessionId, sessions);
	if (!harness) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
		className: "nh-brand",
		role: "img",
		"aria-label": "DeepSeek Harness",
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.FishLogo, { size: 14 })
	});
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
		className: "nh-brand",
		role: "img",
		"aria-label": HARNESS_NAMES[harness],
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BrandIcon, {
			harness,
			size: 14
		})
	});
}

// src/client/TerminalResume.tsx
/**
* New Session option of a blank Claude Code session: continue a conversation
* started in a terminal. It sits with dsh's own options (beside forge's
* worktree switch); its panel lists the Claude Code sessions started in the
* session's directory, newest first. The pick holds until the first turn,
* which resumes that conversation or a copy of it; until then it can change
* or be undone.
*/
const message = (reason) => reason instanceof Error ? reason.message : String(reason);
const basename = (path) => path.replace(/\/+$/, "").split("/").pop() || path;
/** How long ago `ms` was, coarsely; a week or more shows the date. */
function ago(ms, now, t) {
	const minutes = Math.floor((now - ms) / 6e4);
	if (minutes < 1) return t("agoNow");
	if (minutes < 60) return t("agoMinutes", { n: String(minutes) });
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return t("agoHours", { n: String(hours) });
	const days = Math.floor(hours / 24);
	if (days < 7) return t("agoDays", { n: String(days) });
	return new Date(ms).toLocaleDateString();
}
function TerminalResume(props) {
	return harnessOfPreset(props.useProjection("agentPreset")) === "claude-code" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Picker, { ...props }, props.sessionId) : null;
}
function Picker({ sessionId, actions, views, t }) {
	const { view } = useView(views, sessionId, "claude-code");
	const adopted = view?.adopted;
	const [open, setOpen] = (0, react.useState)(false);
	const [listing, setListing] = (0, react.useState)({ status: "loading" });
	const [reload, setReload] = (0, react.useState)(0);
	const [picked, setPicked] = (0, react.useState)();
	const [fork, setFork] = (0, react.useState)(false);
	const [busy, setBusy] = (0, react.useState)(false);
	const [error, setError] = (0, react.useState)("");
	const trigger = (0, react.useRef)(null);
	const panel = (0, react.useRef)(null);
	const anchorName = `--nh-terminal-${(0, react.useId)().replaceAll(":", "")}`;
	(0, react.useEffect)(() => {
		if (!open) return;
		let live = true;
		setListing({ status: "loading" });
		actions.terminalSessions(sessionId).then((value) => live && setListing({
			status: "ready",
			value
		}), (reason) => live && setListing({
			status: "failed",
			error: message(reason)
		}));
		return () => {
			live = false;
		};
	}, [
		open,
		reload,
		sessionId,
		actions
	]);
	(0, react.useEffect)(() => {
		if (!open) return;
		const outside = (event) => {
			const target = event.target;
			if (!trigger.current?.contains(target) && !panel.current?.contains(target)) setOpen(false);
		};
		const escape = (event) => {
			if (event.key !== "Escape") return;
			setOpen(false);
			trigger.current?.focus();
		};
		document.addEventListener("pointerdown", outside);
		document.addEventListener("keydown", escape);
		return () => {
			document.removeEventListener("pointerdown", outside);
			document.removeEventListener("keydown", escape);
		};
	}, [open]);
	const show = () => {
		setPicked(adopted?.id);
		setFork(adopted?.fork ?? false);
		setError("");
		setOpen(true);
	};
	const sessions = listing.status === "ready" ? listing.value.sessions : [];
	const choice = sessions.find((session) => session.id === picked);
	const forced = choice?.open === true;
	const adopt = async (next) => {
		setBusy(true);
		setError("");
		try {
			await actions.adopt(sessionId, next);
			views.refresh(sessionId);
			return true;
		} catch (reason) {
			setError(message(reason));
			return false;
		} finally {
			setBusy(false);
		}
	};
	const confirm = async () => {
		if (!choice || busy) return;
		if (await adopt({
			id: choice.id,
			fork: fork || forced
		})) {
			setOpen(false);
			trigger.current?.focus();
		}
	};
	const label = adopted ? t(adopted.fork ? "terminalAdoptedFork" : "terminalAdopted", { title: adopted.title }) : t("terminalResume");
	const now = Date.now();
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
		className: "nh-terminal-option",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				ref: trigger,
				type: "button",
				className: "nh-resume-trigger nh-terminal-trigger",
				style: { anchorName },
				"aria-haspopup": "dialog",
				"aria-expanded": open,
				"aria-pressed": adopted ? true : void 0,
				title: adopted ? adopted.title : t("terminalTitle"),
				disabled: busy,
				onClick: () => open ? setOpen(false) : show(),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(BrandIcon, {
					harness: "claude-code",
					size: 14
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "nh-terminal-label",
					children: label
				})]
			}),
			adopted && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: "nh-resume-trigger nh-terminal-cancel",
				"aria-label": t("terminalCancel"),
				title: t("terminalCancel"),
				disabled: busy,
				onClick: () => void adopt(null),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseFillRegular, { size: 12 })
			}),
			!open && error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "nh-terminal-error",
				role: "alert",
				children: error
			}),
			open && (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.MenuSurface, {
				ref: panel,
				role: "dialog",
				"aria-label": t("terminalTitle"),
				"aria-busy": busy || listing.status === "loading",
				className: "nh-resume-panel nh-terminal-panel",
				style: { positionAnchor: anchorName },
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "nh-terminal-heading",
						children: t("terminalTitle")
					}),
					listing.status === "loading" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "nh-resume-caption",
						role: "status",
						children: t("terminalLoading")
					}),
					listing.status === "failed" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "nh-picker-error",
						role: "alert",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: listing.error }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => setReload((value) => value + 1),
							children: t("retry")
						})]
					}),
					listing.status === "ready" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "nh-resume-caption",
						title: listing.value.cwd,
						children: t("terminalCaption", { dir: basename(listing.value.cwd) })
					}),
					listing.status === "ready" && !sessions.length && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "nh-resume-note",
						children: t("terminalEmpty")
					}),
					sessions.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "nh-terminal-list",
						role: "radiogroup",
						"aria-label": t("terminalTitle"),
						children: sessions.map((session) => {
							const checked = session.id === picked;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								role: "radio",
								"aria-checked": checked,
								className: "nh-terminal-row",
								title: session.title,
								onClick: () => setPicked(session.id),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "nh-terminal-row-title",
										children: session.title
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "nh-terminal-row-meta",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: ago(session.modified, now, t) }),
											session.branch && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "nh-terminal-row-branch",
												children: session.branch
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "nh-resume-id",
												children: session.id.slice(0, 8)
											}),
											session.open && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
												tone: "warning",
												children: t("terminalOpen")
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "nh-picker-check",
										children: checked && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutlineRegular, {})
									})
								]
							}, session.id);
						})
					}),
					choice && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Checkbox, {
							checked: fork || forced,
							disabled: forced,
							onChange: setFork,
							label: t("terminalFork")
						}),
						forced && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "nh-terminal-warning",
							children: t("terminalForkForced")
						}),
						!forced && !fork && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "nh-resume-note",
							children: t("terminalDirect")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "nh-resume-note",
							children: t("terminalHistory")
						})
					] }),
					error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "nh-picker-error",
						role: "alert",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: error })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "nh-terminal-actions",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "primary",
							size: "sm",
							disabled: !choice || busy,
							onClick: () => void confirm(),
							children: t("terminalConfirm")
						})
					})
				]
			}), document.body)
		]
	});
}

// src/client/index.ts
const NS = "nativeHarness";
const inject = [
	"slots",
	"remote",
	"locale",
	"sessions",
	"inputTriggers",
	"modelDirectories"
];
/** dsh's permission catalog and command path, for the seat of ordinary sessions. */
function dshPermissions(ctx) {
	let value = null;
	let epoch = 0;
	let retry;
	const listeners = /* @__PURE__ */ new Set();
	const remote = ctx.remote;
	const publish = (next) => {
		value = next;
		for (const listener of listeners) listener();
	};
	const read = (attempt = 0) => {
		clearTimeout(retry);
		const mine = ++epoch;
		remote.permissionPresets.catalog().then((result) => {
			if (mine !== epoch) return;
			if (result.ok && result.value) publish(result.value);
			else throw new Error("permission catalog unavailable");
		}).catch(() => {
			if (mine === epoch && attempt < 6) retry = setTimeout(() => read(attempt + 1), 500 * 2 ** attempt);
		});
	};
	ctx.effect(() => remote.$on("permission-presets/catalog-changed", () => read()));
	ctx.on("connection/reset", () => {
		publish(null);
		read();
	});
	ctx.effect(() => () => clearTimeout(retry));
	read();
	return {
		catalog: {
			subscribe(listener) {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
			getSnapshot: () => value
		},
		async select(sessionId, preset) {
			const live = ctx.sessions.binding(sessionId)?.session;
			if (!live) throw new Error("this session is not materialized yet");
			const result = await live.command(`/permission ${preset}`);
			if (!result.ok) throw new Error(result.error.message);
		}
	};
}
/** agent-team's Remote while its client face is mounted; without it the menu shows no team switch. */
function teamPort(ctx) {
	let value = null;
	const listeners = /* @__PURE__ */ new Set();
	const publish = (next) => {
		value = next;
		for (const listener of listeners) listener();
	};
	ctx.inject(["remote.agentTeams"], (scope) => {
		const remote = scope.remote;
		publish({ async setEnabled(sessionId, enabled) {
			const result = await remote.agentTeams.setEnabled(sessionId, enabled);
			if (!result.ok) throw new Error(result.error.message);
		} });
		scope.effect(() => () => publish(null));
	});
	return {
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		getSnapshot: () => value
	};
}
/** The configured `providerIcons`, read once per connection; empty until read or when the read fails. */
function configuredIcons(ctx, actions) {
	let value = {};
	const listeners = /* @__PURE__ */ new Set();
	const read = () => void actions.icons().then((next) => {
		value = next;
		for (const listener of listeners) listener();
	}).catch(() => void 0);
	ctx.on("connection/reset", read);
	read();
	return {
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		getSnapshot: () => value
	};
}
async function apply(ctx) {
	ctx.effect(() => ctx.locale.register(NS, {
		zh,
		en
	}));
	const t = ctx.locale.bind(NS);
	ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
		name: "tool.call.toolview",
		key: ACTIVITY_TOOL,
		locale: NS
	}, ActivityView));
	await ctx.remote.$mount(REMOTE);
	ctx.inject([
		"remote.nativeHarness",
		"remote.permissionPresets",
		"remote.session"
	], (child) => {
		const actions = nativeActions(child.remote.nativeHarness);
		const harnessOf = (sessionId) => harnessOfPreset(child.sessions.list.getSnapshot().byId[sessionId]?.projectionValues?.agentPreset);
		for (const source of commandSources(actions, harnessOf, t)) child.effect(() => child.inputTriggers.registerSource(source));
		const dsh = dshPermissions(child);
		const team = teamPort(child);
		const views = createViews(actions);
		const icons = configuredIcons(child, actions);
		child.slots.inject("conversation.input.model", () => child.slots.register({
			name: "conversation.input.model",
			priority: -10,
			locale: NS,
			inject: () => ({
				views,
				directories: child.modelDirectories,
				team,
				icons
			})
		}, ModelSeat));
		child.slots.inject("conversation.input.permission", () => child.slots.register({
			name: "conversation.input.permission",
			priority: -10,
			locale: NS,
			inject: () => ({
				views,
				dsh
			})
		}, PermissionSeat));
		child.slots.inject("conversation.input.right", () => child.slots.register({
			name: "conversation.input.right",
			id: "native-harness-fast",
			order: 100,
			locale: NS,
			inject: () => ({ views })
		}, FastToggle));
		child.slots.inject("conversation.composer.dock", () => child.slots.register({
			name: "conversation.composer.dock",
			id: "native-harness-tasks",
			order: 2,
			locale: NS,
			inject: () => ({ actions })
		}, BackgroundTasks));
		child.slots.inject("conversation.session.header.actions", () => child.slots.register({
			name: "conversation.session.header.actions",
			id: "native-harness-resume",
			order: -9,
			locale: NS,
			inject: () => ({ actions })
		}, ResumeAction));
		child.slots.inject("sidebar.session.row.leading", () => child.slots.register({
			name: "sidebar.session.row.leading",
			id: "native-harness",
			order: 21,
			inject: () => ({ sessions: child.sessions.list })
		}, SessionMark));
		child.slots.inject("conversation.hero.options", () => child.slots.register({
			name: "conversation.hero.options",
			id: "native-harness-terminal",
			locale: NS,
			inject: () => ({
				actions,
				views
			})
		}, TerminalResume));
	});
}

exports.apply = apply;
exports.inject = inject;
return module.exports; } });
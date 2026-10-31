window.__ModuleLoader__.load({ id: "dsh-better-providers", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
let zod = require("zod");
let react = require("react");
let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
let react_jsx_runtime = require("react/jsx-runtime");

// src/shared/ids.ts
/**
* Names shared by the Host and browser halves: the package, its rows, and the
* service each row provides (which is also the row's Remote namespace).
*/
const PACKAGE = "dsh-better-providers";
/** Parts that can be switched off one by one; the main row switches them all. */
const PARTS = [
	"oauth",
	"quota",
	"models",
	"codexFast"
];
/** Row ids as written in cordis.patch.yml; a part's row id is also its settings namespace. */
const ROW = {
	main: "better-providers",
	oauth: "better-providers-oauth",
	quota: "better-providers-quota",
	models: "better-providers-models",
	codexFast: "better-providers-codex-fast"
};
/** Cordis service keys; each also names the row's Remote namespace. */
const SERVICE = {
	main: "betterProviders",
	oauth: "betterProvidersOauth",
	quota: "betterProvidersQuota",
	models: "betterProvidersModels",
	codexFast: "betterProvidersCodexFast"
};
/** Typert takes one registration per package and face, so each row registers under its own module specifier. */
const MODULE = {
	main: PACKAGE,
	oauth: `${PACKAGE}/oauth`,
	quota: `${PACKAGE}/quota`,
	models: `${PACKAGE}/models`,
	codexFast: `${PACKAGE}/codex-fast`
};
/** The settings namespace and credential scope of dsh's built-in pi-ai providers. */
const PI_AI = "llm-pi-ai";
/** A pi-ai provider route that can address a credential record (`llm-pi-ai/<provider>`). */
const providerId = zod.z.string().regex(/^[a-z][a-z0-9-]*$/).max(64);
const sessionId = zod.z.string().min(1).max(512);
const modelId = zod.z.string().min(1).max(200);
/** Whether a route name can address a credential record; llm-pi-ai stores no sign-in for any other. */
function isCredentialRoute(provider) {
	return providerId.safeParse(provider).success;
}

// src/shared/remote.ts
/**
* Describe a row's Remote methods.
* @param pkg - the module that owns them (one Typert registration per module and face).
* @param namespace - the wire namespace, which is also the Host service key.
* @param methods - method specs by method name.
*/
function defineRemote(pkg, namespace, methods) {
	return {
		package: pkg,
		descriptors: Object.entries(methods).map(([method, spec]) => {
			const id = `${pkg}#${namespace}/${method}`;
			return {
				id,
				service: namespace,
				namespace,
				method,
				invocation: { kind: "direct" },
				parameters: spec.params.map(([name, schema]) => ({
					name,
					wire: name,
					source: "json",
					codec: {
						mode: "strict",
						typeSymbol: `${id}:${name}`,
						create: () => schema
					}
				})),
				result: { mode: "src-json" },
				...spec.stream === true ? { mode: "stream" } : {},
				...spec.signal === true ? { cancellation: { parameter: "signal" } } : {}
			};
		})
	};
}

// src/shared/main.wire.ts
const NO_PARTS = Object.freeze(Object.fromEntries(PARTS.map((part) => [part, false])));
const MAIN_REMOTE = defineRemote(MODULE.main, SERVICE.main, { watchParts: {
	params: [],
	stream: true,
	signal: true
} });

// src/shared/models.wire.ts
/**
* The models row's Remote contract: refresh a built-in pi-ai route's model list
* from the newest pi-ai catalog. A preview lists what changed; applying it writes
* the chosen list into the route's settings.
*/
/** Where a route's models are read from: `https://<source>/<route>` answers pi-ai's newest catalog of it. */
const CATALOG_SOURCE = "pi.dev/api/models/providers";
const ids = zod.z.array(modelId).max(1e3);
const MODELS_REMOTE = defineRemote(MODULE.models, SERVICE.models, {
	preview: {
		params: [["provider", providerId]],
		signal: true
	},
	apply: { params: [["previewId", zod.z.uuid()], ["choice", zod.z.strictObject({
		add: ids,
		keep: ids
	})]] }
});

// src/shared/oauth.wire.ts
/** The oauth row's Remote contract: account sign-in of pi-ai provider routes, relayed to the Models page. */
const OAUTH_REMOTE = defineRemote(MODULE.oauth, SERVICE.oauth, {
	watch: {
		params: [["provider", providerId]],
		stream: true,
		signal: true
	},
	begin: {
		params: [["provider", providerId], ["method", zod.z.string().min(1).max(64)]],
		signal: true
	},
	answer: { params: [
		["provider", providerId],
		["promptId", zod.z.string().min(1).max(64)],
		["value", zod.z.string().max(4096)]
	] },
	cancel: { params: [["provider", providerId]] },
	signOut: { params: [["provider", providerId]] }
});

// src/shared/quota.wire.ts
/** The quota row's Remote contract: subscription usage of signed-in pi-ai provider routes. */
/** Routes whose provider reports subscription usage for an account sign-in. */
const QUOTA_PROVIDERS = ["openai-codex", "xai"];
function hasQuota(provider) {
	return QUOTA_PROVIDERS.includes(provider);
}
/** Seconds between reads while a usage view is open: the row's `quotaRefreshSeconds` setting. */
const REFRESH_SECONDS = {
	min: 15,
	max: 3600,
	initial: 60
};
const token = zod.z.string().min(1).max(200);
const redemption = zod.z.strictObject({
	account: token,
	card: token,
	request: zod.z.uuid()
});
const QUOTA_REMOTE = defineRemote(MODULE.quota, SERVICE.quota, {
	watch: {
		params: [["provider", providerId]],
		stream: true,
		signal: true
	},
	redeem: { params: [["provider", providerId], ["redemption", redemption]] }
});

// src/client/card-host.tsx
const CARD_SLOT = "better-providers.provider-card";
function CardHost({ provider, configured, keyConfigured, renderSlot }) {
	return renderSlot(CARD_SLOT, {
		provider,
		configured,
		keyConfigured
	});
}
/** Take the pi-ai card seat; returns the disposer. */
function registerCardHost(ctx) {
	return ctx.slots.inject("settings.models.provider-card", () => ctx.slots.register({
		name: "settings.models.provider-card",
		key: PI_AI,
		children: { [CARD_SLOT]: {
			kind: "list",
			scope: "root"
		} }
	}, CardHost));
}

// src/client/kit/follow.ts
const defaultBackoff = (attempt) => Math.min(3e4, 500 * 2 ** attempt);
const defaultTimers = {
	set: (fn, ms) => setTimeout(fn, ms),
	clear: (handle) => {
		clearTimeout(handle);
	}
};
function follow(open, options = {}) {
	const backoff = options.backoff ?? defaultBackoff;
	const timers = options.timers ?? defaultTimers;
	const listeners = /* @__PURE__ */ new Set();
	const lifetime = new AbortController();
	let value;
	let disconnected = false;
	let timer;
	const notify = () => {
		for (const listener of [...listeners]) listener();
	};
	async function run(attempt) {
		if (lifetime.signal.aborted) return;
		let next = attempt;
		try {
			for await (const item of open(lifetime.signal)) {
				value = item;
				disconnected = false;
				next = 0;
				notify();
			}
		} catch {}
		if (lifetime.signal.aborted) return;
		if (!disconnected) {
			disconnected = true;
			notify();
		}
		timer = timers.set(() => {
			run(next + 1);
		}, backoff(next));
	}
	run(0);
	return {
		get: () => value,
		lost: () => disconnected,
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		dispose() {
			lifetime.abort();
			if (timer !== void 0) timers.clear(timer);
			listeners.clear();
		}
	};
}

// src/client/kit/gate.ts
function gateParts(presence, parts, composites = [], onError = (error) => {
	console.error("[dsh-better-providers]", error);
}) {
	const shared = composites.map((composite) => ({
		wanted: (p) => composite.when(p),
		register: composite.register
	}));
	const own = Object.keys(parts).map((part) => ({
		wanted: (p) => p[part] === true,
		register: parts[part]
	}));
	const up = (slot, now) => {
		if (slot.dispose !== void 0 || !slot.wanted(now)) return;
		try {
			slot.dispose = slot.register();
		} catch (error) {
			onError(error);
		}
	};
	const down = (slot, now) => {
		if (slot.dispose === void 0 || now !== void 0 && slot.wanted(now)) return;
		const dispose = slot.dispose;
		slot.dispose = void 0;
		try {
			dispose();
		} catch (error) {
			onError(error);
		}
	};
	const reconcile = () => {
		const now = presence.get() ?? {};
		for (const slot of own) down(slot, now);
		for (const slot of shared) down(slot, now);
		for (const slot of shared) up(slot, now);
		for (const slot of own) up(slot, now);
	};
	const unsubscribe = presence.subscribe(reconcile);
	reconcile();
	return () => {
		unsubscribe();
		for (const slot of own) down(slot, void 0);
		for (const slot of shared) down(slot, void 0);
	};
}

// src/client/models/locales.ts
/** Copy of the models part: the refresh row on provider cards and its preview dialog. */
const NS$2 = "better-providers-models";
const zh$2 = {
	title: "刷新模型",
	source: "模型来源：",
	refresh: "刷新模型",
	dialogTitle: "刷新 {provider} 的模型",
	loading: "正在从 pi.dev 拉取模型列表…",
	"group.added": "新增 {count}",
	"group.removed": "已下架 {count}",
	"group.skipped": "无法添加 {count}",
	"group.unchanged": "未变化 {count}",
	"hint.removed": "pi.dev 上已经没有这些模型，勾选的会保留在列表里。",
	inherited: "内置目录里已有，沿用目录里的全部信息",
	"skip.api": "协议和这个服务商不同",
	"skip.endpoint": "接口地址和这个服务商不同",
	"skip.invalid": "目录数据不完整",
	showUnchanged: "展开未变化的模型",
	hideUnchanged: "收起未变化的模型",
	upToDate: "模型列表和 pi.dev 上的一致。",
	firstWrite: "这是当前 profile 第一次写入服务商设置：所有共享的服务商配置会一起复制进 profile，之后修改共享配置不再影响这个 profile。",
	"blocked.expression": "这个服务商的设置用了 !!js 表达式，不能在这里写入，请直接改 cordis.patch.yml。",
	"blocked.overridden": "llm-pi-ai 的设置被家目录的 cordis.patch.yml 或命令行参数覆盖，不能在这里写入。",
	apply: "写入",
	cancel: "取消",
	close: "关闭",
	retry: "重试",
	"outcome.applied": "模型列表已更新。",
	"outcome.unchanged": "没有需要写入的更改。",
	"outcome.stale": "设置在预览后有改动，已重新对比。",
	"outcome.rejected": "dsh 拒绝了新的设置：{detail}",
	"refused.bad-provider": "这个服务商不在 pi-ai 内置目录里，无法刷新。",
	"refused.unsupported": "这个服务商不在 pi-ai 内置目录里，无法刷新。",
	"refused.pi-ai-mismatch": "插件和 dsh 加载的不是同一份 pi-ai，无法刷新。",
	"refused.bad-choice": "勾选的模型和预览对不上，请重新打开。",
	"refused.catalog-unreachable": "无法连接 pi.dev，请稍后重试。",
	"refused.catalog-unknown": "pi.dev 上没有这个服务商的目录。",
	"refused.catalog-invalid": "pi.dev 返回的目录无法识别。",
	failed: "刷新失败：{message}"
};
const en$2 = {
	title: "Refresh models",
	source: "Source: ",
	refresh: "Refresh models",
	dialogTitle: "Refresh {provider} models",
	loading: "Fetching the model list from pi.dev…",
	"group.added": "New {count}",
	"group.removed": "Withdrawn {count}",
	"group.skipped": "Cannot be added {count}",
	"group.unchanged": "Unchanged {count}",
	"hint.removed": "pi.dev no longer lists these models; checked ones stay in the list.",
	inherited: "In the built-in catalog; keeps everything the catalog knows",
	"skip.api": "Uses another protocol than this provider",
	"skip.endpoint": "Uses another endpoint than this provider",
	"skip.invalid": "Incomplete catalog data",
	showUnchanged: "Show unchanged models",
	hideUnchanged: "Hide unchanged models",
	upToDate: "The model list matches pi.dev.",
	firstWrite: "This is the first provider setting this profile writes: every shared provider configuration is copied into the profile, and later changes to the shared configuration no longer reach it.",
	"blocked.expression": "This provider's settings use a !!js expression and cannot be written here; edit cordis.patch.yml instead.",
	"blocked.overridden": "The llm-pi-ai settings are overridden by the home cordis.patch.yml or a command-line option and cannot be written here.",
	apply: "Write",
	cancel: "Cancel",
	close: "Close",
	retry: "Retry",
	"outcome.applied": "The model list is updated.",
	"outcome.unchanged": "There is nothing to write.",
	"outcome.stale": "The settings changed after the preview; compared again.",
	"outcome.rejected": "dsh refused the new settings: {detail}",
	"refused.bad-provider": "This provider is not in pi-ai's built-in catalog and cannot be refreshed.",
	"refused.unsupported": "This provider is not in pi-ai's built-in catalog and cannot be refreshed.",
	"refused.pi-ai-mismatch": "This plugin and dsh load different copies of pi-ai, so models cannot be refreshed.",
	"refused.bad-choice": "The checked models do not match the preview; open it again.",
	"refused.catalog-unreachable": "pi.dev cannot be reached; try again later.",
	"refused.catalog-unknown": "pi.dev has no catalog for this provider.",
	"refused.catalog-invalid": "pi.dev answered with a catalog that cannot be read.",
	failed: "Refresh failed: {message}"
};

// src/client/kit/settle.ts
async function settle(call) {
	try {
		const result = await call();
		if (result.ok) return {
			ok: true,
			value: result.value
		};
		return result.error.code === "gateway/bad-request" ? {
			ok: false,
			refused: result.error.message
		} : {
			ok: false,
			failed: result.error.message
		};
	} catch (error) {
		return {
			ok: false,
			failed: error instanceof Error ? error.message : String(error)
		};
	}
}

// src/client/models/model.ts
/** Every new model added, every withdrawn one kept. */
function defaultChoice(preview) {
	return {
		add: preview.added.map((model) => model.id),
		keep: preview.removed.map((model) => model.id)
	};
}
/** The choice with one model of a group checked or unchecked, in the preview's order. */
function toggle(preview, choice, group, id, on) {
	const field = group === "added" ? "add" : "keep";
	const listed = group === "added" ? preview.added : preview.removed;
	const chosen = new Set(choice[field]);
	if (on) chosen.add(id);
	else chosen.delete(id);
	return {
		...choice,
		[field]: listed.map((model) => model.id).filter((model) => chosen.has(model))
	};
}
function changes(preview, choice) {
	return choice.add.length > 0 || preview.removed.some((model) => !choice.keep.includes(model.id));
}
function describePreview(preview, choice, t) {
	const notes = [];
	const offersChange = preview.added.length > 0 || preview.removed.length > 0;
	if (preview.blocked !== void 0) notes.push({
		tone: "error",
		text: t(`blocked.${preview.blocked}`)
	});
	else if (offersChange && preview.firstWrite) notes.push({
		tone: "warn",
		text: t("firstWrite")
	});
	if (!offersChange) notes.push({
		tone: "hint",
		text: t("upToDate")
	});
	const groups = [];
	const add = (kind, items, hint) => {
		if (items.length === 0) return;
		groups.push({
			kind,
			heading: t(`group.${kind}`, { count: items.length }),
			...hint === void 0 ? {} : { hint },
			items,
			folded: kind === "unchanged"
		});
	};
	add("added", preview.added.map((model) => ({
		id: model.id,
		name: model.name,
		details: model.inherited ? [t("inherited")] : [],
		checked: choice.add.includes(model.id)
	})));
	add("removed", preview.removed.map((model) => ({
		id: model.id,
		name: model.name,
		details: [],
		checked: choice.keep.includes(model.id)
	})), t("hint.removed"));
	add("skipped", preview.skipped.map((model) => ({
		id: model.id,
		name: model.name ?? model.id,
		details: [t(`skip.${model.reason}`)]
	})));
	add("unchanged", preview.unchanged.map((model) => ({
		id: model.id,
		name: model.name,
		details: []
	})));
	const canWrite = preview.blocked === void 0;
	return {
		notes,
		groups,
		offersChange,
		canWrite,
		canApply: canWrite && changes(preview, choice)
	};
}
function outcomeEffect(outcome, t) {
	switch (outcome.status) {
		case "applied":
		case "unchanged": return {
			kind: "close",
			notice: t(`outcome.${outcome.status}`)
		};
		case "stale":
		case "expired": return {
			kind: "preview-again",
			notice: t("outcome.stale")
		};
		case "blocked": return {
			kind: "error",
			text: t(`blocked.${outcome.reason}`)
		};
		case "rejected": return {
			kind: "error",
			text: t("outcome.rejected", { detail: outcome.detail })
		};
	}
}
/** Why a Remote call failed, worded. */
function failureText(result, t) {
	return "refused" in result ? t(`refused.${result.refused}`) : t("failed", { message: result.failed });
}

// \0dsh-css:src/client/models/RefreshSection.module.css.mjs
const tag$2 = "dsh-better-providers/models/RefreshSection.module.css";
if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${tag$2}"]`) === null) {
	const style = document.createElement("style");
	style.dataset.plugin = "dsh-better-providers";
	style.dataset.pluginCss = tag$2;
	style.textContent = "._6jk5xq_panel{border-top:.5px solid var(--dsw-alias-border-l2);min-width:0;color:var(--dsw-alias-label-primary);flex-direction:column;gap:10px;padding-top:12px;font-size:13px;line-height:20px;display:flex}._6jk5xq_header{flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px 16px;display:flex}._6jk5xq_hint{color:var(--dsw-alias-label-secondary);margin:0}._6jk5xq_source{min-width:0;color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;flex:1 1 0;overflow:hidden}._6jk5xq_url{font-family:var(--ds-font-family-code);font-size:12px}._6jk5xq_warn{color:var(--dsw-alias-state-warn-primary);margin:0}._6jk5xq_error{color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere;margin:0}._6jk5xq_description{color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere;margin:0;font-size:12px;line-height:18px}._6jk5xq_modal{width:min(520px,100%)}._6jk5xq_dialog{min-width:0;max-height:min(60vh,560px);color:var(--dsw-alias-label-primary);flex-direction:column;gap:12px;font-size:13px;line-height:20px;display:flex;overflow-y:auto}._6jk5xq_groups{border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-module-platform);flex-direction:column;gap:12px;min-width:0;padding:12px 14px;display:flex}._6jk5xq_group{flex-direction:column;gap:4px;min-width:0;display:flex}._6jk5xq_group+._6jk5xq_group{border-top:.5px solid var(--dsw-alias-border-l2);padding-top:12px}._6jk5xq_label{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500;line-height:18px}._6jk5xq_items{flex-direction:column;margin:0;padding:0;list-style:none;display:flex}._6jk5xq_item{flex-direction:column;gap:2px;min-width:0;padding:8px 0;display:flex}._6jk5xq_item+._6jk5xq_item{border-top:1px dashed var(--dsw-alias-border-l3)}._6jk5xq_itemLine{flex-wrap:wrap;align-items:baseline;gap:4px 8px;min-width:0;display:flex}._6jk5xq_itemName{font-weight:500}label._6jk5xq_itemLine{cursor:pointer}label._6jk5xq_itemLine:has(._6jk5xq_check:disabled){cursor:default}._6jk5xq_check{width:14px;height:14px;accent-color:var(--dsw-alias-brand-primary);cursor:inherit;flex:none;align-self:center;margin:0}._6jk5xq_check:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}._6jk5xq_check:disabled{opacity:.5}._6jk5xq_item[data-checkable]>._6jk5xq_description{padding-left:22px}._6jk5xq_itemId{color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code);overflow-wrap:anywhere;font-size:12px}._6jk5xq_toggle{width:100%;height:20px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;border-radius:4px;flex:none;align-items:center;gap:8px;padding:0;display:flex}._6jk5xq_toggle:before,._6jk5xq_toggle:after{content:\"\";border-top:1px dashed var(--dsw-alias-border-l3);flex:1}._6jk5xq_toggle:hover,._6jk5xq_toggle:focus-visible{color:var(--dsw-alias-label-primary)}._6jk5xq_toggle:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}._6jk5xq_chevron{transition:transform .16s;display:inline-flex}._6jk5xq_toggle[aria-expanded=true] ._6jk5xq_chevron{transform:rotate(180deg)}@media (prefers-reduced-motion:reduce){._6jk5xq_chevron{transition:none}}@media (pointer:coarse){._6jk5xq_panel button{min-height:44px}}";
	document.head.appendChild(style);
}
var RefreshSection_module_css_default = {
	"check": "_6jk5xq_check",
	"chevron": "_6jk5xq_chevron",
	"description": "_6jk5xq_description",
	"dialog": "_6jk5xq_dialog",
	"error": "_6jk5xq_error",
	"group": "_6jk5xq_group",
	"groups": "_6jk5xq_groups",
	"header": "_6jk5xq_header",
	"hint": "_6jk5xq_hint",
	"item": "_6jk5xq_item",
	"itemId": "_6jk5xq_itemId",
	"itemLine": "_6jk5xq_itemLine",
	"itemName": "_6jk5xq_itemName",
	"items": "_6jk5xq_items",
	"label": "_6jk5xq_label",
	"modal": "_6jk5xq_modal",
	"panel": "_6jk5xq_panel",
	"source": "_6jk5xq_source",
	"toggle": "_6jk5xq_toggle",
	"url": "_6jk5xq_url",
	"warn": "_6jk5xq_warn"
};

// src/client/models/RefreshSection.tsx
/**
* Model refresh on a built-in pi-ai provider card: one row naming where the
* models are read from, with a button that opens a dialog comparing the route
* with pi-ai's newest catalog there. The new models
* are checked to add and the withdrawn ones to keep; writing applies the choice.
* What shows when is decided by `describePreview`; this file lays it out.
*/
function RefreshSection(props) {
	const { provider, configured } = props;
	if (provider.declared === true || !configured) return null;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Section$2, { ...props }, provider.provider);
}
function Section$2({ provider, remote, t }) {
	const [open, setOpen] = (0, react.useState)(false);
	const [notice, setNotice] = (0, react.useState)();
	const source = `${CATALOG_SOURCE}/${provider.provider}`;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		className: RefreshSection_module_css_default["panel"],
		"aria-label": t("title"),
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: RefreshSection_module_css_default["header"],
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: RefreshSection_module_css_default["source"],
					title: `https://${source}`,
					children: [t("source"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
						className: RefreshSection_module_css_default["url"],
						children: source
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					size: "sm",
					onClick: () => {
						setNotice(void 0);
						setOpen(true);
					},
					children: t("refresh")
				})]
			}),
			notice !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: RefreshSection_module_css_default["hint"],
				role: "status",
				children: notice
			}),
			open && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RefreshDialog, {
				provider: provider.provider,
				name: provider.displayName,
				remote,
				t,
				onClose: (next) => {
					setOpen(false);
					setNotice(next);
				}
			})
		]
	});
}
function RefreshDialog({ provider, name, remote, t, onClose }) {
	const [state, setState] = (0, react.useState)({ phase: "loading" });
	const [note, setNote] = (0, react.useState)();
	const [busy, setBusy] = (0, react.useState)(false);
	const [round, setRound] = (0, react.useState)(0);
	(0, react.useEffect)(() => {
		const controller = new AbortController();
		setState({ phase: "loading" });
		settle(() => remote.preview(provider, controller.signal)).then((result) => {
			if (controller.signal.aborted) return;
			setState(result.ok ? {
				phase: "ready",
				preview: result.value,
				choice: defaultChoice(result.value)
			} : {
				phase: "failed",
				text: failureText(result, t)
			});
		});
		return () => {
			controller.abort();
		};
	}, [provider, round]);
	const shown = state.phase === "ready" ? describePreview(state.preview, state.choice, t) : void 0;
	const apply = () => {
		if (state.phase !== "ready") return;
		setBusy(true);
		setNote(void 0);
		settle(() => remote.apply(state.preview.id, state.choice)).then((result) => {
			setBusy(false);
			if (!result.ok) {
				setNote({
					tone: "error",
					text: failureText(result, t)
				});
				return;
			}
			const effect = outcomeEffect(result.value, t);
			if (effect.kind === "close") onClose(effect.notice);
			else if (effect.kind === "preview-again") {
				setNote({
					tone: "hint",
					text: effect.notice
				});
				setRound((value) => value + 1);
			} else setNote({
				tone: "error",
				text: effect.text
			});
		});
	};
	const check = (group, id, on) => {
		setState((current) => current.phase === "ready" ? {
			...current,
			choice: toggle(current.preview, current.choice, group, id, on)
		} : current);
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
		open: true,
		className: RefreshSection_module_css_default["modal"],
		title: t("dialogTitle", { provider: name }),
		closeLabel: t("cancel"),
		onClose: () => {
			onClose();
		},
		footer: shown?.offersChange === false ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
			variant: "outline",
			onClick: () => {
				onClose();
			},
			children: t("close")
		}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
			variant: "outline",
			onClick: () => {
				onClose();
			},
			children: t("cancel")
		}), state.phase === "failed" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
			variant: "primary",
			onClick: () => {
				setNote(void 0);
				setRound((value) => value + 1);
			},
			children: t("retry")
		}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
			variant: "primary",
			disabled: busy || shown?.canApply !== true,
			onClick: apply,
			children: t("apply")
		})] }),
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: RefreshSection_module_css_default["dialog"],
			children: [
				state.phase === "loading" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: RefreshSection_module_css_default["hint"],
					role: "status",
					children: t("loading")
				}),
				state.phase === "failed" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: RefreshSection_module_css_default["error"],
					role: "alert",
					children: state.text
				}),
				note !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: RefreshSection_module_css_default[note.tone],
					role: note.tone === "error" ? "alert" : "status",
					children: note.text
				}),
				shown !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					shown.notes.map((line) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: RefreshSection_module_css_default[line.tone],
						children: line.text
					}, line.text)),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Groups, {
						groups: shown.groups.filter((group) => !group.folded),
						disabled: busy || !shown.canWrite,
						onCheck: check
					}),
					shown.groups.some((group) => group.folded) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Folded, {
						t,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Groups, {
							groups: shown.groups.filter((group) => group.folded),
							disabled: busy || !shown.canWrite,
							onCheck: check
						})
					})
				] })
			]
		})
	});
}
/** The groups in a tinted panel: a solid line between groups, a dashed one between models. */
function Groups({ groups, disabled, onCheck }) {
	if (groups.length === 0) return null;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		className: RefreshSection_module_css_default["groups"],
		children: groups.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: RefreshSection_module_css_default["group"],
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: RefreshSection_module_css_default["label"],
					children: group.heading
				}),
				group.hint !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: RefreshSection_module_css_default["description"],
					children: group.hint
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
					className: RefreshSection_module_css_default["items"],
					children: group.items.map((item) => {
						const kind = group.kind;
						const text = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: RefreshSection_module_css_default["itemName"],
							children: item.name
						}), item.name !== item.id && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
							className: RefreshSection_module_css_default["itemId"],
							children: item.id
						})] });
						const checkable = item.checked !== void 0 && (kind === "added" || kind === "removed");
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
							className: RefreshSection_module_css_default["item"],
							"data-checkable": checkable || void 0,
							children: [checkable ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: RefreshSection_module_css_default["itemLine"],
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									className: RefreshSection_module_css_default["check"],
									checked: item.checked,
									disabled,
									onChange: (event) => {
										onCheck(kind, item.id, event.target.checked);
									}
								}), text]
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: RefreshSection_module_css_default["itemLine"],
								children: text
							}), item.details.map((detail) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: RefreshSection_module_css_default["description"],
								children: detail
							}, detail))]
						}, item.id);
					})
				})
			]
		}, group.kind))
	});
}
/** A dashed divider with a chevron in its middle; the chevron turns over when the folded groups open. */
function Folded({ children, t }) {
	const [open, setOpen] = (0, react.useState)(false);
	const id = (0, react.useId)();
	const label = t(open ? "hideUnchanged" : "showUnchanged");
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
		type: "button",
		className: RefreshSection_module_css_default["toggle"],
		"aria-expanded": open,
		"aria-controls": id,
		"aria-label": label,
		title: label,
		onClick: () => {
			setOpen((value) => !value);
		},
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			className: RefreshSection_module_css_default["chevron"],
			"aria-hidden": "true",
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { size: 14 })
		})
	}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		id,
		hidden: !open,
		children: open && children
	})] });
}

// src/client/models/index.ts
function registerModelsLocale(ctx) {
	ctx.effect(() => ctx.locale.register(NS$2, {
		zh: zh$2,
		en: en$2
	}), `${NS$2}: dictionaries`);
}
/** Add the refresh row to the pi-ai cards, after sign-in and usage; returns the disposer. */
function registerModels(ctx) {
	const remote = ctx.remote.betterProvidersModels;
	return ctx.slots.inject(CARD_SLOT, () => ctx.slots.register({
		name: CARD_SLOT,
		id: ROW.models,
		order: 20,
		locale: NS$2,
		inject: () => ({ remote })
	}, RefreshSection));
}

// src/client/oauth/locales.ts
/** Copy of the oauth part. */
const NS$1 = "better-providers-oauth";
const zh$1 = {
	title: "账号登录",
	signedIn: "已登录",
	signedInPlan: "已登录 · {plan}",
	signedOut: "未登录",
	signingIn: "登录中…",
	signInWith: "使用 {method} 登录",
	signInAgain: "重新登录",
	signInAgainWith: "重新登录 {method}",
	signOut: "退出登录",
	cancel: "取消",
	continue: "继续",
	preparing: "正在准备登录…",
	method: "登录方式",
	page: "登录页面",
	code: "验证码",
	answer: "手动完成",
	details: "补充信息",
	openPage: "打开登录页面",
	openVerification: "打开验证页面",
	copyLink: "复制链接",
	copyCode: "复制验证码",
	copied: "已复制",
	copyFailed: "复制失败，请手动复制。",
	readOnly: "凭据存储为只读，暂时无法登录或退出登录。",
	unusedAccount: "已登录的账号不会被使用。",
	cancelled: "登录已取消。",
	failed: "登录失败：{message}",
	streamLost: "与 dsh 的连接中断，正在重连…",
	"refused.no-flow": "这个服务商不支持账号登录。",
	"refused.unknown-method": "不支持这种登录方式。",
	"refused.in-flight": "已经有一个登录在进行中。",
	"refused.no-prompt": "这个问题已经结束或被替换，请看最新的提示。",
	"refused.invalid-option": "请选择列出的选项。",
	"refused.not-writable": "凭据存储为只读。",
	"refused.bad-provider": "这个服务商无法保存账号登录。",
	"flow.openBrowser": "在浏览器中打开登录页面并完成登录，完成后这里会自动更新。",
	"flow.openPage": "打开登录页面继续登录。",
	"flow.enterCode": "在验证页面输入下面的验证码完成登录。",
	"flow.pasteRedirect": "浏览器和 dsh 不在同一台机器上时，登录完成后浏览器会跳到一个打不开的地址，把这个地址（或授权码）粘贴到这里。",
	"flow.selectMethod": "选择 {provider} 的登录方式：",
	"flow.browser": "浏览器登录（推荐）",
	"flow.deviceCode": "设备码登录（在另一台设备上完成登录）",
	"flow.exchanging": "正在换取登录凭据…",
	"flow.waiting": "正在等待浏览器回调…",
	"flow.signingIn": "登录中…"
};
const en$1 = {
	title: "Account sign-in",
	signedIn: "Signed in",
	signedInPlan: "Signed in · {plan}",
	signedOut: "Not signed in",
	signingIn: "Signing in…",
	signInWith: "Sign in with {method}",
	signInAgain: "Sign in again",
	signInAgainWith: "Sign in again with {method}",
	signOut: "Sign out",
	cancel: "Cancel",
	continue: "Continue",
	preparing: "Preparing sign-in…",
	method: "Sign-in method",
	page: "Sign-in page",
	code: "Code",
	answer: "Finish manually",
	details: "Details needed",
	openPage: "Open sign-in page",
	openVerification: "Open verification page",
	copyLink: "Copy link",
	copyCode: "Copy code",
	copied: "Copied",
	copyFailed: "Could not copy; copy it manually.",
	readOnly: "Credential storage is read-only; signing in and out are unavailable.",
	unusedAccount: "The signed-in account is not used.",
	cancelled: "Sign-in cancelled.",
	failed: "Sign-in failed: {message}",
	streamLost: "Lost the connection to dsh; reconnecting…",
	"refused.no-flow": "This provider has no account sign-in.",
	"refused.unknown-method": "This sign-in method is not supported.",
	"refused.in-flight": "A sign-in is already running.",
	"refused.no-prompt": "That question has ended or been replaced; see the latest one.",
	"refused.invalid-option": "Choose one of the listed options.",
	"refused.not-writable": "Credential storage is read-only.",
	"refused.bad-provider": "This provider cannot store an account sign-in.",
	"flow.openBrowser": "Open the sign-in page and finish signing in in your browser; this updates on its own when you are done.",
	"flow.openPage": "Open the sign-in page to continue.",
	"flow.enterCode": "Enter the code below on the verification page to finish signing in.",
	"flow.pasteRedirect": "If your browser is not on the machine running dsh, it ends on a page that does not load: paste that address (or the authorization code) here.",
	"flow.selectMethod": "Choose how to sign in to {provider}:",
	"flow.browser": "Browser sign-in (recommended)",
	"flow.deviceCode": "Device code (finish on another device)",
	"flow.exchanging": "Exchanging the authorization for credentials…",
	"flow.waiting": "Waiting for the browser callback…",
	"flow.signingIn": "Signing in…"
};

// src/client/kit/use-followed.ts
/** Follow a Remote stream from a component: opened while `open` is given, reopened when `key` changes. */
const noSubscription = () => () => {};
function useFollowed(open, key) {
	const [followed, setFollowed] = (0, react.useState)();
	(0, react.useEffect)(() => {
		if (open === void 0) {
			setFollowed(void 0);
			return;
		}
		const next = follow(open);
		setFollowed(next);
		return () => {
			next.dispose();
		};
	}, [key, open !== void 0]);
	const subscribe = followed?.subscribe ?? noSubscription;
	return {
		value: (0, react.useSyncExternalStore)(subscribe, () => followed?.get()),
		lost: (0, react.useSyncExternalStore)(subscribe, () => followed?.lost() ?? false)
	};
}

// src/client/oauth/flow-text.ts
/** A question asking to paste the browser's final redirect (or the code) when the callback cannot reach dsh. */
const PASTE = /^Complete (login|sign-in) in your browser[,.].*paste/i;
const RULES = [
	[/^A browser window should open/i, (t) => t("flow.openBrowser")],
	[/^(Continue in your browser|Open this page to continue signing in)\.?$/i, (t) => t("flow.openPage")],
	[/^Enter this code on the verification page/i, (t) => t("flow.enterCode")],
	[PASTE, (t) => t("flow.pasteRedirect")],
	[/^Select (.+) login method:?$/i, (t, m) => t("flow.selectMethod", { provider: m[1] ?? "" })],
	[/^(Browser login \(default\)|Sign in with browser \(recommended\))$/i, (t) => t("flow.browser")],
	[/^(Device code login \(headless\)|Sign in with device code\b.*)$/i, (t) => t("flow.deviceCode")],
	[/^Exchanging authorization code/i, (t) => t("flow.exchanging")],
	[/^Listening for .*callback/i, (t) => t("flow.waiting")],
	[/^Signing in…?$/i, (t) => t("flow.signingIn")]
];
/** The field label of a flow's question: finishing by hand when it asks for the redirect, else a generic one. */
function promptLabel(message, t) {
	return PASTE.test(message) ? t("answer") : t("details");
}
function flowText(text, t) {
	for (const [pattern, render] of RULES) {
		const match = pattern.exec(text);
		if (match !== null) return render(t, match);
	}
	return text;
}
/** A notice link that is safe to open: http(s) only. */
function webUrl(value) {
	if (value === void 0) return void 0;
	try {
		const url = new URL(value);
		return url.protocol === "https:" || url.protocol === "http:" ? url.href : void 0;
	} catch {
		return;
	}
}

// src/client/plans.ts
function createPlanBoard() {
	let plans = {};
	const listeners = /* @__PURE__ */ new Set();
	return {
		getSnapshot: () => plans,
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		publish(provider, plan) {
			if (plans[provider] === plan) return;
			const { [provider]: _previous, ...rest } = plans;
			plans = plan === void 0 ? rest : {
				...rest,
				[provider]: plan
			};
			for (const listener of [...listeners]) listener();
		}
	};
}
/** Display names of plans as providers and tokens state them; an unknown one is shown capitalised. */
const NAMES = {
	free: "Free",
	go: "Go",
	plus: "Plus",
	pro: "Pro",
	team: "Team",
	business: "Business",
	enterprise: "Enterprise",
	edu: "Edu"
};
function planName(plan) {
	const id = plan.toLowerCase();
	if (Object.hasOwn(NAMES, id)) return NAMES[id];
	return plan.split(/[_\s-]+/).filter(Boolean).map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ");
}

// \0dsh-css:src/client/oauth/SignInSection.module.css.mjs
const tag$1 = "dsh-better-providers/oauth/SignInSection.module.css";
if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${tag$1}"]`) === null) {
	const style = document.createElement("style");
	style.dataset.plugin = "dsh-better-providers";
	style.dataset.pluginCss = tag$1;
	style.textContent = ".cP1WNa_panel{border-top:.5px solid var(--dsw-alias-border-l2);min-width:0;color:var(--dsw-alias-label-primary);flex-direction:column;gap:10px;padding-top:12px;font-size:13px;line-height:20px;display:flex}.cP1WNa_header{flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px 16px;display:flex}.cP1WNa_row{flex-wrap:wrap;align-items:center;gap:8px;display:flex}.cP1WNa_identity{align-items:center;gap:6px;min-width:0;display:inline-flex}.cP1WNa_title{font-weight:500}.cP1WNa_dot{box-sizing:border-box;background:var(--dsw-alias-state-error-primary);border-radius:50%;flex:none;width:8px;height:8px}.cP1WNa_dot[data-state=signedIn]{background:var(--dsw-alias-state-success-primary)}.cP1WNa_dot[data-state=signingIn]{background:var(--dsw-alias-state-warn-primary)}.cP1WNa_panel .cP1WNa_danger{color:var(--dsw-alias-state-error-primary)}.cP1WNa_panel .cP1WNa_danger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}.cP1WNa_hint{color:var(--dsw-alias-label-secondary);margin:0}.cP1WNa_error{color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere;margin:0}.cP1WNa_steps{border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-module-platform);flex-direction:column;gap:14px;min-width:0;padding:12px 14px;scroll-margin-bottom:16px;display:flex}.cP1WNa_field{flex-direction:column;gap:6px;min-width:0;margin:0;display:flex}.cP1WNa_inline{flex-wrap:wrap;justify-content:space-between;align-items:center;gap:6px 16px;display:flex}.cP1WNa_label{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500;line-height:18px}.cP1WNa_description{color:var(--dsw-alias-label-tertiary);white-space:pre-wrap;overflow-wrap:anywhere;margin:0;font-size:12px;line-height:18px}.cP1WNa_code{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);letter-spacing:.08em;user-select:all;align-items:center;height:28px;padding:0 10px;font-size:14px;font-weight:500;display:inline-flex}.cP1WNa_answer{align-items:center;gap:8px;display:flex}.cP1WNa_answer .cP1WNa_input{flex:auto;min-width:0}.cP1WNa_select{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-sm);appearance:none;background:var(--dsw-alias-bg-layer-1) url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5 6 7.5 9 4.5' stroke='%2381858C' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\") no-repeat right 10px center / 12px 12px;min-width:180px;max-width:280px;height:28px;color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;padding:0 30px 0 10px;font-size:12px;line-height:18px}.cP1WNa_select:focus{border-color:var(--dsw-alias-state-business-primary);outline:none}.cP1WNa_select:disabled{opacity:.4;cursor:default}@media (pointer:coarse){.cP1WNa_panel button,.cP1WNa_select{min-height:44px}}";
	document.head.appendChild(style);
}
var SignInSection_module_css_default = {
	"answer": "cP1WNa_answer",
	"code": "cP1WNa_code",
	"danger": "cP1WNa_danger",
	"description": "cP1WNa_description",
	"dot": "cP1WNa_dot",
	"error": "cP1WNa_error",
	"field": "cP1WNa_field",
	"header": "cP1WNa_header",
	"hint": "cP1WNa_hint",
	"identity": "cP1WNa_identity",
	"inline": "cP1WNa_inline",
	"input": "cP1WNa_input",
	"label": "cP1WNa_label",
	"panel": "cP1WNa_panel",
	"row": "cP1WNa_row",
	"select": "cP1WNa_select",
	"steps": "cP1WNa_steps",
	"title": "cP1WNa_title"
};

// src/client/oauth/SignInSection.tsx
/**
* Account sign-in on a built-in pi-ai provider card: a row under the card's own
* fields with the account status on the left and its actions on the right; a
* running sign-in shows its page, code and question below that row.
*/
function SignInSection(props) {
	const { provider } = props;
	if (provider.declared === true || !isCredentialRoute(provider.provider)) return null;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Section$1, { ...props }, provider.provider);
}
function failure(result, t) {
	if (result.ok) return void 0;
	return "refused" in result ? t(`refused.${result.refused}`) : t("failed", { message: result.failed });
}
function Section$1({ provider, remote, usePiAi, usePlans, t }) {
	const id = provider.provider;
	const apiKeyEnv = usePiAi((form) => form.value?.providers?.[id]?.apiKeyEnv);
	const reportedPlan = usePlans((plans) => plans[id]);
	const { value: view, lost } = useFollowed((signal) => remote.watch(id, signal), id);
	const [starting, setStarting] = (0, react.useState)(false);
	const [busy, setBusy] = (0, react.useState)(false);
	const [error, setError] = (0, react.useState)();
	const [cancelled, setCancelled] = (0, react.useState)(false);
	const [choice, setChoice] = (0, react.useState)();
	const [restartWith, setRestartWith] = (0, react.useState)();
	const attempt = (0, react.useRef)(void 0);
	const method = (0, react.useRef)(void 0);
	/** The way of signing in picked on this card; later sign-ins start with it. */
	const preferred = (0, react.useRef)(void 0);
	const answered = (0, react.useRef)(/* @__PURE__ */ new Set());
	(0, react.useEffect)(() => () => {
		attempt.current?.abort();
	}, []);
	const begin = (methodId) => {
		const controller = new AbortController();
		attempt.current = controller;
		method.current = methodId;
		setStarting(true);
		setError(void 0);
		setCancelled(false);
		settle(() => remote.begin(id, methodId, controller.signal)).then((result) => {
			if (controller.signal.aborted) return;
			setStarting(false);
			setChoice(void 0);
			setError(failure(result, t));
			setCancelled(result.ok && result.value === "cancelled");
		});
	};
	const act = (call) => {
		setBusy(true);
		setError(void 0);
		settle(call).then((result) => {
			setBusy(false);
			setError(failure(result, t));
		});
	};
	const prompt = view?.prompt;
	const opening = prompt?.kind === "select" && view?.notice === void 0 && !answered.current.has(prompt.id) ? prompt : void 0;
	(0, react.useEffect)(() => {
		if (opening === void 0 || opening.kind !== "select" || answered.current.has(opening.id)) return;
		answered.current.add(opening.id);
		const value = opening.options.find((option) => option.id === preferred.current)?.id ?? opening.options[0]?.id;
		if (value === void 0) return;
		setChoice({
			message: opening.message,
			options: opening.options,
			value
		});
		act(() => remote.answer(id, opening.id, value));
	}, [opening?.id]);
	(0, react.useEffect)(() => {
		if (restartWith === void 0 || view?.inFlight !== false) return;
		setRestartWith(void 0);
		begin(restartWith);
	}, [restartWith, view?.inFlight]);
	const switchTo = (value) => {
		preferred.current = value;
		setChoice((current) => current === void 0 ? current : {
			...current,
			value
		});
		if (method.current === void 0) return;
		attempt.current?.abort();
		setRestartWith(method.current);
	};
	if (view === void 0 || view === null) return null;
	const signOut = () => {
		act(() => remote.signOut(id));
	};
	if (apiKeyEnv !== void 0 || view.credential === "api-key") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(KeyNotice, {
		accountStored: view.credential === "account",
		disabled: busy || view.inFlight || !view.writable,
		onSignOut: signOut,
		error,
		t
	});
	const signingIn = starting || view.inFlight;
	const signedIn = view.credential === "account";
	const plan = reportedPlan ?? view.plan;
	const disabled = busy || lost || !view.writable;
	const status = signingIn ? "signingIn" : signedIn ? "signedIn" : "signedOut";
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		className: SignInSection_module_css_default["panel"],
		"aria-label": t("title"),
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: SignInSection_module_css_default["header"],
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: SignInSection_module_css_default["identity"],
					role: "status",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: SignInSection_module_css_default["dot"],
						"data-state": status,
						"aria-hidden": "true"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: SignInSection_module_css_default["title"],
						children: status === "signedIn" && plan !== void 0 ? t("signedInPlan", { plan: planName(plan) }) : t(status)
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: SignInSection_module_css_default["row"],
					children: signingIn ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "outline",
						size: "sm",
						disabled: busy || lost || !view.inFlight,
						onClick: () => {
							act(() => remote.cancel(id));
						},
						children: t("cancel")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [view.methods.map((method) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: signedIn ? "outline" : "primary",
						size: "sm",
						disabled,
						onClick: () => {
							begin(method.id);
						},
						children: signedIn ? view.methods.length > 1 ? t("signInAgainWith", { method: method.label }) : t("signInAgain") : t("signInWith", { method: method.label })
					}, method.id)), signedIn && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "ghost",
						size: "sm",
						className: SignInSection_module_css_default["danger"],
						disabled,
						onClick: signOut,
						children: t("signOut")
					})] })
				})]
			}),
			!view.writable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: SignInSection_module_css_default["hint"],
				children: t("readOnly")
			}),
			signingIn && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Progress, {
				view,
				choice,
				handled: answered.current,
				disabled: busy || lost,
				onSwitch: switchTo,
				onAnswer: (promptId, value) => {
					act(() => remote.answer(id, promptId, value));
				},
				t
			}),
			cancelled && !signingIn && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: SignInSection_module_css_default["hint"],
				role: "status",
				children: t("cancelled")
			}),
			error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: SignInSection_module_css_default["error"],
				role: "alert",
				children: error
			}),
			lost && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: SignInSection_module_css_default["error"],
				role: "alert",
				children: t("streamLost")
			})
		]
	});
}
/**
* The route authenticates with an API key, so the account sign-in has nothing to do:
* only a stored account it no longer uses is offered for sign-out.
*/
function KeyNotice({ accountStored, disabled, onSignOut, error, t }) {
	if (!accountStored && error === void 0) return null;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		className: SignInSection_module_css_default["panel"],
		"aria-label": t("title"),
		children: [accountStored && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: SignInSection_module_css_default["header"],
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: SignInSection_module_css_default["hint"],
				children: t("unusedAccount")
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
				variant: "ghost",
				size: "sm",
				className: SignInSection_module_css_default["danger"],
				disabled,
				onClick: onSignOut,
				children: t("signOut")
			})]
		}), error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
			className: SignInSection_module_css_default["error"],
			role: "alert",
			children: error
		})]
	});
}
/**
* A running sign-in, laid out like the Models page's own editor: a tinted panel of
* fields, each a small label over its content. The way of signing in, the page to
* open (or the code to enter), and any question the flow waits on.
*/
function Progress({ view, choice, handled, disabled, onSwitch, onAnswer, t }) {
	const area = (0, react.useRef)(null);
	const choiceId = (0, react.useId)();
	const notice = view.notice;
	const link = webUrl(notice?.url);
	const prompt = view.prompt !== void 0 && !handled.has(view.prompt.id) ? view.prompt : void 0;
	const step = JSON.stringify([
		notice?.message,
		notice?.url,
		notice?.code,
		prompt?.id
	]);
	(0, react.useEffect)(() => {
		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		area.current?.scrollIntoView({
			block: "nearest",
			behavior: reduce ? "auto" : "smooth"
		});
	}, [step]);
	const waiting = notice === void 0 && prompt === void 0;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		ref: area,
		className: SignInSection_module_css_default["steps"],
		children: [
			choice !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: SignInSection_module_css_default["inline"],
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
					className: SignInSection_module_css_default["label"],
					htmlFor: choiceId,
					children: t("method")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
					id: choiceId,
					className: SignInSection_module_css_default["select"],
					value: choice.value,
					disabled,
					onChange: (event) => {
						onSwitch(event.target.value);
					},
					children: choice.options.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
						value: option.id,
						title: option.description,
						children: flowText(option.label, t)
					}, option.id))
				})]
			}),
			waiting && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: SignInSection_module_css_default["description"],
				role: "status",
				children: t("preparing")
			}),
			notice !== void 0 && (notice.code !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: SignInSection_module_css_default["field"],
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: SignInSection_module_css_default["label"],
						children: t("code")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: SignInSection_module_css_default["description"],
						children: flowText(notice.message, t)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: SignInSection_module_css_default["row"],
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
								className: SignInSection_module_css_default["code"],
								children: notice.code
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Copy, {
								value: notice.code,
								label: t("copyCode"),
								t
							}),
							link !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OpenPage, {
								url: link,
								label: t("openVerification")
							})
						]
					})
				]
			}) : link !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: SignInSection_module_css_default["field"],
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: SignInSection_module_css_default["label"],
						children: t("page")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: SignInSection_module_css_default["description"],
						children: flowText(notice.message, t)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: SignInSection_module_css_default["row"],
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(OpenPage, {
							url: link,
							label: t("openPage"),
							primary: true
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Copy, {
							value: link,
							label: t("copyLink"),
							t
						})]
					})
				]
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: SignInSection_module_css_default["description"],
				role: "status",
				children: flowText(notice.message, t)
			})),
			prompt !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Prompt, {
				prompt,
				disabled,
				onAnswer,
				t
			}, prompt.id)
		]
	});
}
function OpenPage({ url, label, primary = false }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
		variant: primary ? "primary" : "outline",
		size: "sm",
		onClick: () => {
			window.open(url, "_blank", "noopener,noreferrer");
		},
		children: label
	});
}
/** A copy button that briefly says whether it worked. */
function Copy({ value, label, t }) {
	const [result, setResult] = (0, react.useState)();
	(0, react.useEffect)(() => {
		if (result === void 0) return void 0;
		const timer = setTimeout(() => {
			setResult(void 0);
		}, 2e3);
		return () => {
			clearTimeout(timer);
		};
	}, [result]);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
		variant: "ghost",
		size: "sm",
		"aria-live": "polite",
		onClick: () => {
			(0, _deepseek_ai_dsh_client_ui_primitives.writeClipboard)(value).then((ok) => {
				setResult(ok ? "copied" : "copyFailed");
			});
		},
		children: result === void 0 ? label : t(result)
	});
}
function Prompt({ prompt, disabled, onAnswer, t }) {
	const id = (0, react.useId)();
	const [value, setValue] = (0, react.useState)(prompt.kind === "select" ? prompt.options[0]?.id ?? "" : "");
	const [sent, setSent] = (0, react.useState)(false);
	const ready = prompt.kind !== "select" || value !== "";
	const description = prompt.kind === "select" ? prompt.options.find((option) => option.id === value)?.description : void 0;
	const submit = (event) => {
		event.preventDefault();
		if (disabled || sent || !ready) return;
		setSent(true);
		onAnswer(prompt.id, value);
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
		className: SignInSection_module_css_default["field"],
		onSubmit: submit,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
				className: SignInSection_module_css_default["label"],
				htmlFor: id,
				children: promptLabel(prompt.message, t)
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: SignInSection_module_css_default["description"],
				children: flowText(prompt.message, t)
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: SignInSection_module_css_default["answer"],
				children: [prompt.kind === "select" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
					id,
					className: SignInSection_module_css_default["select"],
					value,
					disabled: disabled || sent,
					onChange: (event) => {
						setValue(event.target.value);
					},
					children: prompt.options.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
						value: option.id,
						children: flowText(option.label, t)
					}, option.id))
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
					id,
					className: SignInSection_module_css_default["input"],
					type: prompt.kind === "secret" ? "password" : "text",
					value,
					placeholder: prompt.placeholder ?? "",
					autoComplete: "off",
					spellCheck: false,
					disabled: disabled || sent,
					onChange: (event) => {
						setValue(event.target.value);
					}
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					type: "submit",
					variant: "outline",
					size: "sm",
					disabled: disabled || sent || !ready,
					children: t("continue")
				})]
			}),
			description !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: SignInSection_module_css_default["description"],
				children: flowText(description, t)
			})
		]
	});
}

// src/client/oauth/index.ts
function registerOauthLocale(ctx) {
	ctx.effect(() => ctx.locale.register(NS$1, {
		zh: zh$1,
		en: en$1
	}), `${NS$1}: dictionaries`);
}
/**
* Add the sign-in section to the pi-ai cards; returns the disposer.
* @param plans - plans the providers report, shown in place of the token's.
*/
function registerOauth(ctx, plans) {
	const remote = ctx.remote.betterProvidersOauth;
	const piAi = ctx.configForms.get(PI_AI);
	return ctx.slots.inject(CARD_SLOT, () => ctx.slots.register({
		name: CARD_SLOT,
		id: ROW.oauth,
		order: 0,
		locale: NS$1,
		inject: () => ({
			remote,
			hooks: {
				piAi,
				plans
			}
		})
	}, SignInSection));
}

// src/client/kit/form-copy.ts
/** Copy of the settings form's frame on a row's page (row-config.tsx). */
/** Spread into the dictionaries of each namespace a row page uses. */
const FORM_COPY = {
	zh: {
		"form.unavailable": "这一行没有在运行，暂时无法修改设置。",
		"form.readOnly": "配置文件为只读，暂时无法保存。",
		"form.saveFailed": "保存失败，请检查输入后重试。",
		"form.save": "保存",
		"form.saving": "正在保存…",
		"form.overridden": "已修改",
		"form.reset": "恢复默认"
	},
	en: {
		"form.unavailable": "This row is not running; its settings cannot be changed now.",
		"form.readOnly": "The configuration is read-only; changes cannot be saved.",
		"form.saveFailed": "Saving failed. Check the values and try again.",
		"form.save": "Save",
		"form.saving": "Saving…",
		"form.overridden": "Changed",
		"form.reset": "Reset to default"
	}
};

// src/client/kit/row-config.tsx
/**
* A row's own settings page on the Plugins page: the `plugins.row.config` entry
* keyed `<package>#<row id>`, over the row's settings namespace (its row id, which
* holds the row's volatile Config fields). Built on dsh's shared settings form, so
* edits are staged and written together by its save, as on every settings page.
*/
/** A whole number within bounds; an empty draft clears the field back to its default. */
function integerSetting(field, range, copy) {
	return {
		field,
		...copy,
		numeric: true,
		format: (value) => typeof value === "number" ? String(value) : "",
		parse(text) {
			const trimmed = text.trim();
			if (trimmed === "") return { kind: "clear" };
			if (!/^\d+$/.test(trimmed)) return void 0;
			const value = Number(trimmed);
			return value >= range.min && value <= range.max ? {
				kind: "set",
				value
			} : void 0;
		}
	};
}
function RowConfigPage({ view, useForm, settings, summary, edit, resetField, save, discard, t }) {
	const state = useForm((form) => form);
	const id = (0, react.useId)();
	if (view === "summary") return summary(state.values, t);
	const disabled = !state.writable || state.saving;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SettingsForm, {
		labels: {
			unavailable: t("form.unavailable"),
			readOnly: t("form.readOnly"),
			saveFailed: t("form.saveFailed"),
			save: t("form.save"),
			saving: t("form.saving")
		},
		state,
		onSave: save,
		onDiscard: discard,
		children: settings.map((setting) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SettingsValueField, {
			id: `${id}-${setting.field}`,
			label: t(setting.label),
			hint: t(setting.hint),
			invalidLabel: t(setting.invalid),
			overriddenLabel: t("form.overridden"),
			resetLabel: t("form.reset"),
			numeric: setting.numeric === true,
			disabled,
			...state.fields[setting.field] ?? {
				text: "",
				overridden: false,
				invalid: false
			},
			onEdit: (text) => {
				edit(setting.field, text);
			},
			onReset: () => {
				resetField(setting.field);
			}
		}, setting.field))
	});
}
/** Register the row's settings page; returns the disposer. */
function registerRowConfig(ctx, options) {
	return ctx.slots.inject("plugins.row.config", () => {
		const scope = ctx.configForms.get(options.row);
		const model = new _deepseek_ai_dsh_client_ui_primitives.SettingsFormModel(scope, options.settings.map(({ field, format, parse }) => ({
			field,
			format,
			parse
		})));
		const form = model.bind(() => ({
			...model.shell(),
			fields: Object.fromEntries(options.settings.map((setting) => [setting.field, model.field(setting.field)])),
			values: scope.getSnapshot().value
		}));
		const unregister = ctx.slots.register({
			name: "plugins.row.config",
			key: `${PACKAGE}#${options.row}`,
			locale: options.locale,
			inject: () => ({
				hooks: { form },
				settings: options.settings,
				summary: options.summary,
				...model.actions()
			})
		}, RowConfigPage);
		return () => {
			unregister();
			model.dispose();
		};
	});
}

// src/client/quota/locales.ts
/** Copy of the quota part: the usage section on provider cards and the row's settings page. */
const NS = "better-providers-quota";
const zh = {
	...FORM_COPY.zh,
	title: "订阅额度",
	loading: "正在查询额度…",
	remaining: "剩余 {percent}%",
	notReported: "未提供",
	limitReached: "已用完",
	resetsIn: "{time}后重置",
	resetDue: "即将重置",
	"unit.days": "{count} 天",
	"unit.hours": "{count} 小时",
	"unit.minutes": "{count} 分钟",
	"span.five-hour": "5 小时额度",
	"span.daily": "每日额度",
	"span.weekly": "每周额度",
	"span.monthly": "每月额度",
	"span.annual": "年度额度",
	"span.period": "当前周期",
	"pool.codex": "Codex",
	"pool.code-review": "代码审查",
	"pool.subscription": "订阅",
	showDetails: "展开详情",
	hideDetails: "收起详情",
	limits: "其他额度",
	balances: "余额",
	"balance.credits": "Credits",
	"balance.monthly-limit": "每月 credits 上限",
	"balance.prepaid": "预付余额",
	"balance.on-demand": "按量付费",
	unlimited: "不限",
	spent: "已用 {used} / {limit}",
	credits: "{amount} credits",
	resets: "重置卡",
	resetCount: "{count} 张可用",
	resetsUnavailable: "暂时无法读取重置卡。",
	noResets: "没有可用的重置卡。",
	cardTitle: "额度重置",
	cardExpires: "{date} 到期",
	useCard: "使用",
	confirmTitle: "使用这张重置卡？",
	confirmBody: "会立即重置当前账号的用量限制，这张卡随即失效。",
	confirmUse: "使用",
	cancel: "取消",
	"outcome.reset": "额度已重置。",
	"outcome.already-redeemed": "这张卡已经用过，额度已按它重置。",
	"outcome.nothing-to-reset": "现在没有需要重置的额度，卡没有用掉。",
	"outcome.no-credit": "这张卡已不可用。",
	"outcome.unknown": "没有收到结果，卡可能已经用掉。请先确认这次的结果，再使用其他卡。",
	pending: "上一次重置还没有确认结果。",
	checkPending: "确认结果",
	"refused.bad-provider": "这个服务商不提供额度查询。",
	"refused.unsupported": "这个服务商不提供额度查询。",
	"refused.account-changed": "登录的账号变了，请重新选择。",
	"refused.reset-pending": "还有一次重置没有确认结果，请先确认。",
	"refused.request-mismatch": "这次操作和之前的记录不一致，请刷新页面。",
	"refused.card-unavailable": "这张卡已不可用。",
	"refused.redeem-refused": "服务商拒绝了这次重置。",
	"issue.auth-required": "需要重新登录才能查询额度。",
	"issue.auth-expired": "登录已失效，请重新登录。",
	"issue.refresh-failed": "登录状态刷新失败，稍后会重试；一直失败请重新登录。",
	"issue.forbidden": "服务商拒绝了额度查询。",
	"issue.rate-limited": "查询太频繁，稍后再试。",
	"issue.rate-limited-until": "查询太频繁，{time}后再试。",
	"issue.request-failed": "额度暂时查询不到。",
	"issue.invalid-response": "服务商返回的额度数据无法识别。",
	"issue.client-outdated": "服务商不再接受这个版本的查询，请更新插件。",
	stale: "以下是上次查询到的结果。",
	managedByTeam: "额度由团队管理。",
	streamLost: "与 dsh 的连接中断，正在重连…",
	"settings.interval": "刷新间隔（秒）",
	"settings.intervalHint": "模型页打开时，每隔多少秒查询一次额度（15–3600）。",
	"settings.intervalInvalid": "请输入 15 到 3600 之间的整数。",
	"settings.summary": "每 {seconds} 秒查询一次额度"
};
const en = {
	...FORM_COPY.en,
	title: "Subscription usage",
	loading: "Loading usage…",
	remaining: "{percent}% left",
	notReported: "Not reported",
	limitReached: "Used up",
	resetsIn: "Resets in {time}",
	resetDue: "Resetting soon",
	"unit.days": "{count}d",
	"unit.hours": "{count}h",
	"unit.minutes": "{count}m",
	"span.five-hour": "5-hour limit",
	"span.daily": "Daily limit",
	"span.weekly": "Weekly limit",
	"span.monthly": "Monthly limit",
	"span.annual": "Annual limit",
	"span.period": "Current period",
	"pool.codex": "Codex",
	"pool.code-review": "Code review",
	"pool.subscription": "Subscription",
	showDetails: "Show details",
	hideDetails: "Hide details",
	limits: "Other limits",
	balances: "Balance",
	"balance.credits": "Credits",
	"balance.monthly-limit": "Monthly credit limit",
	"balance.prepaid": "Prepaid credit",
	"balance.on-demand": "Pay-as-you-go",
	unlimited: "Unlimited",
	spent: "{used} of {limit} used",
	credits: "{amount} credits",
	resets: "Resets",
	resetCount: "{count} available",
	resetsUnavailable: "Resets could not be loaded.",
	noResets: "No resets available.",
	cardTitle: "Usage reset",
	cardExpires: "Expires {date}",
	useCard: "Use",
	confirmTitle: "Use this reset?",
	confirmBody: "This resets the usage limits of the signed-in account now and uses up the card.",
	confirmUse: "Use",
	cancel: "Cancel",
	"outcome.reset": "Usage limits were reset.",
	"outcome.already-redeemed": "This card was already used; the limits were reset with it.",
	"outcome.nothing-to-reset": "Nothing needs a reset now; the card was not used.",
	"outcome.no-credit": "This card is no longer available.",
	"outcome.unknown": "No answer arrived, and the card may have been used. Check this reset before using another card.",
	pending: "The last reset has no confirmed result yet.",
	checkPending: "Check result",
	"refused.bad-provider": "This provider does not report usage.",
	"refused.unsupported": "This provider does not report usage.",
	"refused.account-changed": "The signed-in account changed. Choose again.",
	"refused.reset-pending": "Another reset has no confirmed result yet. Check it first.",
	"refused.request-mismatch": "This request does not match the earlier one. Reload the page.",
	"refused.card-unavailable": "This card is no longer available.",
	"refused.redeem-refused": "The provider refused this reset.",
	"issue.auth-required": "Sign in again to see usage.",
	"issue.auth-expired": "The sign-in has expired. Sign in again.",
	"issue.refresh-failed": "The sign-in could not be refreshed. It will be retried; if this keeps failing, sign in again.",
	"issue.forbidden": "The provider refused the usage query.",
	"issue.rate-limited": "Too many queries; trying again later.",
	"issue.rate-limited-until": "Too many queries; trying again in {time}.",
	"issue.request-failed": "Usage is temporarily unavailable.",
	"issue.invalid-response": "The provider sent usage data that could not be read.",
	"issue.client-outdated": "The provider no longer accepts queries from this version. Update the plugin.",
	stale: "Showing the last successful reading.",
	managedByTeam: "Usage limits are managed by your team.",
	streamLost: "Lost the connection to dsh; reconnecting…",
	"settings.interval": "Refresh interval (seconds)",
	"settings.intervalHint": "How often usage is queried while the Models page is open (15–3600).",
	"settings.intervalInvalid": "Enter a whole number from 15 to 3600.",
	"settings.summary": "Usage is queried every {seconds} seconds"
};

// src/client/quota/model.ts
function duration(ms, t) {
	const minutes = Math.max(1, Math.ceil(ms / 6e4));
	const days = Math.floor(minutes / 1440);
	const hours = Math.floor(minutes % 1440 / 60);
	return (days > 0 ? [["days", days], ["hours", hours]] : hours > 0 ? [["hours", hours], ["minutes", minutes % 60]] : [["minutes", minutes]]).filter(([, count], index) => index === 0 || count > 0).map(([unit, count]) => t(`unit.${unit}`, { count })).join(" ");
}
function windowLine(window, { now, t, locale }) {
	const remaining = window.usedPercent === void 0 ? void 0 : Math.min(100, Math.max(0, 100 - window.usedPercent));
	const left = remaining === void 0 ? t("notReported") : remaining === 0 ? t("limitReached") : t("remaining", { percent: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(remaining) });
	const level = remaining !== void 0 && remaining <= 10 ? "critical" : remaining !== void 0 && remaining <= 25 ? "low" : "ok";
	const at = window.resetsAt;
	return {
		id: window.id,
		label: t(`span.${window.span ?? "period"}`),
		...at === void 0 ? {} : { reset: {
			text: at > now ? t("resetsIn", { time: duration(at - now, t) }) : t("resetDue"),
			at
		} },
		left,
		...remaining === void 0 ? {} : { remaining },
		level
	};
}
function poolName(pool, t) {
	if (pool.name !== void 0) return pool.name;
	return pool.id === "codex" || pool.id === "code-review" || pool.id === "subscription" ? t(`pool.${pool.id}`) : pool.id;
}
function amount(unit, value, { t, locale }) {
	if (value === void 0) return t("notReported");
	if (unit === "usd-cents") return new Intl.NumberFormat(locale, {
		style: "currency",
		currency: "USD",
		currencyDisplay: "narrowSymbol"
	}).format(value / 100);
	return t("credits", { amount: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value) });
}
function balanceValue(balance, context) {
	if (balance.unlimited === true) return context.t("unlimited");
	if (balance.limit !== void 0) return context.t("spent", {
		used: amount(balance.unit, balance.used, context),
		limit: amount(balance.unit, balance.limit, context)
	});
	return amount(balance.unit, balance.remaining, context);
}
/** The usage section of a view; null when there is nothing to show (nobody signed in). */
function describeQuota(view, context) {
	if (view.status === "signed-out") return null;
	const { now, t } = context;
	const usage = view.usage;
	const notes = [];
	if (usage === void 0 && view.status === "loading") notes.push({
		tone: "hint",
		text: t("loading")
	});
	if (view.issue !== void 0) {
		const { code, retryAt } = view.issue;
		notes.push({
			tone: "error",
			text: code === "rate-limited" && retryAt !== void 0 && retryAt > now ? t("issue.rate-limited-until", { time: duration(retryAt - now, t) }) : t(`issue.${code}`)
		});
		if (usage !== void 0) notes.push({
			tone: "hint",
			text: t("stale")
		});
	}
	if (usage?.managedByTeam === true) notes.push({
		tone: "hint",
		text: t("managedByTeam")
	});
	const shown = usage !== void 0 && usage.managedByTeam !== true ? usage : void 0;
	let details;
	if (shown !== void 0 && (shown.pools.length > 1 || shown.balances.length > 0 || shown.resets !== void 0)) {
		const resets = shown.resets;
		const open = view.status === "ready" && !view.reading && !view.redeeming && view.pending === void 0 && view.account !== void 0 && !context.busy && resets?.status === "ready";
		details = {
			pools: shown.pools.slice(1).map((pool) => ({
				name: poolName(pool, t),
				windows: pool.windows.map((window) => windowLine(window, context)),
				...pool.windows.length === 0 ? { empty: t("notReported") } : {}
			})),
			balances: shown.balances.map((balance) => ({
				label: t(`balance.${balance.id}`),
				value: balanceValue(balance, context)
			})),
			...resets === void 0 ? {} : { cards: {
				heading: t("resets"),
				...resets.count === void 0 ? {} : { count: {
					text: t("resetCount", { count: resets.count }),
					available: resets.count > 0
				} },
				...resets.status === "unavailable" ? { note: t("resetsUnavailable") } : resets.cards.length === 0 ? { note: t("noResets") } : {},
				items: resets.cards.map((card) => ({
					card,
					title: card.title ?? t("cardTitle"),
					...card.expiresAt === void 0 ? {} : { expires: t("cardExpires", { date: new Date(card.expiresAt).toLocaleDateString(context.locale) }) },
					usable: open && (card.expiresAt === void 0 || card.expiresAt > now)
				}))
			} }
		};
	}
	return {
		notes,
		windows: shown?.pools[0]?.windows.map((window) => windowLine(window, context)) ?? [],
		...details === void 0 ? {} : { details },
		...view.pending !== void 0 && !view.redeeming ? { pending: {
			text: t("pending"),
			retry: view.pending
		} } : {}
	};
}
/** A random UUID for a redemption; `randomUUID` exists only on secure pages, so build one when it is missing. */
function newRequestId(random = crypto) {
	if (typeof random.randomUUID === "function") return random.randomUUID();
	const bytes = random.getRandomValues(/* @__PURE__ */ new Uint8Array(16));
	bytes[6] = bytes[6] & 15 | 64;
	bytes[8] = bytes[8] & 63 | 128;
	const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// \0dsh-css:src/client/quota/QuotaSection.module.css.mjs
const tag = "dsh-better-providers/quota/QuotaSection.module.css";
if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${tag}"]`) === null) {
	const style = document.createElement("style");
	style.dataset.plugin = "dsh-better-providers";
	style.dataset.pluginCss = tag;
	style.textContent = ".ntamaW_panel{border-top:.5px solid var(--dsw-alias-border-l2);min-width:0;color:var(--dsw-alias-label-primary);flex-direction:column;gap:10px;padding-top:12px;font-size:13px;line-height:20px;display:flex}.ntamaW_line{flex-wrap:wrap;justify-content:space-between;align-items:center;gap:4px 16px;min-width:0;display:flex}.ntamaW_hint{color:var(--dsw-alias-label-secondary);margin:0}.ntamaW_error{color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere;margin:0}.ntamaW_description{color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere;margin:0;font-size:12px;line-height:18px}.ntamaW_window{flex-direction:column;gap:6px;min-width:0;display:flex}.ntamaW_windowLine{grid-template-columns:minmax(0,1fr) minmax(0,auto) auto;align-items:baseline;gap:12px;display:grid}.ntamaW_windowName,.ntamaW_windowReset{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.ntamaW_windowReset{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.ntamaW_windowAmount,.ntamaW_figure{font-variant-numeric:tabular-nums;text-align:end;white-space:nowrap}.ntamaW_meter{--fill:var(--dsw-alias-state-success-primary);background:var(--dsw-alias-border-l3);border-radius:2px;height:4px;overflow:hidden}.ntamaW_meter[data-level=low]{--fill:var(--dsw-alias-state-warn-primary)}.ntamaW_meter[data-level=critical]{--fill:var(--dsw-alias-state-error-primary)}.ntamaW_fill{border-radius:inherit;background:var(--fill);height:100%;display:block}.ntamaW_toggle{width:100%;height:20px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;border-radius:4px;align-items:center;gap:8px;padding:0;display:flex}.ntamaW_toggle:before,.ntamaW_toggle:after{content:\"\";border-top:1px dashed var(--dsw-alias-border-l3);flex:1}.ntamaW_toggle:hover,.ntamaW_toggle:focus-visible{color:var(--dsw-alias-label-primary)}.ntamaW_toggle:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}.ntamaW_chevron{transition:transform .16s;display:inline-flex}.ntamaW_toggle[aria-expanded=true] .ntamaW_chevron{transform:rotate(180deg)}@media (prefers-reduced-motion:reduce){.ntamaW_chevron{transition:none}}.ntamaW_details{border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-module-platform);flex-direction:column;gap:14px;min-width:0;padding:12px 14px;display:flex}.ntamaW_details[hidden]{display:none}.ntamaW_group,.ntamaW_pool{flex-direction:column;gap:6px;min-width:0;display:flex}.ntamaW_group{gap:8px}.ntamaW_group+.ntamaW_group{border-top:.5px solid var(--dsw-alias-border-l2);padding-top:12px}.ntamaW_groupHead{align-items:center;gap:8px;display:flex}.ntamaW_label{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500;line-height:18px}.ntamaW_poolName{font-weight:500}.ntamaW_cards{border-radius:var(--dsw-radius-md);background:color-mix(in srgb, var(--dsw-alias-bg-layer-1) 55%, transparent);flex-direction:column;padding:0 10px;display:flex}.ntamaW_card{align-items:center;gap:12px;padding:8px 0;display:flex}.ntamaW_card+.ntamaW_card{border-top:1px dashed var(--dsw-alias-border-l3)}.ntamaW_cardText{flex-direction:column;flex:1;min-width:0;display:flex}.ntamaW_cardTitle{font-weight:500}.ntamaW_figures{flex-direction:column;gap:4px;margin:0;display:flex}.ntamaW_figureLine{justify-content:space-between;align-items:baseline;gap:16px;display:flex}.ntamaW_figureLine dt{color:var(--dsw-alias-label-secondary)}.ntamaW_figureLine dd{margin:0;font-weight:500}.ntamaW_confirm{flex-direction:column;gap:8px;display:flex}.ntamaW_confirm p{margin:0}@media (pointer:coarse){.ntamaW_panel button{min-height:44px}}";
	document.head.appendChild(style);
}
var QuotaSection_module_css_default = {
	"card": "ntamaW_card",
	"cards": "ntamaW_cards",
	"cardText": "ntamaW_cardText",
	"cardTitle": "ntamaW_cardTitle",
	"chevron": "ntamaW_chevron",
	"confirm": "ntamaW_confirm",
	"description": "ntamaW_description",
	"details": "ntamaW_details",
	"error": "ntamaW_error",
	"figure": "ntamaW_figure",
	"figureLine": "ntamaW_figureLine",
	"figures": "ntamaW_figures",
	"fill": "ntamaW_fill",
	"group": "ntamaW_group",
	"groupHead": "ntamaW_groupHead",
	"hint": "ntamaW_hint",
	"label": "ntamaW_label",
	"line": "ntamaW_line",
	"meter": "ntamaW_meter",
	"panel": "ntamaW_panel",
	"pool": "ntamaW_pool",
	"poolName": "ntamaW_poolName",
	"toggle": "ntamaW_toggle",
	"window": "ntamaW_window",
	"windowAmount": "ntamaW_windowAmount",
	"windowLine": "ntamaW_windowLine",
	"windowName": "ntamaW_windowName",
	"windowReset": "ntamaW_windowReset"
};

// src/client/quota/QuotaSection.tsx
/**
* Subscription usage on a built-in pi-ai provider card: the main limits as bars
* under the sign-in, and on demand the other limits, balances and reset cards in
* a tinted panel like the Models page's own editor. What shows when is decided by
* `describeQuota`; this file lays it out and sends redemptions.
*/
function QuotaSection(props) {
	const { provider, configured } = props;
	if (provider.declared === true || !configured || !hasQuota(provider.provider)) return null;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Section, { ...props }, provider.provider);
}
/** The clock countdowns and ages read; ticks every 30 seconds. */
function useNow() {
	const [now, setNow] = (0, react.useState)(Date.now);
	(0, react.useEffect)(() => {
		const timer = setInterval(() => {
			setNow(Date.now());
		}, 3e4);
		return () => {
			clearInterval(timer);
		};
	}, []);
	return now;
}
function Section({ provider, remote, plans, t }) {
	const id = provider.provider;
	const { value: view, lost } = useFollowed((signal) => remote.watch(id, signal), id);
	const plan = view?.usage?.plan;
	(0, react.useEffect)(() => {
		plans.publish(id, plan);
		return () => {
			plans.publish(id, void 0);
		};
	}, [
		plans,
		id,
		plan
	]);
	const now = useNow();
	const [open, setOpen] = (0, react.useState)(false);
	const [chosen, setChosen] = (0, react.useState)();
	const [busy, setBusy] = (0, react.useState)(false);
	const [notice, setNotice] = (0, react.useState)();
	const account = (0, react.useRef)(void 0);
	(0, react.useEffect)(() => {
		account.current = view?.account;
		setChosen(void 0);
		setNotice(void 0);
	}, [view?.account]);
	const shown = view === void 0 ? null : describeQuota(view, {
		now,
		t,
		busy
	});
	if (view === void 0 || shown === null) return null;
	const redeem = (redemption) => {
		setBusy(true);
		setNotice(void 0);
		settle(() => remote.redeem(id, redemption)).then((result) => {
			setBusy(false);
			if (account.current !== redemption.account) return;
			setNotice(result.ok ? t(`outcome.${result.value}`) : "refused" in result ? t(`refused.${result.refused}`) : t("outcome.unknown"));
		});
	};
	const usable = chosen !== void 0 && shown.details?.cards?.items.some((item) => item.card.id === chosen.id && item.usable) === true;
	const confirm = () => {
		if (chosen === void 0 || view.account === void 0 || !usable) return;
		redeem({
			account: view.account,
			card: chosen.id,
			request: newRequestId()
		});
		setChosen(void 0);
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		className: QuotaSection_module_css_default["panel"],
		"aria-label": t("title"),
		children: [
			shown.notes.map((note) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: QuotaSection_module_css_default[note.tone],
				role: note.tone === "error" ? "alert" : void 0,
				children: note.text
			}, note.text)),
			shown.windows.map((line) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WindowRow, { line }, line.id)),
			shown.details !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Details, {
				open,
				onToggle: () => {
					setOpen((value) => !value);
				},
				t,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DetailsBody, {
					details: shown.details,
					onUse: setChosen,
					t
				})
			}),
			shown.pending !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: QuotaSection_module_css_default["line"],
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: QuotaSection_module_css_default["hint"],
					children: shown.pending.text
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					size: "sm",
					disabled: busy || lost,
					onClick: () => {
						if (shown.pending !== void 0) redeem(shown.pending.retry);
					},
					children: t("checkPending")
				})]
			}),
			notice !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: QuotaSection_module_css_default["hint"],
				role: "status",
				children: notice
			}),
			lost && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: QuotaSection_module_css_default["error"],
				role: "alert",
				children: t("streamLost")
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: chosen !== void 0,
				title: t("confirmTitle"),
				closeLabel: t("cancel"),
				onClose: () => {
					setChosen(void 0);
				},
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					onClick: () => {
						setChosen(void 0);
					},
					children: t("cancel")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					disabled: !usable,
					onClick: confirm,
					children: t("confirmUse")
				})] }),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: QuotaSection_module_css_default["confirm"],
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: chosen?.title ?? t("cardTitle") }),
						chosen?.description !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: QuotaSection_module_css_default["description"],
							children: chosen.description
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: QuotaSection_module_css_default["description"],
							children: t("confirmBody")
						})
					]
				})
			})
		]
	});
}
function WindowRow({ line }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: QuotaSection_module_css_default["window"],
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: QuotaSection_module_css_default["windowLine"],
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: QuotaSection_module_css_default["windowName"],
					children: line.label
				}),
				line.reset !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("time", {
					className: QuotaSection_module_css_default["windowReset"],
					dateTime: new Date(line.reset.at).toISOString(),
					title: new Date(line.reset.at).toLocaleString(),
					children: line.reset.text
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: QuotaSection_module_css_default["windowAmount"],
					children: line.left
				})
			]
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: QuotaSection_module_css_default["meter"],
			"data-level": line.level,
			role: "meter",
			"aria-label": line.label,
			"aria-valuemin": 0,
			"aria-valuemax": 100,
			"aria-valuenow": line.remaining,
			"aria-valuetext": line.left,
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: QuotaSection_module_css_default["fill"],
				style: { width: `${line.remaining ?? 0}%` }
			})
		})]
	});
}
/** Reset cards first, as a list with their actions; then the other limits; then the balances as plain figures. */
function DetailsBody({ details, onUse, t }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
		details.cards !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: QuotaSection_module_css_default["group"],
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: QuotaSection_module_css_default["groupHead"],
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: QuotaSection_module_css_default["label"],
						children: details.cards.heading
					}), details.cards.count !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
						tone: details.cards.count.available ? "success" : "neutral",
						children: details.cards.count.text
					})]
				}),
				details.cards.note !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: QuotaSection_module_css_default["description"],
					children: details.cards.note
				}),
				details.cards.items.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: QuotaSection_module_css_default["cards"],
					children: details.cards.items.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CardRow, {
						item,
						onUse,
						t
					}, item.card.id))
				})
			]
		}),
		details.pools.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: QuotaSection_module_css_default["group"],
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: QuotaSection_module_css_default["label"],
				children: t("limits")
			}), details.pools.map((pool) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: QuotaSection_module_css_default["pool"],
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: QuotaSection_module_css_default["poolName"],
						children: pool.name
					}),
					pool.empty !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: QuotaSection_module_css_default["description"],
						children: pool.empty
					}),
					pool.windows.map((line) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WindowRow, { line }, line.id))
				]
			}, pool.name))]
		}),
		details.balances.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: QuotaSection_module_css_default["group"],
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: QuotaSection_module_css_default["label"],
				children: t("balances")
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dl", {
				className: QuotaSection_module_css_default["figures"],
				children: details.balances.map((balance) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: QuotaSection_module_css_default["figureLine"],
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: balance.label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
						className: QuotaSection_module_css_default["figure"],
						children: balance.value
					})]
				}, balance.label))
			})]
		})
	] });
}
/** One reset card with its action. */
function CardRow({ item, onUse, t }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: QuotaSection_module_css_default["card"],
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
			className: QuotaSection_module_css_default["cardText"],
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: QuotaSection_module_css_default["cardTitle"],
				children: item.title
			}), item.expires !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: QuotaSection_module_css_default["description"],
				children: item.expires
			})]
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
			variant: "outline",
			size: "sm",
			disabled: !item.usable,
			onClick: () => {
				onUse(item.card);
			},
			children: t("useCard")
		})]
	});
}
/** A dashed divider with a chevron in its middle; the chevron turns over when the details open. */
function Details({ open, onToggle, children, t }) {
	const id = (0, react.useId)();
	const label = t(open ? "hideDetails" : "showDetails");
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
		type: "button",
		className: QuotaSection_module_css_default["toggle"],
		"aria-expanded": open,
		"aria-controls": id,
		"aria-label": label,
		title: label,
		onClick: onToggle,
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			className: QuotaSection_module_css_default["chevron"],
			"aria-hidden": "true",
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { size: 14 })
		})
	}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		id,
		className: QuotaSection_module_css_default["details"],
		hidden: !open,
		children: open && children
	})] });
}

// src/client/quota/index.ts
function registerQuotaLocale(ctx) {
	ctx.effect(() => ctx.locale.register(NS, {
		zh,
		en
	}), `${NS}: dictionaries`);
}
/** Add the usage section to the pi-ai cards and the interval to the row's page; returns the disposer. */
function registerQuota(ctx, plans) {
	const remote = ctx.remote.betterProvidersQuota;
	const section = ctx.slots.inject(CARD_SLOT, () => ctx.slots.register({
		name: CARD_SLOT,
		id: ROW.quota,
		order: 10,
		locale: NS,
		inject: () => ({
			remote,
			plans
		})
	}, QuotaSection));
	const settings = registerRowConfig(ctx, {
		row: ROW.quota,
		locale: NS,
		settings: [integerSetting("quotaRefreshSeconds", REFRESH_SECONDS, {
			label: "settings.interval",
			hint: "settings.intervalHint",
			invalid: "settings.intervalInvalid"
		})],
		summary: (values, t) => {
			const seconds = values?.["quotaRefreshSeconds"];
			return t("settings.summary", { seconds: typeof seconds === "number" ? seconds : REFRESH_SECONDS.initial });
		}
	});
	return () => {
		settings();
		section();
	};
}

// src/client/index.ts
const inject = [
	"slots",
	"remote",
	"locale",
	"configForms"
];
const nothing = () => () => {};
async function apply(ctx) {
	registerOauthLocale(ctx);
	registerQuotaLocale(ctx);
	registerModelsLocale(ctx);
	await ctx.remote.$mount(MAIN_REMOTE);
	await ctx.remote.$mount(OAUTH_REMOTE);
	await ctx.remote.$mount(QUOTA_REMOTE);
	await ctx.remote.$mount(MODELS_REMOTE);
	ctx.inject([
		"remote.betterProviders",
		"remote.betterProvidersOauth",
		"remote.betterProvidersQuota",
		"remote.betterProvidersModels"
	], (child) => {
		const presence = follow((signal) => child.remote.betterProviders.watchParts(signal));
		child.effect(() => () => {
			presence.dispose();
		}, "better-providers: parts presence");
		const plans = createPlanBoard();
		child.effect(() => gateParts(presence, {
			oauth: () => registerOauth(child, plans),
			quota: () => registerQuota(child, plans),
			models: () => registerModels(child),
			codexFast: nothing
		}, [{
			when: (parts) => parts.oauth || parts.quota || parts.models,
			register: () => registerCardHost(child)
		}]), "better-providers: part UI");
	});
}

exports.apply = apply;
exports.inject = inject;
return module.exports; } });
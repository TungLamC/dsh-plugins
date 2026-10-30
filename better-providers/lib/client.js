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

// src/client/oauth/locales.ts
/** Copy of the oauth part. */
const NS = "better-providers-oauth";
const zh = {
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
	usingApiKey: "这个服务商指定了 API key（{ref}），请求不会使用账号登录。",
	usingStoredKey: "这个服务商存的是 API key，请求不会使用账号登录。",
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
const en = {
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
	usingApiKey: "This provider is set to use an API key ({ref}); requests do not use the account sign-in.",
	usingStoredKey: "This provider stores an API key; requests do not use the account sign-in.",
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

// src/client/oauth/plan.ts
/** Display names of subscription plans as tokens state them; an unknown one is shown capitalised. */
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
	const known = NAMES[plan.toLowerCase()];
	if (known !== void 0) return known;
	return plan.split(/[_\s-]+/).filter(Boolean).map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ");
}

// \0dsh-css:src/client/oauth/SignInSection.module.css.mjs
const tag = "dsh-better-providers/oauth/SignInSection.module.css";
if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${tag}"]`) === null) {
	const style = document.createElement("style");
	style.dataset.plugin = "dsh-better-providers";
	style.dataset.pluginCss = tag;
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
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Section, { ...props }, provider.provider);
}
function failure(result, t) {
	if (result.ok) return void 0;
	return "refused" in result ? t(`refused.${result.refused}`) : t("failed", { message: result.failed });
}
function Section({ provider, remote, usePiAi, t }) {
	const id = provider.provider;
	const apiKeyEnv = usePiAi((form) => form.value?.providers?.[id]?.apiKeyEnv);
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
		apiKeyEnv,
		accountStored: view.credential === "account",
		disabled: busy || view.inFlight || !view.writable,
		onSignOut: signOut,
		error,
		t
	});
	const signingIn = starting || view.inFlight;
	const signedIn = view.credential === "account";
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
						children: status === "signedIn" && view.plan !== void 0 ? t("signedInPlan", { plan: planName(view.plan) }) : t(status)
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
/** The route authenticates with an API key, so the account sign-in has nothing to do. */
function KeyNotice({ apiKeyEnv, accountStored, disabled, onSignOut, error, t }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		className: SignInSection_module_css_default["panel"],
		"aria-label": t("title"),
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: SignInSection_module_css_default["hint"],
				children: apiKeyEnv === void 0 ? t("usingStoredKey") : t("usingApiKey", { ref: apiKeyEnv })
			}),
			accountStored && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
			}),
			error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: SignInSection_module_css_default["error"],
				role: "alert",
				children: error
			})
		]
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
	ctx.effect(() => ctx.locale.register(NS, {
		zh,
		en
	}), `${NS}: dictionaries`);
}
/** Add the sign-in section to the pi-ai cards; returns the disposer. */
function registerOauth(ctx) {
	const remote = ctx.remote.betterProvidersOauth;
	const piAi = ctx.configForms.get(PI_AI);
	return ctx.slots.inject(CARD_SLOT, () => ctx.slots.register({
		name: CARD_SLOT,
		id: ROW.oauth,
		order: 0,
		locale: NS,
		inject: () => ({
			remote,
			hooks: { piAi }
		})
	}, SignInSection));
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
	await ctx.remote.$mount(MAIN_REMOTE);
	await ctx.remote.$mount(OAUTH_REMOTE);
	ctx.inject(["remote.betterProviders", "remote.betterProvidersOauth"], (child) => {
		const presence = follow((signal) => child.remote.betterProviders.watchParts(signal));
		child.effect(() => () => {
			presence.dispose();
		}, "better-providers: parts presence");
		child.effect(() => gateParts(presence, {
			oauth: () => registerOauth(child),
			quota: nothing,
			models: nothing,
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
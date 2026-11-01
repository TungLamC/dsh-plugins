window.__ModuleLoader__.load({ id: "dsh-web-access", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
let react = require("react");
let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
let react_jsx_runtime = require("react/jsx-runtime");

// src/shared/ids.ts
/**
* Names shared by the Host and browser halves: the package, its one row, the
* service the row provides, and the search tiers in the order a search tries them.
*/
const PACKAGE = "dsh-web-access";
/** The row id in cordis.patch.yml: also its settings namespace and the search provider id `web.searchProvider` names. */
const ROW = "web-access";
/** The cordis service key, which also names the row's Remote namespace. */
const SERVICE = "webAccess";
/** Every tier, in the order a search tries them. */
const TIERS = [
	"codex",
	"openai",
	"gemini",
	"exa",
	"parallel",
	"anysearch"
];
/** Tiers where a model searches on the provider's side and writes a cited answer; each runs one route's model. */
const HOSTED_TIERS = [
	"codex",
	"openai",
	"gemini"
];
function isHosted(tier) {
	return HOSTED_TIERS.includes(tier);
}
/** The row's settings field naming a hosted tier's model; unset picks one. */
const MODEL_FIELD = {
	codex: "codexModel",
	openai: "openaiModel",
	gemini: "geminiModel"
};

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

// src/shared/web-access.wire.ts
const WEB_ACCESS_REMOTE = defineRemote(PACKAGE, SERVICE, { searchModels: { params: [] } });

// src/client/locales.ts
/** Copy of the settings page on the plugin's page. */
const NS = "web-access";
const zh = {
	"form.unavailable": "插件没有在运行，暂时无法修改设置。",
	"form.readOnly": "配置文件为只读，暂时无法保存。",
	"form.saveFailed": "保存失败，请重试。",
	"form.save": "保存",
	"form.saving": "正在保存…",
	"form.overridden": "已修改",
	"form.reset": "恢复默认",
	"tier.codex": "Codex",
	"tier.openai": "OpenAI",
	"tier.gemini": "Gemini",
	"tier.exa": "Exa",
	"tier.parallel": "Parallel",
	"tier.anysearch": "AnySearch",
	"model.label": "{tier} 搜索用的模型",
	"model.auto": "自动",
	"model.noRoute": "模型页未添加"
};
const en = {
	"form.unavailable": "The plugin is not running; its settings cannot be changed now.",
	"form.readOnly": "The configuration is read-only; changes cannot be saved.",
	"form.saveFailed": "Saving failed. Try again.",
	"form.save": "Save",
	"form.saving": "Saving…",
	"form.overridden": "Changed",
	"form.reset": "Reset to default",
	"tier.codex": "Codex",
	"tier.openai": "OpenAI",
	"tier.gemini": "Gemini",
	"tier.exa": "Exa",
	"tier.parallel": "Parallel",
	"tier.anysearch": "AnySearch",
	"model.label": "Model {tier} searches with",
	"model.auto": "Automatic",
	"model.noRoute": "Not on Models page"
};

// src/client/choices.ts
function choicesStore(fetch) {
	let current;
	let loading = false;
	const listeners = /* @__PURE__ */ new Set();
	return {
		getSnapshot: () => current,
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		load() {
			if (loading) return;
			loading = true;
			fetch().then((result) => {
				if (!result.ok) return;
				current = result.value;
				for (const listener of [...listeners]) listener();
			}, () => {}).finally(() => {
				loading = false;
			});
		}
	};
}
/**
* @param models - the tier's models from the Host: null without a route, undefined until the Host answers.
* @param chosen - the model the form holds for the tier; empty for automatic.
*/
function modelMenu(models, chosen) {
	if (models === null) return { kind: "no-route" };
	const listed = models ?? [];
	return {
		kind: "models",
		models: chosen !== "" && !listed.some((model) => model.id === chosen) ? [...listed, {
			id: chosen,
			name: chosen
		}] : listed
	};
}

// \0dsh-css:src/client/settings.module.css.mjs
const tag = "dsh-web-access/settings.module.css";
if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${tag}"]`) === null) {
	const style = document.createElement("style");
	style.dataset.plugin = "dsh-web-access";
	style.dataset.pluginCss = tag;
	style.textContent = ".FIHMWW_tier{align-items:center;gap:8px;min-height:32px;padding:10px 0;display:flex}.FIHMWW_tier+.FIHMWW_tier{border-top:.5px solid var(--dsw-alias-border-l2)}.FIHMWW_label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}.FIHMWW_badges{align-items:center;gap:8px;display:inline-flex}.FIHMWW_reset{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;padding:0;font-size:12px;line-height:1.5}.FIHMWW_reset:hover:not(:disabled){color:var(--dsw-alias-label-primary)}.FIHMWW_reset:disabled{cursor:default}.FIHMWW_model{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background-color:var(--dsw-alias-bg-layer-1);appearance:none;width:200px;height:32px;font:inherit;color:var(--dsw-alias-label-primary);text-overflow:ellipsis;cursor:pointer;background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%2381858C' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\");background-position:right 12px center;background-repeat:no-repeat;background-size:12px 12px;padding:0 32px 0 10px;font-size:14px;line-height:22px}.FIHMWW_model:focus{border-color:var(--dsw-alias-state-business-primary);outline:none}.FIHMWW_model:disabled{opacity:.6;cursor:default}";
	document.head.appendChild(style);
}
var settings_module_css_default = {
	"badges": "FIHMWW_badges",
	"label": "FIHMWW_label",
	"model": "FIHMWW_model",
	"reset": "FIHMWW_reset",
	"tier": "FIHMWW_tier"
};

// src/client/settings.tsx
/**
* The plugin's settings on its own page of the Plugins page (the
* `plugins.bundle.config` entry keyed by the package): one line per tier in the
* order a search tries them, each with its switch, and a model menu for the
* hosted tiers. Built on dsh's shared settings form over the row's settings
* namespace, so edits are staged and written together by its save.
*/
const SLOT = "plugins.bundle.config";
/** A tier's switch, staged as the text of its state. */
function switchField(field) {
	return {
		field,
		format: (value) => value === true ? "true" : "false",
		parse: (text) => ({
			kind: "set",
			value: text === "true"
		})
	};
}
const FIELDS = [...TIERS.map(switchField), ...TIERS.filter(isHosted).map((tier) => (0, _deepseek_ai_dsh_client_ui_primitives.settingsTextField)(MODEL_FIELD[tier]))];
const NO_FIELD = {
	text: "",
	overridden: false,
	invalid: false
};
function ModelMenu({ tier, chosen, models, disabled, onChoose, t }) {
	const menu = modelMenu(models?.[tier], chosen);
	const label = t("model.label", { tier: t(`tier.${tier}`) });
	if (menu.kind === "no-route") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
		className: settings_module_css_default["model"],
		"aria-label": label,
		value: "",
		disabled: true,
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
			value: "",
			children: t("model.noRoute")
		})
	});
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
		className: settings_module_css_default["model"],
		"aria-label": label,
		value: chosen,
		disabled,
		onChange: (event) => {
			onChoose(event.target.value);
		},
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
			value: "",
			children: t("model.auto")
		}), menu.models.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
			value: model.id,
			children: model.name
		}, model.id))]
	});
}
function SettingsPage({ view, useForm, useChoices, loadChoices, edit, resetField, save, discard, t }) {
	const state = useForm((form) => form);
	const models = useChoices((choices) => choices);
	(0, react.useEffect)(() => {
		loadChoices();
	}, [loadChoices]);
	if (view !== "page") return null;
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
		children: TIERS.map((tier) => {
			const enabled = state.fields[tier] ?? NO_FIELD;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: settings_module_css_default["tier"],
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: settings_module_css_default["label"],
						children: t(`tier.${tier}`)
					}),
					enabled.overridden && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: settings_module_css_default["badges"],
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
							tone: "neutral",
							children: t("form.overridden")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: settings_module_css_default["reset"],
							disabled,
							onClick: () => {
								resetField(tier);
							},
							children: t("form.reset")
						})]
					}),
					isHosted(tier) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelMenu, {
						tier,
						chosen: (state.fields[MODEL_FIELD[tier]] ?? NO_FIELD).text,
						models,
						disabled,
						onChoose: (model) => {
							edit(MODEL_FIELD[tier], model);
						},
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Switch, {
						checked: enabled.text === "true",
						label: t(`tier.${tier}`),
						disabled,
						onChange: (on) => {
							edit(tier, on ? "true" : "false");
						}
					})
				]
			}, tier);
		})
	});
}
/** Register the settings on the plugin's page; returns the disposer. */
function registerSettings(ctx, remote) {
	return ctx.slots.inject(SLOT, () => {
		const scope = ctx.configForms.get(ROW);
		const model = new _deepseek_ai_dsh_client_ui_primitives.SettingsFormModel(scope, FIELDS);
		const form = model.bind(() => ({
			...model.shell(),
			fields: Object.fromEntries(FIELDS.map((spec) => [spec.field, model.field(spec.field)]))
		}));
		const choices = choicesStore(() => remote.searchModels());
		const loadChoices = () => {
			choices.load();
		};
		const unregister = ctx.slots.register({
			name: SLOT,
			key: PACKAGE,
			locale: NS,
			inject: () => ({
				hooks: {
					form,
					choices
				},
				loadChoices,
				...model.actions()
			})
		}, SettingsPage);
		return () => {
			unregister();
			model.dispose();
		};
	});
}

// src/client/index.ts
const inject = [
	"slots",
	"remote",
	"locale",
	"configForms"
];
async function apply(ctx) {
	ctx.effect(() => ctx.locale.register(NS, {
		zh,
		en
	}), `${NS}: dictionaries`);
	await ctx.remote.$mount(WEB_ACCESS_REMOTE);
	ctx.inject([`remote.${SERVICE}`], (child) => {
		child.effect(() => registerSettings(child, child.remote.webAccess), `${NS}: settings`);
	});
}

exports.apply = apply;
exports.inject = inject;
return module.exports; } });
# dsh-web-access

[English](README.md) | 中文

为 DeepSeek Harness（dsh）的 `web_search` 提供搜索。dsh 只调用 `web.searchProvider` 选中的那一个搜索后端，失败了不会换别的；本插件注册后端 `web-access`，在里面按固定顺序尝试开着的档位：没配置的跳过，失败、超时或没有结果就换下一档。

## 安装

```bash
dsh plugin --profile <profile> add 'github:TungLamC/dsh-plugins#<tag>&path:/web-access'
```

确认 profile 的 `package.json` 里 `dsh.profile.bundles` 有 `dsh-web-access`，再重启 dsh。

## 档位

| 档位 | 服务 | 什么时候参与 | 默认 |
|---|---|---|---|
| Codex | ChatGPT Codex 的内置搜索 | 模型页有 `openai-codex`，并已用 ChatGPT 账号登录 | 开 |
| OpenAI | OpenAI API 的内置搜索（Responses API 的 `web_search` 工具） | 模型页有 `openai`，并有 API key 或 ChatGPT 账号登录 | 关 |
| Gemini | Gemini API 的 Google 搜索 grounding | 模型页有 `google`，并有 API key | 关 |
| Exa | Exa 的公开 MCP 接口，免 key | 始终 | 开 |
| Parallel | Parallel 的公开 MCP 接口，免 key | 始终 | 开 |
| AnySearch | AnySearch 搜索 API，匿名 | 始终 | 开 |

- 前三档是内置搜索：模型在服务商那边搜索，再写一段带引用的回答。回答放在结果的 `content` 里，引用和读过的网页放在 `sources` 里。
- 内置档的 key 和登录跟模型页的路由走，顺序和 dsh 发模型请求时一样：
  - 路由设了 `apiKeyEnv`，就用它指的凭据；
  - 否则用路由存的 key 或账号登录；
  - 再否则用服务商自己的环境变量（`OPENAI_API_KEY`、`GEMINI_API_KEY`）。
- 路由的 `baseURL`、`headers` 也照用。过期的 ChatGPT 登录在凭据锁里刷新，和 dsh 发模型请求前的刷新是同一条路径。
- 本插件没有登录界面。用 ChatGPT 账号登录可以装 dsh-better-providers，在模型页登录。
- OpenAI、Gemini 按次计费，所以默认关闭；Codex 用的是 ChatGPT 订阅的额度。
- 结果里不标注来自哪一档。用了哪一档、哪一档为什么失败，写在 Host 日志里（`web search: answered by codex` 之类）。全部失败时，报给模型的错误里列出每一档的失败原因。

## 设置

插件页里本插件的页面列出六档，顺序就是尝试的顺序。每档一个开关，三个内置档还能选模型：

- **自动**：Codex、OpenAI 选最新的 luna 型号，没有就选最新的主线型号（如 `gpt-6`），不选 pro、ultra；Gemini 选最新的正式版 Flash。
- **可选的模型**：来自模型页这条路由的模型列表。路由不存在时显示"模型页未添加"。
- **选过的模型被删掉**：按"自动"处理，日志里记一条。
- **推理档位**：模型支持时用 `low`（`web_search` 不接受 `minimal`）。

设置保存在 profile 的 `cordis.patch.yml` 里 `web-access` 这一行，下一次搜索生效，不用重启。字段：

- `codex`、`openai`、`gemini`、`exa`、`parallel`、`anysearch`：开关。
- `codexModel`、`openaiModel`、`geminiModel`：模型 id，不写就是自动。

本插件的 patch 把 `web.searchProvider` 设为 `web-access`。在 dsh 自带的"内置插件配置 → 网页搜索"里打开"启用新版 Web 搜索 API"，会把搜索换成 DeepSeek 的接口，本插件不再参与；关掉后恢复。

## 时间

dsh 给一次 `web_search` 60 秒，一次最多 4 条搜索词，并发执行。本插件每条搜索词最多用 58 秒：

- 每个开着的免 key 档各留 8 秒；
- 内置档共用剩下的时间：一档很快失败，下一档接着用剩下的；剩不到 10 秒就不再开始新的内置档。

六档全开时内置档共约 34 秒；只开 Codex 时它有 58 秒。

## 外部服务

搜索词会发给开着的各档服务。Exa、Parallel 的免 key 接口按 IP 限流，被限时换下一档。

各服务的请求和结果解析参考了 [pi-web-access](https://github.com/nicobailon/pi-web-access) 0.46.0（MIT），见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。服务改了接口时，先看 pi-web-access 的新版本怎么处理。

## 依赖的 dsh 行为

基于 dsh 0.2.1-rc.5，升级时核对：

- **搜索后端接口**：`@deepseek-ai/dsh-web` 的 `ctx.web.registerSearchProvider`。请求只有 `query`、`maxResults`；`available()` 同步、不联网；dsh 按 `web.searchProvider` 选后端，不回退。
- **报错**：用宿主那一份 `WebError`，所以 `@deepseek-ai/dsh-web` 是 peer 依赖。
- **`web_search` 工具**（`dsh-tool-web`）：一次最多 4 条搜索词并发，`searchTimeoutMs` 60 秒（`dsh-base` 和 `dsh-web-app` 的 preset 里设置）。一条搜索词失败会中止同批其他的，所以只有所有档位都失败才报错。
- **llm-pi-ai 的路由**：`providers.<路由>` 的 `apiKeyEnv`、`baseURL`、`headers`，登录记录 `llm-pi-ai/<路由>`（`api-key` 或 `grant`），以及取凭据的顺序。模型和推理档位从 `ctx.llm.listModels`、`ctx.llm.resolveModelInfo` 读。
- **Codex 请求头**：照 pi-ai 发 Codex 请求的写法（`chatgpt-account-id`、`originator`、`OpenAI-Beta`）。
- **设置页**：挂在插件页的 `plugins.bundle.config` 槽，用 dsh 的共享设置表单；dsh 不会按配置结构自动生成设置页。

## 开发

在仓库根目录执行 `pnpm build`、`pnpm test`。

- **单元测试**：链路（顺序、跳过、回退、时间分配、中止、汇总错误）、路由（凭据顺序、刷新、环境变量）、各档的请求和解析、选模型、设置页的模型菜单。
- **契约测试**：构建好的插件和 dsh 的 WebRuntime、LlmRuntime、llm-pi-ai 一起跑，只伪造网络、登录和设置；前端包按 dsh 的模块加载方式加载。

手动验证：

1. 只开 Exa，让模型搜一条近期新闻：Host 日志有 `web search: answered by exa`。
2. 用 ChatGPT 账号登录 `openai-codex`，开 Codex 再搜：结果开头有一段带引用的回答，日志是 `answered by codex`。
3. 模型页添加 `openai` 或 `google` 并配好 key，开对应档、选一个模型再搜：日志是 `answered by openai` 或 `answered by gemini`。
4. 在插件页停用 `web-access` 这一行：设置随之消失，`web_search` 报 `WEB_PROVIDER_CONFIGURED_MISSING`；重新启用后恢复。

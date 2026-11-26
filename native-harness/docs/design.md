# dsh-native-harness 设计：模块与接口

状态：0.1.0 已实现，含第二轮打磨（默认值配置、计划审批、插话语义、任务清单、原生会话入口）、第三轮（跟随 dsh 工作目录、提前路由、并排模型菜单、agent-team 开关、Codex 快速模式）和第四轮（Antigravity Adapter，经 `agy acp`）。本文按实现更新，用法见 [README](../README.md)。基线：dsh 0.2.2-rc.1、Claude Code 2.1.303（Agent SDK 0.3.303）、Codex 0.166.0；已适配 dsh 0.2.2-rc.5。Antigravity：agy 1.5.15，ACP v1，`@agentclientprotocol/sdk` 2.9.1。

术语沿用 codebase-design：Module、Interface、Implementation、Seam、Adapter、Depth、Leverage、Locality。Interface 指调用方必须知道的全部内容，包括不变式、顺序和错误模式，不只是类型签名。

## 0. 约束

- harness 由 dsh agent 预设 `claude-code-native`、`codex-native`、`antigravity-native` 承载，第一轮后不切换。
- Claude Code、Codex、Antigravity 保有自己的 agent 循环、工具、权限、技能和会话。dsh 只送用户输入和显式操作，不注入工具，不用 MCP，不改 CLI 启动参数塞工具。
- 只用公开接口：不改 DOM，不打补丁，不调用 `snapshotEvents`、`eventAt`、`ownEvents`、`appendPluginRecord`，也不直接向会话日志写 `assistant/message`、`tool/call`。不用 dsh 标为 deprecated 的 `agent/request`、`sessionProjections.stateOf`。
- 模型、推理等级和权限都放在 composer：重绘 single slot `conversation.input.model` 和 `conversation.input.permission`。不提供 `/model`。Codex 的快速模式放在 `conversation.input.right`，和 better-providers 的闪电同一位置；Claude 不做 fast，rewind、`/context`、`/status` 都不做。
- 新会话的模型、推理等级和权限来自插件配置 `defaults`，不读 harness 自己的配置文件推算；每个值都显式传给原生。
- `/` 菜单的技能和命令是插件自己注册的 harness 分组，内容只有 harness 识别出来的。Codex 技能提交时还原原生 `$` 语义。

## 1. 总览

```
client  ModelSeat        conversation.input.model：两栏的模型/等级菜单；普通会话用 modelDirectories，底部带 agent-team 开关
        PermissionSeat   conversation.input.permission：harness 原生模式；普通会话用 dsh 预设
        FastToggle       conversation.input.right：原生 Codex 会话的快速模式
        CommandSources   `/` 菜单里每个 harness 一组
        SessionMark      sidebar.session.row.leading 品牌图标（harness 会话为 Claude / Codex / Antigravity，普通会话为 dsh）
        ResumeAction     conversation.session.header.actions：原生会话 id 与恢复命令
        ActivityView     tool.call.toolview：观察工具卡片
          │ RPC view / select / commands
host    NativeHarness    组合根：隐藏 provider、RPC
        Route            把 harness 会话的 dsh 模型选择保持在隐藏 provider 上
        TurnBridge       provider stream ⇄ 原生事件，观察工具，插话、取消、续跑
        SessionRuntime   打开、恢复、分叉、关闭原生会话，持久身份与检查点
        Catalogs         按 harness+cwd 缓存目录，唯一的 slash token，模型元数据
        Settings         会话自选值叠加配置默认值，算出交给原生的设置
        Interactions     审批与提问 port 的 dsh Adapter
        SessionStore     storageDomain 记录
        ─────────────    Seam：Harness
        harness/claude   Adapter（Agent SDK streaming-input Query）
        harness/codex    Adapter（codex app-server JSON-RPC）
        harness/antigravity Adapter（agy acp，ACP v1）
        harness/fake     Adapter（测试）
```

真实 Seam 只有两个：

| Seam | Adapter | 理由 |
| --- | --- | --- |
| `Harness` | Claude、Codex、Antigravity、Fake | 三个生产 Adapter 加测试替身 |
| `Interactions` | dsh 审批与提问、测试替身 | harness Adapter 的测试需要不依赖 dsh 的替身 |

其余 Module 各只有一个实现，测试时用安装版 dsh 包在内存里组合，属于 local-substitutable 依赖。

## 2. 核心 Seam：Harness

类型的权威定义在 `src/host/harness/types.ts`，文件头注释写明了不变式。要点：

- `Harness`：`catalog(cwd)`、`open(request, ports)`、`close()`。
- `OpenRequest.origin`：`new`、`resume`（自己的原生会话）、`fork`（从检查点分叉）、`copy`（整段复制另一个原生会话，用于在副本上接管终端会话；只有 Claude 支持，Codex、Antigravity 收到会报错）。
- `NativeSession`：`send(input, mode, signal?)`、`events`（单消费者的有序事件流）、`apply(change)`、`interrupt()`、`close()`。
- `NativeEvent`：
  - `turn-start` / `turn-end`：一个原生轮次，带检查点切点；
  - `call-start` / `call-end`：一次主循环模型调用，带该次调用的最终用量；
  - `delta`：正文或推理增量；
  - `tool-start` / `tool-progress` / `tool-end`：原生工具；
  - `ref`：原生会话身份；
  - `mode`：原生自己切换了权限模式（如计划获批后离开计划模式），Adapter 已采纳；
  - `todos`：原生任务清单变化后的整份清单。只改清单的原生工具产生 `todos`，不产生 `tool-start` / `tool-end`；
  - `notice`：需要显示给用户的说明；
  - `endpoint`：原生进程在哪个端点上启动（只有 Claude），每次换端点报一次，宿主记进存储。
- 审批、提问和计划审阅不进事件流，Adapter 直接调用 `SessionPorts.interactions`。每个请求只结算一次，中断、轮次结束、进程退出或关闭会话时撤销。
  - 关闭卡片是一种回答：审批视为拒绝，提问返回 `dismissed`，计划审阅视为要求修改。只有 signal 中止才 reject。
  - `ApprovalRequest.allowOnce: false` 表示原生不提供"允许本次"，只能在 `choices` 里选。
- `contextWindow?(model)`：Adapter 在任何轮次之前学到的上下文窗口，同步查询，不启动进程。
- `tasks()` / `stopTask(id)`：原生正在跑的子代理和后台任务，以及逐个停止。`background` 为真的一项会随原生进程关闭而结束。`interrupt` 只停主轮次，不碰它们。
- `apply` 如实返回 `applied` / `next-turn` / `unsupported` / `rejected`；Adapter 在原生接受之前不修改自己的设置。
- `endpoint?()`：只有 Claude 实现。返回活进程所在的端点，以及选了别的端点、还没切过去时在等什么（`turn` 本轮结束，`tasks` 后台任务结束）。`OpenRequest.lastEndpoint` 是这个会话上一个原生进程所在的端点。

刻意不放进 Interface 的：统一权限枚举（`mode` 是原生的不透明 id，名称和说明来自 `catalog().modes`）；rewind 等 harness 专属操作；"全功能驱动"式的大接口。快速模式是 `HarnessSettings` 里的可选字段 `fast`，模型是否提供由 `ModelOption.fast` 表示，只有 Codex Adapter 处理，Claude Adapter 忽略。

### 2.1 Claude Adapter

- **传输**：Agent SDK 的 streaming-input Query。`pathToClaudeCodeExecutable` 指向本机 `claude`，打开 `includePartialMessages`，`settingSources` 用默认值。
  - Query 有 generation 编号，重启后旧 reader 不能再修改会话状态。
  - 每个活动会话一个常驻进程，空闲回收。
  - 子进程环境清掉继承来的 harness 身份变量。`CLAUDE_CODE_ENTRYPOINT` 用配置 `claudeEntrypoint`，默认 `native-harness`，配成空字符串时由 SDK 填 `sdk-ts`；目录进程和会话进程相同。
  - **端点**：配置了 `claudeEndpoints` 时，进程先删掉继承来的 `ANTHROPIC_BASE_URL`、`ANTHROPIC_API_KEY`、`ANTHROPIC_AUTH_TOKEN`，再写入会话所选端点的 `env`。值恰好是 `$NAME` 时经 `ctx.credentials.resolve` 读取：先查 DSH 凭据存储，再查宿主环境和 `.env`，存储里的优先；都没有就让这次启动失败，错误说明缺哪个变量。解析是异步的，进程启动要等它：等待期间到来的消息共用这一次启动，会话被关掉就不再启动，端点被切换就按新端点重新解析。目录进程用新会话的默认端点。
  - **没配端点时**：每次启动进程（目录进程和会话进程都是）都经 `ctx.credentials.resolve` 读 `NATIVE_HARNESS_ANTHROPIC_BASE_URL`、`NATIVE_HARNESS_ANTHROPIC_AUTH_TOKEN`、`NATIVE_HARNESS_ANTHROPIC_API_KEY`，空值算没设。三个都没设，原样沿用宿主环境。设了任意一个，先删掉继承来的这三个 `ANTHROPIC_*`，再把设了的写进去掉前缀的同名变量。有 URL 但 token 和 key 都没有时，启动失败，错误指出缺的两个变量；只有 token 或 key 时 Claude Code 连默认地址。用带前缀的名字，是因为 dsh 内置的 `llm-pi-ai` 也从凭据存储读不带前缀的 `ANTHROPIC_*`。
- **调用边界**：用 `message_start` / `message_stop`。用量取 message_start 的输入和 message_delta 的输出。没有工具调用的那次 call，其 `call-end` 会推迟到下一次 call 开始或 `result` 到来，以便带上 context window。
- **上下文窗口**：SDK 只在轮次结果里报窗口，第一轮会没有上下文环。目录进程返回目录后，在后台调一次 `getContextUsage({ detail: 'summary' })`（只取窗口；`summary` 在本地估算各类 token，不调 count_tokens），按 `resolvedModel` 记到所有同模型的别名上，每个进程只成功一次。
- **目录**：`default` 别名与另一项解析到同一模型时不列出，`defaultModel` 指向那一项；只在配置没给模型时使用。
- **插话**：带 `priority: 'next'`（同 TUI 的 Enter）和 uuid 推入输入流。回复帧的 `user_message_uuids` 表示已并入；没并入的插话在轮次结束（含中断）后由 CLI 自己作为下一轮运行，那一轮的 `turn-start` 带上它们的 id。
- **计划**：ExitPlanMode 走 `interactions.reviewPlan`。计划正文取 CLI 注入到权限回调里的 `input.plan`（流式的工具输入里没有），随工具结果放进卡片的 `outcome.plan`。要求修改时以 `interrupt: true` 拒绝。CLI 在 `system/status`、`system/init` 里报的权限模式变化以 `mode` 事件上报。
- **任务清单**：TodoWrite 整表替换；TaskCreate 先按工具 id 占位，结果里拿到任务 id 后换键；TaskUpdate 按任务 id 修改或删除。
- **后台任务**：`task_*` 边沿帧加 `background_tasks_changed` 水平帧（整体替换）维护列表：子代理从开始就列出，其他任务只在后台时列出，嵌在子代理里的 shell 不列，监视类（`ambient`）不列。查询声明 `perTaskStopAffordance: true`，主停止只停主轮次；`stopTask` 逐个停止。进程重启时列表清空；需要重启的设置变更（切到跳过权限检查）等后台任务结束后再重启。
- **结果**：`success` 且 `is_error` 不为 true 才算成功。失败详情合并 `result` 和 `errors[]`。
- **设置**：`setModel`、`applyFlagSettings({ effortLevel })`、`setPermissionMode` 都对运行中会话生效。切到 `bypassPermissions` 需要带启动参数重启，所以在空闲时用 resume 重启，并返回 `next-turn`。
- **切换端点**：换端点要换进程。`apply` 提交全部设置，走和 `bypassPermissions` 相同的空闲重启：没有轮次和后台任务时马上停掉进程，返回 `applied`；否则等它们结束，返回 `next-turn`，期间新开的轮次仍在旧端点上。下一次 `send` 用 resume 在新端点上启动。启动时端点和上一个进程（同一个 Adapter 会话里的，或 `OpenRequest.lastEndpoint`）不同，就先发一条 `notice`"已切换到 X"，再发 `endpoint` 事件；第一次启动只发 `endpoint`。
- **恢复与分叉**：恢复用 `resume`；分叉用 `resume` + `forkSession` + `resumeSessionAt` + 子会话 UUID。新会话的原生 session id 就用 dsh 会话 id 里的 UUID。`copy` origin（接管终端会话时在副本上继续）用 `resume` + `forkSession` + dsh 会话的 UUID，不带 `resumeSessionAt`，复制整段对话。这几种组合由 `startOptions` 算出。实测在别的目录里按 id `resume` 也能续上，续上的内容仍追加在会话原目录的文件里。

### 2.2 Codex Adapter

- **传输**：`codex app-server`，每个 dsh 会话一个。
  - 只用 stable 方法，例外是提问（`item/tool/requestUserInput`，其参数被标为实验能力）。
  - server request 有各自的 AbortController，收到 `serverRequest/resolved`、中断、轮次结束或进程退出时撤销。
- **权限**：每次 `turn/start` 都显式带上 sandbox、approval 和 reviewer。未设置时用 `config/read` 读到的原生配置，因为省略字段会沿用上一轮的覆盖。
- **技能**：显式选中的技能用它的准确路径；手输的 `$名称` 只有在名称唯一时才附带 skill 项；`text_elements` 按 UTF-8 字节计，同一位置不重复标记。
- **调用边界**：从 `thread/tokenUsage/updated` 的到达顺序推断，`last` 归给当前 call。轮次结束时补齐未关闭的 call 和工具。
- **插话**：插话失败时，只有错误明确表示轮次已不存在才改发新一轮，其他错误照常抛出。
  - `turn/start`、`turn/steer` 都带 `clientUserMessageId`，Codex 在 `userMessage` 条目里原样回显 `clientId`。回显过的插话已被本轮接收。
  - 轮次被中断时，Codex 服务端丢弃没接收的插话。Adapter 像 TUI 的 Esc 一样，马上把它们合成新的一轮发出。
- **子代理线程**：子线程的通知不进本会话的事件流。子线程发来的审批照常询问用户（标题带 `Subagent ·`），但不在父转录里建工具卡片；本线程的轮次结束或中断只撤回本线程的待决请求。
- **审批**：命令审批的 `availableDecisions` 含 `accept` 时走允许本次 / 拒绝；不含时把附带条件的原生决定（本会话允许、执行策略前缀、网络规则）列为选项，`allowOnce: false`。
- **设置**：模型、推理等级、权限、快速模式都来自会话设置。`config/read` 只用于 workspace-write 沙箱的可写目录与排除项，以及会话没有权限模式时的回退策略。
- **快速模式**：`model/list` 里列出 `priority` 服务档的模型才有 `ModelOption.fast`（名称和说明取 Codex 给的）。每次 `turn/start` 都显式带 `serviceTier`：开启且模型提供时为 `priority`，否则为 `null`，因为省略会沿用上一轮。实测 Codex 0.170：线程配置的 `service_tier` 是 `priority` 时，`null` 仍落到标准档 `default`，不沿用配置。改 `fast` 在轮次进行中返回 `next-turn`。`ultrafast` 档不做。
- **任务清单**：`turn/plan/updated` 是 `update_plan` 唯一的客户端可见形式，映射为 `todos`。
- **子代理任务**：子线程从父线程的 `subAgentActivity`（多代理 v2）或 spawn 的 `collabAgentToolCall`（v1）得到名字，子线程有轮次在跑就列出，带它的 token 和工具次数。停止是对子线程 `turn/interrupt`。

### 2.3 Antigravity Adapter

- **传输**：每个 dsh 会话一个未改动的 `agy acp`（自己的进程组），JSON-RPC over stdio，客户端是官方 `@agentclientprotocol/sdk`，只从主入口导入（stable v1），不用 `unstable`、`experimental`。连接层（`connection.ts`）的 `Connector` 是测试接缝，测试换成 SDK 的进程内 `agent()` app。
  - 只调用 ACP v1 稳定方法：`initialize`、`session/new`、`session/resume`、`session/load`、`session/close`、`session/prompt`、`session/cancel`、`session/set_config_option`；处理 agent 发来的 `session/update`、`session/request_permission`，其他请求回 method not found。
  - `initialize` 不声明文件系统和终端能力，工具都由 agy 自己执行。不调用 `authenticate`，不读写 `~/.gemini`，不处理凭据；未登录时 `auth_required` 换成"先在终端运行 `agy` 登录"的错误。
  - 子进程环境清掉继承来的 harness 身份变量，加 `DSH_SESSION_ID`。stderr 只留最后 4000 字，进程退出的错误里对密钥打码。
- **会话**：`new` 用 `session/new`；`resume` 在 agy 声明 `sessionCapabilities.resume` 时用 `session/resume`，否则用 `session/load`，load 回放的历史内容不进事件流。`fork` 降级为新会话加 `notice`；`copy` 报错。轮次从不报告 `cut`，所以 SessionRuntime 不会给 Antigravity 子会话选 `fork`，而是开新上下文并提示。
- **设置**：模型、推理等级、权限分别对应 ACP config option 的 `model`、`thought_level`、`mode` 类别（没有 `category` 时按同名 id）。打开会话后按模型、等级、模式的顺序显式设置；模型不提供的等级留给 agy，并记一条日志。`apply` 用 `set_config_option` 立即生效，返回 `applied`；agy 拒绝时返回 `rejected`，Adapter 的设置不变。agy 在 `config_option_update`、`current_mode_update` 里报告的模式变化以 `mode` 事件上报，正在 `apply` 的值不算。
- **目录**：开一个短命会话，从 `configOptions` 读模型系列和模式，逐个 `set_config_option` 模型读出各自的等级和默认等级，从第一条 `available_commands_update` 读命令（最多等 3 秒），然后 `session/close`。这样的空会话不出现在 agy 的会话列表里，但会留下文件，所以 Adapter 按 cwd 缓存 30 分钟，刷新失败沿用旧值。命令都是 `kind: 'command'`（ACP 不区分技能），`input.hint` 作 `argumentHint`。
- **输入**：文本块；选中的命令写成 `/名称 参数`，由 agy 按原生语义执行；图片读成 base64 的 image 块，agy 不声明 `promptCapabilities.image` 时报错。
- **调用边界**：ACP 没有调用边界。一次 call 是一段正文和它提出的工具调用，工具开始运行（`in_progress` 或已结束）或请求审批时 `call-end`，之后的正文开新 call。
- **用量**：ACP 草案里 `PromptResponse.usage` 是整轮用量。一轮里没有工具运行（只有一次模型调用）时，它就是那次调用的用量，放进最后的 `call-end`；有工具的轮次省略，不估算。上下文窗口取 `usage_update.size`，放进每个 `call-end`，并按当前模型记下，供 `contextWindow(model)` 查询。
- **工具**：`tool_call` / `tool_call_update` 按 `toolCallId` 合并字段。Activity 只用 ACP 标准字段：`kind` 决定类型和标题，`title`（或 `locations`）作摘要，`rawInput` 作通用输入，`content` 里的 diff 作 diffs；结果取 `content` 文本或 `rawOutput`，结束时报告的 diff 放进 `outcome.diffs`。不按 agy 的工具名或参数写逻辑。已结束轮次的工具 id 记在一个有上限的集合里，之后的迟到更新丢弃。ACP 的 `plan` 更新映射为 `todos`。
- **审批**：先确保工具已 `tool-start`，结束当前 call，再调 `interactions.approve`。选项按 `kind`：第一个 `allow_once`、`reject_once` 是 dsh 的允许和拒绝，其余作为 choices（标签用 agy 原文）；没有 `allow_once` 时 `allowOnce: false`。没有 `reject_once` 的拒绝回 `cancelled`。
- **提问**：agy 的原生提问也走 `request_permission`，选项就是答案，ACP 没有区分的办法。agy 用 `interaction_` 开头的 `toolCallId` 标记（T3 Code 同样这样判断），`permission.ts` 的 `isQuestion` 是 Adapter 唯一依赖 agy 约定的地方。识别出来走 `interactions.ask`，关闭卡片或选项以外的答案回 `cancelled`；识别不出来时按审批卡片列出同样的选项，照样能答。
- **轮次**：每次 `session/prompt` 是一个 `origin: 'user'` 的轮次，结果的 `stopReason` 决定结局：`cancelled` 为 interrupted，`refusal` 为 failed，`max_tokens` / `max_turn_requests` 先发 `notice` 再 completed，请求出错为 failed。
  - **没有插话**：prompt 进行中 `send` 进队列，回执 `queued`；这一轮结束（包括中断）后，队列合成下一个 prompt，`turn-start.inputIds` 带上所有 id。进程丢失时丢弃队列并记日志。
  - **原生轮次**：没有 prompt 时收到正文、工具或计划更新（agy 在后台任务结束、定时唤醒后自己接着回复），开一个 `origin: 'native'` 的轮次。它在下一次用户 `send` 前结束，或者在没有待决审批、工具都已结束、8 秒没有新更新时结束；工具一直不结束（比如服务器）时，安静 60 秒后结束。
  - **中断**：撤回待决的审批和提问（回 `cancelled`），发 `session/cancel`，进程不重启。原生轮次直接以 interrupted 结束。agy 的取消会连带停掉会话的子代理和后台任务，与不变式 10 不同。
- **子代理与后台任务**：ACP 只把它们报成普通工具调用，没有子会话身份，也没有单独停止的方法。一轮以 completed 结束时还没结束的工具（agy 1.5.15 的常驻命令 `IsDaemon` 就是这样：这一轮结束了，命令还在跑；非常驻的后台命令 agy 会等它跑完才结束这一轮），卡片照常以 `unknown` 结束，同时记进 `tasks()`（`kind` 按 ACP 的 `execute` 记为 `shell`，其余为 `other`；`background: true`；`stoppable: false`，客户端不显示停止按钮），直到 agy 对它发出 `completed` 或 `failed`。这类更新只用来移出列表，不出卡片、不开原生轮次。中断和失败的轮次不记：agy 的取消会连带结束它们。进程丢失或关闭会话时清空。`stopTask` 报错。实测：常驻的 `http.server` 在轮次结束后列出；从外部杀掉后 agy 报告结束，列表清空；中断另一轮时 agy 结束了它并报告，列表清空。
- **进程丢失**：连接关闭时结束进行中的轮次（failed，带退出原因），撤回待决请求；下一次 `send` 重连并按 ref 续接。主动关闭会话时先 `session/close`（最多等 3 秒）再结束进程。

## 3. dsh 侧 Module

### 3.1 TurnBridge

Interface：`stream(options)`（隐藏 provider 的流）、`observe(args, exec)`（观察工具）、`inboxInserted`、`sessionEvent`、`forget`。

不变式：

- 一条 dsh 用户消息至多送到原生一次。转给原生的是用户输入，以及 dsh-session-reference 紧跟在引用消息后面附上的对话快照（来源 `session-reference`）；其他 dsh 内部上下文不转。
- 没有要发送的输入、原生会话也没有打开时（如权限切换产生的提示步骤），不打开原生会话。
- 为原生自行开始的工作新开 dsh 轮次时，提示正文按原因区分：同一原生轮次还在继续、原生在处理之前发送的输入、没有输入时原生继续了。
- 一个 dsh 步骤对应一次主循环调用，步骤用量只来自它的 `call-end`。
- 一次没有工具调用的 call 之后，如果原生同一轮还有下一次 call，就开一个新的 dsh 轮次显示，用一条 notice 承载，保证每一步的用量各自准确。
- 一个原生轮次紧接着上一轮开始（或在 dsh 空闲时开始），也用新的 dsh 轮次显示。停止后原生执行未处理的插话也走这条路；dsh 停止按钮保留 inbox，这条插话会出现在显示它的那一轮里，按 id 去重不会重发。
- `todos` 变成一次 dsh 的 `todo_write` 调用（先去掉空白和重复项），由预设里挂的 dsh-tool-todo 执行并写 `todo/write`。
- 在会话准备或输入编码期间取消，不会发出任何输入。
- 停止之后的新输入，要等被中断的轮次结束后才作为新一轮发送。
- 观察工具只等待原生结果，自己不执行任何东西。工具状态在 observe 结束时删除，并按轮次清理。
- 空闲回收原生会话前先看 `tasks()`：还有后台任务就推迟，到期再查。

### 3.2 HarnessRoute（在组合根里）

- **隐藏 provider**：`listModels` 返回 `[]`；`resolveModel` 按缓存的目录给出容量和模态；带 `purpose` 的辅助请求明确失败。
- **路由**：见 3.2.1。effort 和 mode 直接送到原生会话，不经过 dsh 请求。
- **设置**：存储里只放会话自己选过的字段；生效设置 = 自选值叠加配置 `defaults`，按缓存的目录校验（推理等级不被所选模型支持时用该模型的默认等级，目录里没有的权限模式丢弃）。`fast` 只有 Codex 有配置默认值（`defaults.codex.fast`），换模型时保留。`endpoint` 只有 Claude 有：会话自选值、`defaults.claude-code.endpoint`、第一个端点，依次取第一个仍在配置里的；没配端点时没有这一项。端点 id 重复或默认端点不存在时，插件加载失败。`view`、路由、打开原生会话都用生效设置。
- **`select`**：
  - 会话级串行：先校验，再对活会话 `apply` 生效设置的差异（总是具体值，不发"恢复默认"），只有原生接受的才持久化；
  - 换了模型而这次没选推理等级时，推理等级回到配置默认（不被支持时用模型默认）；
  - 存储记录属于另一个 harness（空白会话切换过预设）时，从空设置开始；
  - 持久化后把新模型交给 Route：活会话立即选择，冷会话先记下。
- **`view`**：带上 `native`（原生 id、原生会话上次打开时的 cwd、dsh 是否还持有原生进程、`idleMinutes`），给 ResumeAction 用。Claude 会话配了端点时还带 `endpoints`（id、名称、续接命令），切换还没生效时带 `switching`（`turn` / `tasks`）。
- **会话的 harness 与 cwd**：harness 来自预设注册表的 `presetForSession`。cwd 是 dsh 工作目录服务（`workingDirectory`，可选依赖，用 `ctx.get` 取）记下的目录，forge 建了工作树就是工作树：活会话用 `workingDirectory.get(session)`（无 IO），冷会话读 `sessionController.projections` 的 `workingDirectory` 投影。服务或投影不在时退回会话头的 `cwd`。目录缓存、slash 命令解析、Route 的生效模型都按这个 cwd。

#### 3.2.1 Route

dsh 0.2.2 在准备每个 step 之前，就从会话的模型选择定死 provider、模型和推理等级，`agent/request` 不能再改。Route（`src/host/route.ts`）用公开的 `agent.model.select()` 提前选好。会话一用上原生预设就选，不等第一条输入，读 dsh 模型选择的显示（better-providers 的闪电）和第一条带图消息的图片能力检查（dsh 按 `agent.model.current()` 查 `resolveModel`）都随之按隐藏 provider 走：

- `agent/created`（新建、恢复、clear、压缩都会发）：会话是原生预设就选。新建会话的预设记在会话头里，不发别的事件，只能靠这里。监听器出错只记日志，不让会话创建失败。
- `session/event` 里的 `agent-preset/selected`（空白会话换预设时由 `agentPresets.select` 追加）：按事件里的预设判断，放进微任务（事件回调里不能再追加事件）。换到原生预设就选；换到普通预设且还在隐藏 provider 上，就恢复切换前的选择，内存里没有（宿主重启过）就用 `agent.options`（dsh 当前的全局默认模型）。
- 输入进入 inbox 时同步选择：`agent/inbox/inserted` 在输入写入之后、唤醒 driver 之前发出。
- 会话自己换模型时（`select` RPC）立即选择；冷会话先记下，等它醒来。
- 别处给会话选了别的 provider（dsh 的 `/model`、模型选择器）时改回，同样放到紧接着的微任务里。
- `agent/pre-step` 兜底：step 的路由不是本 harness 时改回并让这一步失败，绝不发给别的模型；否则按存储算出生效模型，不一致就从下一步起改用它（冷会话里改的模型、改过的配置默认）。

选择时，模型取 Route 记下的值（按 harness 记，空白会话从 Claude 预设换到 Codex 预设时不会带过去），否则保留已是本 harness 路由的模型，否则用配置默认。切换前的选择只存在内存里，只在当前选择不是任何隐藏 provider 时记下。

不变式：选择不带推理等级，因为隐藏 provider 不声明推理元数据；换模型时 dsh 自己往上下文加的切换提示（来源 `model-selection`）不转给原生。提前选择只追加 `model/selection` 事件，不算轮次，不影响 dsh 的预设锁（`agent-preset-registry` 的 `select` 看 `turnBoundaryOf`）；空白会话没有请求头，dsh 也不会插"模型已切换"的提示。

### 3.3 SessionRuntime

- **判定 origin**：
  - 存储里有同一 harness 的 `ref` → resume；
  - 否则在接管终端会话、且选了副本（`adopted.fork`）→ `copy`；
  - 否则是 dsh fork 出来的会话：取父会话最近的检查点，并校验检查点到分叉边界之间没有用户消息、助手消息或工具事件 → fork；
  - 校验不通过 → 新上下文，并显示一条提示。
- 检查点在原生 `turn-end` 和 dsh 提交最终 assistant 事件之后才写入。
- **接管终端会话**（`adopt`）：只在会话没打开、没有自己的 `ref` 和检查点时可以设或取消，在会话锁里执行。直接续接时把 `ref` 指向终端会话，副本则只记 `adopted`，等副本报出自己的 id 再写 `ref`。换一个或取消时，连同上一次接管设的 `ref` 一起去掉。有 `adopted` 时打开会话带一条提示；第一次 `committed` 清掉 `adopted`。
- **工作目录**：打开原生会话前 `await workingDirectory.ensure(agent, signal)`（`RuntimeDeps.cwd`）。它校验目录存在，工作树没了按 dsh 的规则退回原项目。forge 建工作树时第一条消息被挡在 maintenance 里，原生会话要到那之后才打开，所以这里拿到的就是工作树。实际打开的目录记进存储，ResumeAction 的 `cd` 用它。原生进程打开后 dsh 再改目录，要等下一次打开才生效。

### 3.4 Catalogs

- 按 harness+cwd 缓存 60 秒；刷新失败时继续用上一次成功的结果。
- slash token：默认就是原生名称；与 dsh 占用的名字冲突时加 `native-` 前缀；仍重复时加数字后缀；每个 token 只指向一个原生命令。
- `resolve(token)` 先按 token 精确匹配；按原生名称匹配只在名称唯一时生效。
- `/compact` 对 Codex 是合成命令，由 Adapter 映射到 `thread/compact/start`。

### 3.5 Interactions、SessionStore

- **Interactions**：
  - 普通的允许/拒绝走 dsh 审批面板；
  - 带额外选项、没有允许本次、dsh 策略不是 `ask`、或面板不可用时，改用提问卡片；
  - 计划审阅用提问接口的公开展示意图 `intent: { kind: 'plan-review', approve }`，渲染为 dsh 的"计划待审"卡片。不传 `callId`：它指向 dsh 自己的 `exit_plan_mode` 调用，侧栏会找不到；
  - 卡片被关闭（`ASK_CANCELLED`）按回答处理，见第 2 节；UI 断开不视为同意。
- **SessionStore**：storageDomain `native_harness/sessions`，每个会话一条记录（harness、设置（含 `fast`、`endpoint`）、ref、接管的终端会话 `adopted`（id、标题、是否副本）、上一个原生进程所在的端点 `lastEndpoint`、原生会话上次打开的 cwd、检查点、已转发的消息 id），同一会话的更新串行执行。新增字段都是可选的，旧记录照常读。
- **终端会话**（`terminal.ts`）：`terminalSessions` 用 Agent SDK 的 `listSessions({ dir: cwd, includeWorktrees: false, includeProgrammatic: false })`，和终端 `/resume` 一样不列 SDK 会话（`sdk-*` 标签），只列在 cwd 本身开的会话，所以续接时工具在原来的目录里跑。dsh 自己的原生会话标签是 `native-harness`（以前是 `t3-code`），不算 SDK 会话，所以另外排除：它们以 dsh 会话 UUID 为 id，存储里有 `session-<id>` 的 Claude 记录就算。dsh 直接续接过的终端会话 id 不是 dsh 的 UUID，仍会列出。最多 30 个。"终端里开着"读 Claude Code 的进程登记 `<CLAUDE_CONFIG_DIR 或 ~/.claude>/sessions/<pid>.json`（`sessionId`、`pid`），进程还在就算开着；格式没有文档，读不出来的条目跳过。`adopt` 再按 id 用 `getSessionInfo` 在同一目录里确认一次，开着的会话只能选副本。

### 3.6 预设入口

三个预设都用 `dsh-native-harness/preset`，它只在预设作用域注册观察工具 `native_activity`。预设另外只挂 dsh-tool-todo（`allowParallelInProgress: true`），用来显示原生的任务清单；它的工具定义进的是 dsh 请求，隐藏 provider 不转给原生。dsh 的其他工具、技能发现、计划、目标、压缩和子代理都不挂。

## 4. Client

- **ModelSeat / PermissionSeat**：用 priority −10 替换 single slot。
  - harness 会话读写插件 RPC，显示生效设置，没有"默认"行或"默认"推理等级。
  - 模型菜单（`ModelMenu`）是一个两栏面板：左栏是搜索框和按 provider 分组的模型，每行前面是 provider 图标；右栏是当前模型的推理等级。点模型立即生效、菜单不关（模型没有等级时关闭），点等级生效并关闭。上下键在栏内移动，左右键切换栏，搜索只过滤左栏。窄窗口时等级栏换到模型下方。可选的 `footer` 放在两栏下面，拿到 `dismiss` 以便先关菜单再开别的浮层。
  - provider 图标：dsh 的 DeepSeek provider 和 pi-ai 内置 provider 按 route id 精确对应插件自带的图标（`shared/icons.ts` 的 `BUILTIN_ICONS`），用户自定义的 provider 没有图标。配置 `providerIcons` 按 provider id 指定自带图标名、图片地址或空值（不显示），优先于内置对应；浏览器经 `icons` RPC 读取，每个连接读一次。自带图标由 `scripts/provider-marks.ts` 从 Lobe Icons 的 svg 生成，以 markup 渲染，渐变 id 每个实例唯一。菜单里只要有一个 provider 带图标，所有行都留出图标位以便对齐。原生会话的分组用 BrandIcon。普通会话的等级规则照 dsh 的 ModelSelect：模型有默认等级时不列"默认"行，没选过时勾在默认等级上。
  - 普通会话的菜单底部是 agent-team 开关（`TeamToggle`）。dsh rc.5 把它放在自己模型按钮的子槽位 `conversation.input.model.options` 里，组件不公开，这里用公开接口照着重画：读 `agentTeam`、`modelSelection` 投影（只做运行时类型收窄，不依赖 `@deepseek-ai/dsh-agent-team`），写 `remote.agentTeams.setEnabled`（`ctx.inject(['remote.agentTeams'])` 拿到时才显示）。子代理会话不显示；锁定、保存中、`modelSelection` 未就绪时禁用；会话用过模型后关闭先弹确认框（primitives 的 `Modal`，文案照 dsh），确认框挂在菜单外，失败留在框里；开关失败显示在开关上方。不做乐观更新。原生会话不显示。
  - Claude 会话配了端点时，模型菜单每个端点一组，组里是同一份模型。每组都用 BrandIcon，端点靠分组标题区分。点别组的模型同时换端点和模型；同一个模型换到别组只换端点，推理等级不变。按钮标题带端点名。`switching` 存在时按钮上有一个提示色圆点，菜单状态行写"本轮结束后切到 X"或"后台任务结束后切到 X"，每 2 秒重读直到切换生效。模型按钮每步结束也重读。
  - harness 会话的设置读写经过按会话缓存的 `views`，模型按钮、权限按钮、快速模式开关共用：同一 tick 的读取合并成一次，`select` 返回的设置立即写回，所以换模型后开关马上知道新模型是否提供 fast。只采用 `harness` 与本控件一致的 view，空白会话换预设时不会显示另一个 harness 的目录。
  - 权限名称按 harness 取文案（`mode_<harness>_<id>`），因为两个 harness 都有 `auto`。权限按钮在每个步骤结束后重读一次，跟上原生自己切换的模式。
  - 普通会话用公开的 `modelDirectories`、`remote.permissionPresets` 和 `/permission` 命令。
  - 权限目录失败会重试，`connection/reset` 后重新读取。
  - 锁定或选项消失时，撤回已打开的菜单和确认框。
- **CommandSources**：每个 harness 注册一个 `/` source，候选带"Harness · 技能 / 命令"小标题，选中后插入 `/token `；提供 lexicon 让 chip 正确渲染。
- **SessionMark**、**ActivityView**：品牌图标用 Lobe Icons 的 `claude-color`、`codex`，Antigravity 用 provider 图标里的 `antigravity`（Lobe Icons 的 antigravity-color）；工具卡片按 Activity 的类型选择终端、diff、计划正文（markdown）或通用卡片，结果里带 `diffs` 时显示结果里的 diff。
- **FastToggle**：注册在 `conversation.input.right`（id `native-harness-fast`，order 100，同 better-providers），只在原生 Codex 会话、当前模型有 `fast` 时显示。外观照搬 better-providers 的闪电（无底色，开启时用强调色，`aria-pressed`），提示附 Codex 对这一档的说明；返回 `next-turn` 时在闪电上方短暂提示"下一轮生效"。
- **BackgroundTasks**：`conversation.composer.dock` 里，排在 dsh 的活动、用量两个 pill 之后。有任务时显示运行指示和数量，点开是列表，每项带停止按钮。会话运行中或有任务时每 2 秒重读 `tasks`，每步结束也重读。
- **弹出面板定位**：模型菜单、任务列表、原生会话面板都挂到 body，用 CSS anchor positioning（`anchor-name` / `position-anchor`）跟随触发按钮，摆放方式分别照搬 dsh 的 ModelSelect、ContextMeter、JobListAction，含窗口边缘的 `@position-try` 回退。dsh 0.2.2-rc.5 删掉了 `useAnchoredPosition`，改用同样的做法。
- **ResumeAction**：harness 会话有原生 id 后，在标题旁（预设标签之后）显示品牌图标和短 id；点开是面板：完整 id、带复制按钮的 `cd '<cwd>' && claude --resume <id>` / `codex resume <id>` / `agy --conversation <id>`（cwd 是原生会话上次打开时的目录；Claude 会话所选端点配了 `command` 时用它代替 `claude`），以及 dsh 是否还持有原生进程的提醒。
- **TerminalResume**：注册在 `conversation.hero.options`（id `native-harness-terminal`，和 forge 的"新建工作树"开关同一行），只在 Claude Code 会话里显示；这个位置只在空白会话的首页渲染，第一条消息之后自然消失。按钮点开是面板（定位同 ResumeAction），列出 `terminalSessions`，单选一项，"在副本上继续"复选框（会话开着时勾上并禁用），确认后调 `adopt` 并重读 view。已选时按钮显示"续接：标题"，旁边的 × 调 `adopt(null)`。

## 5. 测试

- `tests/bridge.test.ts`、`tests/review.test.ts`、`tests/steer.test.ts`：Fake harness 加安装版 agent-loop / token-meter / tool-todo / native 工具执行器的内存组合，会话从全局默认模型起步、由 Route 选回隐藏 provider，只通过 Interface 断言。覆盖排序、每步用量、notice 步骤、插话、取消、续跑、连续无工具调用、停止后发送、停止后原生执行插话、准备期间取消、token 唯一、分叉校验、模式同步、任务清单。
- `tests/route.test.ts`：创建即路由且不带推理等级、空白会话切入原生预设立即路由、切出恢复原选择、再切入、换到另一个 harness 预设不带走模型、切出后发消息走普通模型、内存没有原选择时退回创建时的模型、`/model`（含轮次中途）被改回、活会话与冷会话换模型、存储模型从下一步生效、兜底失败不发给别的模型。测试组合的 `harnessOf` 跟随可切换的预设。
- `tests/runtime.test.ts`：原生会话在 `cwd` 依赖给出的目录打开（而不是会话头的项目目录），存储记下最近一次打开的目录。
- `tests/endpoints.test.ts`：端点配置的默认值与校验（id 格式、重复 id、默认端点不存在）、生效端点的回退顺序、端点环境替换宿主的上游变量，`$NAME` 只在凭据存储、只在环境变量、两处都有（存储优先）、两处都没有（报错指出变量）时各自的结果（解析函数用替身）；用记录启动环境的假 `claude` 验证：解析期间的两条消息只启动一个进程，用的是存储里的值，期间切换端点就在新端点上启动，缺变量或会话已关闭时不启动进程；没配端点时：三个 `NATIVE_HARNESS_ANTHROPIC_*` 都没有就保留宿主的 `ANTHROPIC_*`，有 URL 和 token 时替换宿主的上游（宿主的 key 不留），只有 key 时只写 key，只有 URL 时报错指出缺的变量，有端点时不读这三个变量；假 `claude` 验证每个进程按启动时存储里的值启动，只有 URL 时不启动进程，目录进程也用这三个变量；切换提示显示在对话里且端点写进存储。
- 真实 CLI 烟测（端点）：在网关 A 上跑一轮（宿主的 `ANTHROPIC_*` 已清掉），空闲时切到网关 B 返回 `applied` 并释放进程，下一条消息在网关 B 上启动，先出"已切换到网关 B"再出 `endpoint` 事件，请求到达 网关 B（当时额度用完，返回 429）。
- `tests/terminal.test.ts`：终端会话列表排除 dsh 自己的会话、标题回退顺序、上限 30、开着的标记；按 id 查找；进程登记只认进程还在的条目，坏文件和非 json 文件跳过；`startOptions` 的四种组合；直接续接与副本的 origin 和提示、副本报出 id 后改为 resume、第一次 committed 清掉接管；换一个、取消、已有自己会话时拒绝、会话已打开时拒绝。
- 真实 CLI 烟测（接管）：一个会话里记一个词，再用构建后的 Adapter 以 `copy` 和 `resume` 各问一次，都答对；副本的 id 是 dsh 会话的 UUID，原会话文件不变；直接续接时原会话文件变长。在别的目录按 id resume 也能续上，内容追加在原目录的文件里。一个常用目录的真实终端会话列出 30 个、约 0.7 秒，正开着的 3 个都标为开着；按真实存储排除后，带 `native-harness` 标签的 dsh 会话不再出现。Claude CLI 在 SDK 模式下不接受 `cli` 标签（改记 `sdk-cli` / `sdk-ts`），没法用 SDK 造一个"终端会话"，所以列表本身只用真实终端会话验证过。浏览器里的界面还没验收。
- `tests/antigravity.test.ts`：用 ACP SDK 的 `agent()` app 搭脚本化的假 agy，经进程内连接驱动 Adapter，只通过 Harness Interface 断言。覆盖目录（模型系列与各自等级、模式、命令、用完关闭、缓存）、轮次结束时仍在跑的工具进后台任务列表并在结束时移出（中断和进程丢失不留）、新会话显式设置与 ref、等级不支持时的处理、resume 与 load（回放不进事件流）、fork 降级与 copy 报错、文本图片和命令输入、调用边界与工具配对（含轮次结束时仍开着的工具）、只在单次调用的轮次带用量、审批选项映射与先出工具卡片、提问识别与取消、`apply` 的 applied / rejected、模式同步、中断撤回审批后能继续、运行中发送排队、原生轮次的开始与结束、原生轮次让位给新输入、进程丢失后重连续接、上下文窗口、未登录提示、关闭。
- 真实 CLI 烟测（Antigravity，agy 1.5.15，个人账号，临时工作区）：用构建前的 Adapter 直接连 `agy acp`：目录约 20 秒，11 个模型系列各带等级、4 个模式、13 条命令；默认模式下运行 shell 命令先弹审批，允许后执行并拿到输出，调用边界正确；运行 `sleep 40` 时中断，轮次以 interrupted 结束，同一进程接着答下一轮，那一轮带用量；能拿到上下文窗口。后台任务另测了一次：常驻 `http.server` 在轮次结束后进 `tasks()`；从外部杀掉后 agy 报告结束，列表清空；另一轮被中断时 agy 结束了它（端口关闭）并报告，列表清空。浏览器里的界面还没验收。
- `tests/settings.test.ts`、`tests/interactions.test.ts`、`tests/todos.test.ts`、`tests/catalog.test.ts`：生效设置与配置默认（含 `fast`）、设置变更的合并、Codex 目录的 fast 档与每轮的 `serviceTier`、Claude 目录、关闭卡片、计划审阅、Codex 审批选项、任务清单映射、提前学到的上下文窗口。
- 真实 CLI 烟测（临时工作区）：两个 harness 各跑过读文件、审批写文件 + 关闭进程后 resume、运行中取消再发送、插话后停止（Codex 重发被丢弃的插话，Claude 由 CLI 自己续跑）；Claude 开启任务工具后的任务清单；`claude --resume`、`codex resume` 在 TUI 里打开 dsh 的会话。
- 临时 `DSH_HOME` 的浏览器验收：预设、composer 两个按钮（默认值、无"默认"项、权限名称）、`/` 分组、工具卡片、用量控件、第一轮即有上下文环、原生会话按钮与面板、计划待审卡片与获批后的模式同步、普通会话不受影响。

## 6. 待办

- Codex 的调用边界和用量归属需要录制回放的契约测试。协议目前没有单次调用的标识。
- Antigravity 的调用级用量、插话、单独停止子代理和后台任务，要等 ACP（或 agy）提供对应的稳定能力。
- 原生的子代理用量、限额只作为后续的 dock 展示，不进入 dsh 的步骤用量。子代理进 dsh 子代理面板可以用 `ctx.subagents` 的公开接口做（为每个原生子代理建真实子会话），工作量较大，未做。
- 子代理目前只在任务列表里显示状态、用量和停止，不能看完整对话或单独插话。
- 等 dsh 修好冷会话取服务的顺序和客户端目录失效后，再评估技能是否改走隔离的技能注册表。

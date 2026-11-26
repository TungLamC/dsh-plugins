# Native Harness

让 dsh web 会话直接跑在本机 Claude Code、Codex 或 Antigravity CLI（`agy`）上：agent 循环、工具、权限、技能和会话都由它们自己负责，dsh 负责输入、对话展示、审批与提问、用量显示和会话列表。基于 dsh `0.2.2-rc.1`、Claude Code `2.1.303`（经 Agent SDK `0.3.303`）、Codex `0.166.0` 开发和实测，已适配 dsh `0.2.2-rc.5`（在 Claude Code `2.1.328`、Codex `0.170.0` 上实测过基本对话和后台任务）。Antigravity 经官方的 `agy acp`（Agent Client Protocol v1，客户端用 `@agentclientprotocol/sdk` 2.9.1）接入，在 agy `1.5.15` 上实测。CLI 需要已安装、已登录，并在 dsh 宿主进程的 PATH 里。

设计见 [docs/design.md](docs/design.md)。

## 使用

新建会话时在预设菜单里选 **Claude Code**、**Codex** 或 **Antigravity**。第一轮开始后不能再切换预设。Antigravity 和另外两个的不同之处集中写在下面的"Antigravity"一节。

- **模型与推理等级**：composer 右侧的模型按钮，直接显示会话实际使用的模型和推理等级，没有"默认"选项。
  - 菜单分两栏：左栏是可搜索的模型列表，右栏是当前模型支持的推理等级。点模型立即生效，菜单不关，右栏换成新模型的等级，可以接着选；点等级生效后关闭。模型没有推理等级时，点了就关。
  - 键盘：上下键在当前栏里移动，左右键切换栏，Enter 选中，Esc 关闭。搜索只过滤模型。
  - 新会话用插件配置里的默认值（见"安装"），在会话里改过的以会话为准。
  - 列表来自 harness 自己的目录，只改当前会话，不写 dsh 的全局默认模型。
- **端点（Claude）**：配了 `claudeEndpoints`（见"安装"）后，模型菜单里每个端点（比如不同的 API 网关）一组，组里是同一份模型。
  - 点别组的模型，就同时换端点和模型；同一个模型点另一组只换端点，推理等级不变。图标都是 Claude 的，当前端点看菜单里勾选的那一组，或悬停按钮看提示。
  - 对话中途随时可以切，原生会话的上下文保留：插件关掉原生进程，下一条消息在新端点上续接同一个会话，对话里出现一行"已切换到 X"。
  - 空闲时切换，下一条消息就走新端点。轮次进行中切换，本轮（含期间的插话）仍走旧端点，结束后再切；有后台任务在跑时，要等它们全部结束才切，因为重启会杀掉它们。还没切过去时按钮上有一个提示色圆点，菜单里写着在等什么；想马上切，就在"N 个运行中"列表里停掉那些任务。
  - 只改当前会话。新会话用 `defaults.claude-code.endpoint`，没写时用第一个端点。
  - 换端点后第一轮的提示缓存会全部失效。
- **快速模式（Codex）**：当前模型提供 fast 档（Codex 的 `priority` 服务档）时，模型按钮左边出现闪电，位置和 better-providers 给 dsh 的 Codex 路由加的闪电相同。
  - 点亮后每一轮都按 fast 档请求，速度更快，消耗更多额度；悬停可以看到 Codex 对这一档的说明。
  - 轮次进行中切换，提示"下一轮生效"。
  - 新会话的初始值来自配置 `defaults.codex.fast`，默认关闭。换到不提供 fast 档的模型时闪电隐藏，按标准档请求，开关状态保留。
  - Claude 会话没有快速模式。
- **权限**：composer 左侧的权限按钮，列出该 harness 的原生模式：
  - Claude：询问、自动接受编辑、计划、自动、跳过权限检查。
  - Codex：只读、请求批准、自动审核、完全访问，依次对应 TUI `/permissions` 的 Read Only、Ask for approval、Approve for me、Full Access。
    - "请求批准"和"自动审核"的沙箱相同，区别在越权请求由谁批：前者问你，后者交给 Codex 的审核子代理。
    - 这两种模式的 workspace-write 沙箱，除了工作目录，其余可写目录、网络访问和临时目录设置都沿用 Codex 自己的 `~/.codex/config.toml` 里 `[sandbox_workspace_write]` 的配置。要让 Codex 写工作目录以外的目录，就加进那里的 `writable_roots`。
  - 有风险的模式需要确认。
  - 设置无法立即生效时会提示"下一轮生效"。
  - Claude 自己切换的模式会同步到按钮上，比如计划获批后退出计划模式。
- **引用其他对话**：`@` 引用 dsh 的其他对话时，dsh 附上的对话快照（双方的文字和压缩摘要，不含工具调用）会和这条消息一起转给原生。快照大小由 dsh-session-reference 的配置决定。
- **技能与命令**：输入 `/`，菜单里有"Claude Code · 技能 / 命令"或"Codex · 技能 / 命令"分组，内容是 harness 实际发现的技能。
  - Claude 插件技能保留原名，如 `/my-plugin:my-skill`。
  - Codex 技能按原生 `$名称` 语义提交（文本、`text_elements`、带路径的 skill 项）。
  - `/compact` 压缩原生会话。
- **审批与提问**：
  - harness 发起的审批走 dsh 审批面板，只有"允许本次"和"拒绝"。
  - 提问走 dsh 提问卡片。dsh 会话本身是"永不询问"时，审批也改用提问卡片，不会自动同意。
  - Codex 有些命令审批不提供"允许本次"，只能附带条件地允许（比如以后都允许某个命令前缀，或写入网络规则）。这时改用提问卡片，列出原生给的选项。
  - Codex 子代理发起的审批同样弹在当前会话里，标题带"Subagent ·"；父轮次结束不会撤回它。
  - 关闭卡片等于拒绝，提问则视为没有回答。
- **计划审批**：Claude 的计划用 dsh 的"计划待审"卡片审阅，"查看全文"在侧栏打开完整计划。
  - "同意执行"后 Claude 开始执行。
  - "要求修改"会停下当前轮次，你在输入框写的修改意见作为下一条消息发出。
  - 计划正文也显示在对话里 ExitPlanMode 那张工具卡片中。
- **插话与停止**：和两个 TUI 按 Enter 插话、按 Esc 停止的行为一致。停止按钮只停主轮次，子代理和后台任务继续跑（见下一条）。
  - 运行中发送的消息立即转给原生会话，在当前工具调用结束后并入本轮（Claude 用 `priority: 'next'`，Codex 用 `turn/steer`）。
  - 停止按钮中断原生轮次。已发出但原生还没处理的插话不会丢：停止后马上作为新的一轮执行。
  - 停止后再发的新消息，会等被中断的轮次结束后再发出。
  - Claude 会话里以 `/技能` 或 `/命令` 开头的插话是斜杠命令，和 TUI 一样要等当前轮次结束后才单独执行，不会中途并入。想让插话影响当前工作，用普通文字，比如"用 docs 技能查一下"。Codex 的 `$技能` 插话会中途并入。
- **子代理与后台任务**：原生有子代理或后台任务在跑时，输入框下方出现"N 个运行中"按钮，点开是列表，每项显示类型、标题、已运行时长、token 和工具调用次数（能拿到时），可以单独停止。
  - Claude：前台和后台子代理、后台 shell（`run_in_background`）。停止用 `stopTask`；插件声明了 `perTaskStopAffordance`，主停止按钮不再连带结束它们。
  - Codex：每个子代理线程。停止是中断该线程当前的轮次，和 TUI 里在子线程按 Esc 一样；父代理收不到通知，会等到它的等待超时。
  - 还有后台任务在跑时不做空闲回收，等它们结束后再计时。
  - 看不到子代理的完整对话，也不能单独给子代理插话。
- **工具展示**：原生的每次工具调用显示为一张卡片，按原生顺序和正文交错。shell 显示终端输出，编辑显示 diff。
- **任务清单**：harness 维护的任务清单显示在 dsh 的 Todo 栏，对话里是 dsh 的待办卡片。
  - 来源是 Claude 的 TodoWrite / TaskCreate / TaskUpdate 和 Codex 的计划更新。
  - Claude Code 2.1.303 在 Opus 5.x 下默认不提供这些工具（TUI 里也一样），Codex 0.166 配 GPT-6-Astra 也没有 `update_plan`，所以用这些模型时一般不会出现。
- **工作目录**：原生进程在 dsh 当前的工作目录里启动。新建会话时勾了"新建工作树"，原生就在工作树里运行和改文件。
- **原生会话**：会话标题旁的小按钮显示原生会话 id，点开可复制在终端里继续的命令（`claude --resume <id>`、`codex resume <id>` 或 `agy --conversation <id>`，都先 `cd` 到原生会话上次打开时所在的目录，开了工作树就是工作树）。Claude 会话所选端点配了 `command`（比如 `cca`）时，命令里用它代替 `claude`。
  - dsh 还持有原生进程时（空闲 `idleMinutes` 分钟后释放），不要在终端里继续，面板会提示。
  - 在终端里继续后再回到 dsh，原生会话带着终端里的内容，但 dsh 不显示那部分对话。
- **从终端会话继续（Claude）**：还没开始的 Claude Code 会话里，新会话那一行的选项区（"新建工作树"旁边）有"从终端会话继续"。
  - 点开是当前工作目录下在终端里开过的 Claude Code 会话，最近的在前，最多 30 个，显示标题（`/rename` 起的名字、自动摘要或第一句话）、多久之前、分支和短 id。只列在这个目录本身开的会话，子目录和其他工作树里的不列；SDK 会话（`claude -p` 等）和 dsh 自己的原生会话也不列。
  - 默认直接续接：第一条消息就接着那个会话往下写，终端里 `claude --resume` 看到的是同一个会话。勾选"在副本上继续"时，发出第一条消息那一刻复制一份，dsh 在副本上继续，终端里的原会话不变。
  - 终端里还开着的会话标着"终端里开着"，只能在副本上继续。这是读 Claude Code 自己的进程登记（`~/.claude/sessions/`）判断的，格式没有文档，读不出来时当作没开着。
  - 选好后按钮变成"续接：标题"，发出第一条消息之前可以点开换一个，或点 × 取消。第一轮开始时对话里有一行提示。
  - dsh 只显示之后的对话，之前的内容 Claude 都记得。
  - 直接续接过的终端会话之后仍会出现在列表里，不要在两个 dsh 会话里直接续接同一个，否则两边会写同一个会话。
  - 开了"新建工作树"也能用：Claude 在工作树里干活，会话记录仍追加在原目录下。
- **用量**：每个 dsh 步骤对应一次原生模型调用，并带上那次调用的真实用量。dsh 原有的用量、缓存命中率和上下文环可直接使用；Claude 的上下文窗口在第一轮之前就已探测好。

普通 dsh 会话也使用本插件重绘的模型和权限按钮，行为与原生一致：模型选择改当前会话并存为全局默认，权限走 `/permission`。

- 模型菜单同样分两栏，模型按 provider 分组，每行前面是 provider 图标。dsh 自带的 DeepSeek 和 pi-ai 内置的 provider（`openai-codex`、`kimi-coding`、`anthropic` 等）按 id 自带图标；自己定义的 provider 默认没有图标，要的话用配置 `providerIcons` 指定（见"安装"）。普通会话的等级规则跟 dsh 一致：模型有默认等级时，没选过的会话勾在默认等级上，不另列"默认"。
- 装了 agent-team 时，菜单底部有"启用智能体团队协作"开关，行为照 dsh 自己的模型按钮：子代理会话不显示；composer 锁定、保存中或模型选择还没读到时不可点；会话已经用过模型后关闭要先确认。保存失败显示在开关上方。原生会话不显示这个开关，它们不跑 dsh 的工具。

会话在原生预设上一建好（或空白会话切到原生预设），插件就把 dsh 的模型选择改到隐藏 provider，不等第一条消息；better-providers 的闪电这类读 dsh 模型选择的显示会马上跟上。空白会话再切回普通预设时，模型恢复成切换前的选择；宿主重启过、插件不记得切换前的选择时，用 dsh 当前的全局默认模型。

侧栏里空闲会话的标题左侧显示它的引擎图标：Claude Code、Codex、Antigravity 或 dsh。会话有待审批、新消息或正在运行时，这一格由 dsh 的状态点占用。

### Antigravity

- **接入方式**：每个会话启动一个未改动的 `agy acp`，只用 ACP v1 的稳定方法，不读写 `~/.gemini` 下的文件，也不碰登录凭据。agy 自己负责 agent 循环、工具、权限、技能、登录和会话。
- **登录与条款**：用 agy 自己的登录方式（Google 账号、Gemini Enterprise、Gemini API key 都可以），先在终端运行一次 `agy` 登录；没登录时会话报错并提示这一步。用个人订阅时只用于本人的交互式开发：Google 在论坛里答复 T3 Code 的条款问题时，认可的是"单人交互、官方 ACP 程序、原生登录"这种用法，同时说明包装 `agy -p`、转发或提取 OAuth token、多账号轮换会被封号。插件不走 `agy -p`。
- **模型与推理等级**：模型菜单列出 agy 的模型系列（账号可用的 Gemini、Claude、GPT-OSS 等），右栏是 agy 的思考等级。会话中途切换立即生效，不重启进程。
- **权限**：询问、自动接受编辑、自动、计划，对应 agy 的 `default`、`accept-edits`、`auto`、`plan`。agy 自己切换的模式会同步到按钮上。
- **命令与技能**：`/` 菜单里的"Antigravity · 命令"是 agy 推送的命令清单，包括 `/goal`、`/plan`、`/compact` 等内置命令和 agy 读得到的技能。选中后按 `/名称 参数` 发给 agy，由 agy 自己执行。agy 不读 `~/.agents/skills`，那里的技能要在 `~/.gemini/config/skills.json` 里登记才会出现，比如 `{"entries": [{"path": "/home/<用户>/.agents/skills"}]}`。路径要写绝对路径，agy 不展开 `~`，写了会在它的日志里报错并跳过。
- **审批与提问**：agy 的审批走 dsh 审批面板。agy 另外给出"本会话内允许"之类的选项时，改用提问卡片，列出 agy 的原文。agy 的原生提问走提问卡片；关掉卡片或写了选项以外的答案，对 agy 来说是取消。
- **插话与停止**：没有插话。运行中发的消息排队，本轮结束（包括停止）后合成下一轮发出。停止按钮发 ACP 的取消，进程不重启；agy 会连带停掉这个会话的子代理和后台任务。
- **子代理与后台任务**：ACP 把它们当普通工具调用报告，对话里是工具卡片。一轮结束时还在跑的工具（比如 agy 以常驻方式起的开发服务器），卡片标为"结果未知"，同时进入"N 个运行中"列表，直到 agy 报告它结束（自己退出，或被停止按钮连带结束）。列表里没有单独的停止按钮，ACP 没有这个能力。有这样的任务时不做空闲回收，和 Claude、Codex 一样；常驻服务一直开着，agy 进程就一直不回收。普通的后台命令，agy 会等它跑完才结束这一轮，不会进列表。后台任务结束后 agy 自己接着回复时，dsh 新开一轮显示；这一轮在工具都结束、agy 安静 8 秒后结束，或者在你发下一条消息时结束。
- **用量**：agy 不报告单次模型调用的用量。一轮里没有工具调用（只有一次模型调用）时，这一步带整轮的用量；有工具调用的轮次不显示用量，不做估算。上下文窗口取 agy 报告的大小。
- **思考过程**：agy 推送思考文本时显示为推理块；有的模型只给 token 数，没有文本。
- **分叉**：dsh 从中途分叉 Antigravity 会话时，子会话是新的 agy 上下文，对话里有一行说明。
- **目录**：读取模型和命令要开一个空的 agy 对话（agy 的会话列表里不显示，但 `~/.gemini/antigravity-cli/conversations/` 里会多一个文件），第一次约 20 秒，之后缓存 30 分钟。

## 安装

```bash
dsh plugin --profile <profile> add 'github:TungLamC/dsh-plugins#<tag>&path:/native-harness'
```

确认 profile 的 `package.json` 里 `dsh.profile.bundles` 列出了 `dsh-native-harness`，然后重启 dsh。也可以在 dsh 的插件页「添加插件」里填同样的地址。

安装时 pnpm 会装上 Claude Agent SDK 和 ACP SDK。Agent SDK 会按平台一并下载它自带的 Claude Code 二进制，插件用不到它：插件启动的是 PATH 里的 `claude`（或 `claudeCommand` 配置的路径）。想省掉这次下载，可以在 profile 的 `pnpm-workspace.yaml` 里用 `ignoredOptionalDependencies` 列出 `@anthropic-ai/claude-agent-sdk-<平台>`。

插件配置写在 profile 的 `cordis.patch.yml`，按 id `native-harness` 覆盖。dsh 的 patch 会整段替换这一行的 config，没写的字段取下面的默认值：

```yaml
- id: native-harness
  name: dsh-native-harness
  config:
    claudeCommand: claude      # 可执行文件名或绝对路径
    claudeEntrypoint: native-harness   # Claude 进程的 CLAUDE_CODE_ENTRYPOINT，空表示用 Agent SDK 的 sdk-ts
    claudeEndpoints: []        # Claude 可切换的端点，空表示按 NATIVE_HARNESS_ANTHROPIC_* 连接，见下文
    codexCommand: codex
    antigravityCommand: agy    # 以 `agy acp` 启动
    idleMinutes: 15            # 空闲多少分钟后关闭原生进程
    defaults:                  # 新会话的模型、推理等级和权限模式 id，Claude 另有端点，Codex 另有快速模式
      claude-code: { model: opus, effort: xhigh, mode: auto, endpoint: '' }   # endpoint 空表示第一个端点
      codex: { model: gpt-6-astra, effort: xhigh, mode: auto-review, fast: false }
      antigravity: { model: gemini-4-neon, effort: high, mode: auto }
    providerIcons: {}          # 模型菜单里 provider 的图标，按 provider id 写
```

模型 id 用 harness 自己的名字（Claude 的别名如 `opus`、`sonnet`，Codex 的模型名，Antigravity 的模型系列如 `gemini-4-neon`、`gemini-3.8-flash`、`claude-opus-5-5`），权限模式 id 是：Claude 的 `default`、`acceptEdits`、`plan`、`auto`、`bypassPermissions`，Codex 的 `read-only`、`auto`（请求批准）、`auto-review`、`full-access`，Antigravity 的 `default`、`accept-edits`、`auto`、`plan`。Antigravity 的推理等级是 agy 的思考等级（`low`、`medium`、`high`、`xhigh`，按模型而定）。推理等级不在所选模型支持的范围内时，改用该模型自己的默认等级。`defaults.codex.fast` 只对提供 fast 档的模型起作用。

`claudeEndpoints` 列出 Claude Code 可以切换的上游，比如两个 API 网关：

```yaml
    claudeEndpoints:
      - id: gateway-a          # 字母、数字、_ . -，存进每个会话，改了会话就回到默认端点
        name: Gateway A        # 菜单里的分组名，空表示用 id
        command: cca           # 续接命令里代替 claude 的命令，比如 shell alias；空表示 claude
        env:
          ANTHROPIC_BASE_URL: https://gateway-a.example.com
          ANTHROPIC_API_KEY: $GATEWAY_A_KEY
      - id: gateway-b
        name: Gateway B
        command: ccb
        env:
          ANTHROPIC_BASE_URL: https://gateway-b.example.com
          ANTHROPIC_API_KEY: $GATEWAY_B_KEY
```

- `env` 写进这个端点上的 Claude 进程。写入前先删掉从 dsh 宿主继承来的 `ANTHROPIC_BASE_URL`、`ANTHROPIC_API_KEY`、`ANTHROPIC_AUTH_TOKEN`，宿主自己的上游不会混进来。用 Bearer 认证的网关写 `ANTHROPIC_AUTH_TOKEN`。
- 值恰好是 `$名字` 时，在进程启动时读取，密钥不用写进配置：先从 DSH 凭据存储读取（比如在 Models 页保存的密钥，或别的插件用 `ctx.credentials.set` 写入的值），没有再读 dsh 宿主环境变量和 `.env`（项目目录的 `.env`、`$DSH_HOME/.env`）。几处都没有时，那一轮报错并指出缺哪个变量。只有整个值是 `$名字` 才算引用，`a$B` 原样传。
- 同一个名字在凭据存储和环境变量里都有时，以凭据存储的为准，这一点和以前只读环境变量时不同。要改回用环境变量里的值，先从凭据存储里删掉它。凭据存储里的值改了，下次启动 Claude 进程时生效，正在运行的进程不变。
- id 重复，或 `defaults.claude-code.endpoint` 不是某个端点的 id 时，插件加载失败。
- 模型目录和上下文窗口按默认端点探测一次，所有端点共用。

没配 `claudeEndpoints` 时，模型菜单里只有一组"Claude Code"，Claude 进程连哪个上游由三个变量决定，各自写进 Claude Code 认的变量：

- `NATIVE_HARNESS_ANTHROPIC_BASE_URL` → `ANTHROPIC_BASE_URL`
- `NATIVE_HARNESS_ANTHROPIC_AUTH_TOKEN` → `ANTHROPIC_AUTH_TOKEN`
- `NATIVE_HARNESS_ANTHROPIC_API_KEY` → `ANTHROPIC_API_KEY`

说明：

- 读法和端点的 `$名字` 一样：每次启动 Claude 进程时读一次，先查 DSH 凭据存储（比如别的插件用 `ctx.credentials.set` 写入的值），没有再查 dsh 宿主环境变量和 `.env`。凭据存储里的值改了，下次启动 Claude 进程时生效，正在运行的进程不变。
- `AUTH_TOKEN` 和 `API_KEY` 只需填一个：网关用 Bearer 认证就填 `AUTH_TOKEN`，用 `x-api-key` 就填 `API_KEY`。填了 `BASE_URL`、两个都没填时，那一轮报错并指出缺哪个变量，不启动 Claude 进程。不填 `BASE_URL` 时，Claude Code 连它默认的地址。
- 三个里设了任意一个，就先删掉从 dsh 宿主继承来的 `ANTHROPIC_BASE_URL`、`ANTHROPIC_API_KEY`、`ANTHROPIC_AUTH_TOKEN`，再写入上面的值，宿主自己的上游不会混进来。三个都没设时，原样沿用 dsh 宿主环境。
- 名字带 `NATIVE_HARNESS_` 前缀，是因为 DSH 内置的 `llm-pi-ai` 也读 `ANTHROPIC_API_KEY`、`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_OAUTH_TOKEN`，而且先查凭据存储。不带前缀的名字写进存储，会被 DSH 自己的 Anthropic provider 拿去用；带前缀的名字只有本插件读。
- 模型目录和上下文窗口的探测进程同样按这三个变量连接。
- 配了 `claudeEndpoints` 时完全按所选端点的 `env`，不读这三个变量。

`providerIcons` 的 key 是 provider id，也就是 `llm-pi-ai` 配置里 `providers:` 下面的名字；值是下面三种之一：

- 插件自带的图标名：`anthropic`、`antigravity`、`azure`、`baseten`、`bedrock`、`cerebras`、`claude`、`cloudflare`、`deepseek`、`doubao`、`fireworks`、`gemini`、`githubcopilot`、`google`、`groq`、`huggingface`、`kimi`、`ling`、`meta`、`minimax`、`mistral`、`moonshot`、`nvidia`、`openai`、`opencode`、`openrouter`、`qwen`、`together`、`vercel`、`vertexai`、`volcengine`、`xai`、`xiaomimimo`、`zai`、`zhipu`。写了不在这里的名字，加载配置时会报错并列出可用的名字。
- 图片地址：`https://`、`http://` 或 `data:image/` 开头，按 16×16 显示。
- 空字符串：不显示图标，可以用来去掉内置 provider 的图标。

```yaml
    providerIcons:
      ark: volcengine          # 自定义的火山方舟 provider
      my-proxy: https://example.com/logo.png
```

内置图标对应的 provider id 见 `src/shared/icons.ts` 的 `BUILTIN_ICONS`：dsh 的 `deepseek-account`、`deepseek-official`，以及 pi-ai 内置的 provider（截至 dsh 0.2.2-rc.5，`radius`、`typesafe` 没有图标）。配置里写了的以配置为准。

`claudeEntrypoint` 是 Claude Code 随每个请求告诉 Anthropic 的客户端标签。插件默认填 `native-harness`，如实说明调用方是这个插件；配成空字符串时由 Agent SDK 填 `sdk-ts`。只有用 Claude 订阅登录时它才有影响：社区实测（[anthropics/claude-code#97074](https://github.com/anthropics/claude-code/issues/97074)）中，`sdk-*` 标签消耗 5 小时额度的速度约是交互式终端的 2 倍，换成工具自己的名字后与终端持平。Anthropic 没有确认这一点，以后也可能改变；它的 Agent SDK 文档还要求第三方产品使用 API key 而不是 claude.ai 登录。要改的话，也用能如实说明调用方的名字，不要用 `cli`、`claude-vscode`、`t3-code` 这类属于其他客户端的标签。从继承环境带来的标签总会被清掉。

## 开发

在仓库根目录 `pnpm install` 之后，在本目录：

```bash
pnpm build         # 类型检查并重新生成 lib/（仓库根目录的 scripts/build.ts）
pnpm test          # 库级测试：Fake harness + 安装版 dsh agent-loop / token-meter / tool-todo / native 工具执行器；Antigravity Adapter 对接用 ACP SDK 搭的假 agent
```

本插件基于 dsh 0.2.2-rc.5 构建和测试，dsh 的开发依赖来自 `pnpm-workspace.yaml` 的 `dsh-0.2.2` catalog。改完源码先构建，再把 `lib/` 和源码一起提交。

## 已知限制

- dsh 全局的 `/model`（客户端贡献）和 `/permission` 仍会出现在 `/` 菜单里。harness 会话请用 composer 按钮。
  - 在 harness 会话里用 `/model` 不会换掉原生模型，插件会马上把会话改回原生路由；dsh 仍会把选中的模型存为全局默认。
  - 如果 `/model` 和发送恰好挤在同一时刻，那一步会报错"不能从 dsh 切换模型"，不会发给别的模型，这条消息需要重发。
- dsh 0.2.2-rc.5 起，其他插件可以往 dsh 模型菜单里加会话选项（`conversation.input.model.options`）。这个子槽位只由 dsh 自己的模型按钮渲染，本插件替换了模型按钮，只重画了其中 agent-team 的开关，其他插件加的选项在普通会话里看不到。
- 原生进程打开之后，dsh 的工作目录再变（比如工作树被删，dsh 退回项目目录），要等原生进程重新打开才跟上，一般是空闲回收后的下一条消息。
- 工作树被删后选"在项目目录继续"，Claude 可能续接不上原会话：Claude 按项目目录保存会话，原会话记在工作树目录下。
- dsh 的标题生成、压缩等辅助请求不会转给原生 harness。
- Codex 的模型调用边界由 `thread/tokenUsage/updated` 的到达顺序推断，协议没有单次调用的标识。Antigravity 也一样：ACP 不报告调用边界，插件把"一段正文加它提出的工具调用"算作一次调用，工具开始运行或请求审批时结束。
- 原生在没有新的 dsh 步骤等待时继续工作，dsh 会在新的一轮里显示输出，开头是 dsh 自己的触发卡片，标题固定为"收到执行请求"，正文说明原因：本轮还在继续、正在处理之前发送还没处理的消息（排队的斜杠命令、停止时保留的插话），或没有新输入时继续了（后台任务结束、hook 续跑）。
- 子代理只显示为父会话里的一张工具卡片和任务列表里的一项，不进 dsh 的子代理页面。
- 计划的侧栏全文预览是临时的，刷新页面后消失；对话里不会留下 dsh 计划模式那种常驻计划卡片，计划正文看 ExitPlanMode 工具卡片。
- dsh 每开新的一轮都会清空 Todo 栏；原生同一轮里插件偶尔会开新的 dsh 轮次，Todo 栏会暂时消失到下一次更新。
- Antigravity 的原生提问是靠 agy 的一个没写进文档的约定识别的（工具调用 id 以 `interaction_` 开头，T3 Code 也这样判断）。agy 改了约定时，提问会显示成列出同样选项的审批卡片，照样能答。
- Antigravity 的后台任务是按"一轮结束时还没结束的工具"认出来的。agy 要是一直不报告某个工具结束，它会一直留在"N 个运行中"里，这个会话的 agy 进程也一直不回收。
- 图标来自 Lobe Icons（`@lobehub/icons-static-svg` 1.102.0，MIT，Copyright (c) 2023 LobeHub），路径未改动，许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。引擎品牌图标用 `claude-color`、`codex`，Antigravity 用 `antigravity-color`；模型菜单里的 provider 图标用上面列出的名字对应的文件，有 `-color` 版本时用 `-color` 版本，由 `scripts/provider-marks.ts` 从图标包生成到 `src/client/provider-marks.ts`，只去掉了标题、改写了渐变 id。
- 模型菜单和 `/` 菜单的模糊排序移植自 DeepSeek Harness 0.2.2-rc.5 的 `rankByName`（MIT，Copyright (c) 2026 DeepSeek，许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)）。dsh 0.2.3 删掉了这个导出，插件自带一份，在新旧版本上排序一致。

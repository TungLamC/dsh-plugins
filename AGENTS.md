# dsh-plugins

DeepSeek Harness（dsh）插件集合，每个插件一个顶层目录。

## 插件结构

每个插件目录自成一体：有自己的 `package.json` 和 README，只 import 本目录内的文件和声明过的依赖，单独拿出去也能运行。dsh 提供的包（`@deepseek-ai/cordis` 等）写成 `peerDependencies`，由使用方的 profile 提供。

## 依赖版本

- 开发依赖从 `pnpm-workspace.yaml` 的 catalog 取版本。默认 `catalog:` 对应一个 dsh 版本；需要更新 dsh 的插件，dsh 相关的开发依赖改用命名 catalog（例如 `catalog:dsh-0.2.2`）。构建脚本按插件 dsh 开发依赖所在的 catalog 判断它针对哪个 dsh 版本，并据此检查 `engines.dsh`。
- 每个插件有自己的 lockfile 和 `node_modules`（`sharedWorkspaceLockfile: false`），不同 dsh 版本的包不会互相解析到对方。仓库根目录只放构建和测试工具。

## 从 GitHub 安装带来的约束

用户不经过 npm，直接从 GitHub 安装单个插件：

```
github:TungLamC/dsh-plugins#<tag>&path:/<插件目录>
```

pnpm 拿到的是仓库里的原样文件，所以每个插件要满足：

- `lib/` 随源码一起提交：dsh 加载的是构建产物，用户那边不会构建。改完源码先构建，再提交。
- `dependencies` 和 `peerDependencies` 写真实的版本范围，`catalog:`、`workspace:` 只用在 `devDependencies` 里：这两种写法只有 `pnpm publish` / `pack` 才会替换成版本号，从 git 安装会报 `ERR_PNPM_SPEC_NOT_SUPPORTED_BY_ANY_RESOLVER`；`devDependencies` 用户不安装。
- 构建在仓库根目录统一执行，插件 `package.json` 的 `scripts` 只放 `build`、`test` 这类不参与安装的脚本：带 `prepare` 或 `prepack` 的 git 依赖会被 pnpm 拒装（`ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`）。

## 分支

- `develop`：开发分支，所有改动都进这里。
- `main`：默认分支，只放已发布版本。

两个分支都保持线性历史。

## 开发与协作

- 维护者直接在 `develop` 上提交并推送；其他协作者从 `develop` 开分支开发，PR 提到 `develop`。
- 同步 `develop` 用 `git pull --rebase`。
- 合并 PR 用 GitHub 的 Rebase and merge 或 Squash and merge，`develop` 保持线性。

## 发布

`main` 只通过快进跟上 `develop`：

```bash
git push origin develop:main
```

再打 tag 并推送。`develop` 到 `main` 走这条命令，不走 PR：GitHub 页面上的合并按钮都会生成新提交，让两个分支分叉。

已推送的历史保持原样，修正用新提交：用户的 lockfile 按提交 hash 锁定，改写历史会让他们重装时 404。

## 提交

仓库公开，提交信息只描述插件改动。提交信息、tag、release notes、PR 描述、代码和文档里都不出现 agent 署名（`Co-Authored-By`、`Generated with ...` 之类）。

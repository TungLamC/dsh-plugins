/** Copy of the models part: the refresh row on provider cards and its preview dialog. */

export const NS = 'better-providers-models'

export const zh = {
  title: '刷新模型',
  source: '模型来源：',
  refresh: '刷新模型',
  dialogTitle: '刷新 {provider} 的模型',
  loading: '正在从 pi.dev 拉取模型列表…',
  'group.added': '新增 {count}',
  'group.removed': '已下架 {count}',
  'group.skipped': '无法添加 {count}',
  'group.unchanged': '未变化 {count}',
  'hint.removed': 'pi.dev 上已经没有这些模型，勾选的会保留在列表里。',
  inherited: '内置目录里已有，沿用目录里的全部信息',
  'skip.api': '协议和这个服务商不同',
  'skip.endpoint': '接口地址和这个服务商不同',
  'skip.invalid': '目录数据不完整',
  showUnchanged: '展开未变化的模型',
  hideUnchanged: '收起未变化的模型',
  upToDate: '模型列表和 pi.dev 上的一致。',
  firstWrite: '这是当前 profile 第一次写入服务商设置：所有共享的服务商配置会一起复制进 profile，之后修改共享配置不再影响这个 profile。',
  'blocked.expression': '这个服务商的设置用了 !!js 表达式，不能在这里写入，请直接改 cordis.patch.yml。',
  'blocked.overridden': 'llm-pi-ai 的设置被家目录的 cordis.patch.yml 或命令行参数覆盖，不能在这里写入。',
  apply: '写入',
  cancel: '取消',
  close: '关闭',
  retry: '重试',
  'outcome.applied': '模型列表已更新。',
  'outcome.unchanged': '没有需要写入的更改。',
  'outcome.stale': '设置在预览后有改动，已重新对比。',
  'outcome.rejected': 'dsh 拒绝了新的设置：{detail}',
  'refused.bad-provider': '这个服务商不在 pi-ai 内置目录里，无法刷新。',
  'refused.unsupported': '这个服务商不在 pi-ai 内置目录里，无法刷新。',
  'refused.pi-ai-mismatch': '插件和 dsh 加载的不是同一份 pi-ai，无法刷新。',
  'refused.bad-choice': '勾选的模型和预览对不上，请重新打开。',
  'refused.catalog-unreachable': '无法连接 pi.dev，请稍后重试。',
  'refused.catalog-unknown': 'pi.dev 上没有这个服务商的目录。',
  'refused.catalog-invalid': 'pi.dev 返回的目录无法识别。',
  failed: '刷新失败：{message}',
}

export type LocaleKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'better-providers-models': LocaleKey
  }
}

export const en: Record<LocaleKey, string> = {
  title: 'Refresh models',
  source: 'Source: ',
  refresh: 'Refresh models',
  dialogTitle: 'Refresh {provider} models',
  loading: 'Fetching the model list from pi.dev…',
  'group.added': 'New {count}',
  'group.removed': 'Withdrawn {count}',
  'group.skipped': 'Cannot be added {count}',
  'group.unchanged': 'Unchanged {count}',
  'hint.removed': 'pi.dev no longer lists these models; checked ones stay in the list.',
  inherited: 'In the built-in catalog; keeps everything the catalog knows',
  'skip.api': 'Uses another protocol than this provider',
  'skip.endpoint': 'Uses another endpoint than this provider',
  'skip.invalid': 'Incomplete catalog data',
  showUnchanged: 'Show unchanged models',
  hideUnchanged: 'Hide unchanged models',
  upToDate: 'The model list matches pi.dev.',
  firstWrite: 'This is the first provider setting this profile writes: every shared provider configuration is copied into the profile, and later changes to the shared configuration no longer reach it.',
  'blocked.expression': 'This provider\'s settings use a !!js expression and cannot be written here; edit cordis.patch.yml instead.',
  'blocked.overridden': 'The llm-pi-ai settings are overridden by the home cordis.patch.yml or a command-line option and cannot be written here.',
  apply: 'Write',
  cancel: 'Cancel',
  close: 'Close',
  retry: 'Retry',
  'outcome.applied': 'The model list is updated.',
  'outcome.unchanged': 'There is nothing to write.',
  'outcome.stale': 'The settings changed after the preview; compared again.',
  'outcome.rejected': 'dsh refused the new settings: {detail}',
  'refused.bad-provider': 'This provider is not in pi-ai\'s built-in catalog and cannot be refreshed.',
  'refused.unsupported': 'This provider is not in pi-ai\'s built-in catalog and cannot be refreshed.',
  'refused.pi-ai-mismatch': 'This plugin and dsh load different copies of pi-ai, so models cannot be refreshed.',
  'refused.bad-choice': 'The checked models do not match the preview; open it again.',
  'refused.catalog-unreachable': 'pi.dev cannot be reached; try again later.',
  'refused.catalog-unknown': 'pi.dev has no catalog for this provider.',
  'refused.catalog-invalid': 'pi.dev answered with a catalog that cannot be read.',
  failed: 'Refresh failed: {message}',
}

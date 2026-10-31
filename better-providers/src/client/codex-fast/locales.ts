/** Copy of the codex-fast part: the composer's fast-mode switch and the row's settings page. */

import { FORM_COPY } from '../kit/form-copy.ts'

export const NS = 'better-providers-codex-fast'

export const zh = {
  ...FORM_COPY.zh,
  label: '快速模式',
  'title.off': '开启快速模式（消耗更多额度）',
  'title.on': '快速模式已开启，点击关闭',
  'title.unsupported': '当前 dsh 的 pi-ai 不支持快速模式，详见日志',
  failed: '保存失败',
  'settings.default': '新会话默认开启',
  'settings.summary.on': '新会话默认开启',
  'settings.summary.off': '新会话默认关闭',
}

export type LocaleKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'better-providers-codex-fast': LocaleKey
  }
}

export const en: Record<LocaleKey, string> = {
  ...FORM_COPY.en,
  label: 'Fast mode',
  'title.off': 'Turn on fast mode (uses more of your limits)',
  'title.on': 'Fast mode is on; click to turn it off',
  'title.unsupported': 'Fast mode does not work with this dsh\'s pi-ai; see the log',
  failed: 'Not saved',
  'settings.default': 'On for new sessions',
  'settings.summary.on': 'On for new sessions',
  'settings.summary.off': 'Off for new sessions',
}

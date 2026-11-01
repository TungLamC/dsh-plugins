/** Copy of the settings page on the plugin's page. */

export const NS = 'web-access'

export const zh = {
  'form.unavailable': '插件没有在运行，暂时无法修改设置。',
  'form.readOnly': '配置文件为只读，暂时无法保存。',
  'form.saveFailed': '保存失败，请重试。',
  'form.save': '保存',
  'form.saving': '正在保存…',
  'form.overridden': '已修改',
  'form.reset': '恢复默认',
  'tier.codex': 'Codex',
  'tier.openai': 'OpenAI',
  'tier.gemini': 'Gemini',
  'tier.exa': 'Exa',
  'tier.parallel': 'Parallel',
  'tier.anysearch': 'AnySearch',
  'model.label': '{tier} 搜索用的模型',
  'model.auto': '自动',
  'model.noRoute': '模型页未添加',
}

export type LocaleKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'web-access': LocaleKey
  }
}

export const en: Record<LocaleKey, string> = {
  'form.unavailable': 'The plugin is not running; its settings cannot be changed now.',
  'form.readOnly': 'The configuration is read-only; changes cannot be saved.',
  'form.saveFailed': 'Saving failed. Try again.',
  'form.save': 'Save',
  'form.saving': 'Saving…',
  'form.overridden': 'Changed',
  'form.reset': 'Reset to default',
  'tier.codex': 'Codex',
  'tier.openai': 'OpenAI',
  'tier.gemini': 'Gemini',
  'tier.exa': 'Exa',
  'tier.parallel': 'Parallel',
  'tier.anysearch': 'AnySearch',
  'model.label': 'Model {tier} searches with',
  'model.auto': 'Automatic',
  'model.noRoute': 'Not on Models page',
}

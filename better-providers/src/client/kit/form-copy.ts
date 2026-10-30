/** Copy of the settings form's frame on a row's page (row-config.tsx). */

/** Spread into the dictionaries of each namespace a row page uses. */
export const FORM_COPY = {
  zh: {
    'form.unavailable': '这一行没有在运行，暂时无法修改设置。',
    'form.readOnly': '配置文件为只读，暂时无法保存。',
    'form.saveFailed': '保存失败，请检查输入后重试。',
    'form.save': '保存',
    'form.saving': '正在保存…',
    'form.overridden': '已修改',
    'form.reset': '恢复默认',
  },
  en: {
    'form.unavailable': 'This row is not running; its settings cannot be changed now.',
    'form.readOnly': 'The configuration is read-only; changes cannot be saved.',
    'form.saveFailed': 'Saving failed. Check the values and try again.',
    'form.save': 'Save',
    'form.saving': 'Saving…',
    'form.overridden': 'Changed',
    'form.reset': 'Reset to default',
  },
} as const

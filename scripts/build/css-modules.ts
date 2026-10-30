/**
 * Stylesheets for the browser bundle. dsh loads a plugin's browser half as one
 * script, so each stylesheet becomes a module that injects its compiled CSS once
 * (tagged with the package and file) and, for `*.module.css`, exports the hashed
 * class names. Module ids are relative to the plugin, so output does not depend
 * on where the repository is checked out.
 */

import { readFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { transform } from 'lightningcss'
import type { Rolldown } from 'tsdown'

const PREFIX = '\0dsh-css:'
// A non-CSS extension keeps the bundler's own stylesheet handling away from these modules.
const SUFFIX = '.mjs'

export function cssModules(pkg: string, root: string): Rolldown.Plugin {
  return {
    name: 'dsh-css',
    resolveId(source, importer) {
      if (!source.endsWith('.css') || importer === undefined) return null
      const file = resolve(dirname(importer), source)
      return PREFIX + relative(root, file).replaceAll('\\', '/') + SUFFIX
    },
    async load(id) {
      if (!id.startsWith(PREFIX)) return null
      const name = id.slice(PREFIX.length, -SUFFIX.length)
      const file = resolve(root, name)
      this.addWatchFile(file)
      const module = name.endsWith('.module.css')
      const { code, exports } = transform({
        filename: name,
        code: await readFile(file),
        minify: true,
        ...module ? { cssModules: { pattern: '[hash]_[local]' } } : {},
      })
      const classes = Object.fromEntries(Object.entries(exports ?? {}).map(([local, value]) => [local, value.name]))
      const tag = `${pkg}/${name}`
      return [
        `const tag = ${JSON.stringify(tag)};`,
        'if (!document.querySelector(`style[data-plugin-css="${tag}"]`)) {',
        '  const style = document.createElement("style");',
        '  style.dataset.pluginCss = tag;',
        `  style.textContent = ${JSON.stringify(code.toString())};`,
        '  document.head.appendChild(style);',
        '}',
        `export default ${JSON.stringify(module ? classes : {})};`,
      ].join('\n')
    },
  }
}

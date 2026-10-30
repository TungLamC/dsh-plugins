/**
 * Checks on build output: what the committed `lib/` may load at runtime.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { join, relative } from 'node:path'
import { init, parse } from 'es-module-lexer'
import type { Manifest } from './manifest.ts'

/** The package a bare specifier names (`@scope/name/sub` → `@scope/name`). */
function packageOf(specifier: string): string {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0] ?? specifier
}

function* jsFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* jsFiles(path)
    else if (entry.name.endsWith('.js')) yield path
  }
}

/**
 * Every `require()` in the browser bundle names an allowed module, and the bundle has no Node imports.
 * @returns the violations.
 */
export function checkClientBundle(file: string, externals: ReadonlySet<string>): string[] {
  const code = readFileSync(file, 'utf8')
  const problems: string[] = []
  for (const match of code.matchAll(/\brequire\(\s*(["'])([^"']+)\1\s*\)/g)) {
    const specifier = match[2] ?? ''
    if (!externals.has(specifier)) problems.push(`${file}: requires "${specifier}", which the dsh web shell does not provide`)
  }
  if (/["']node:/.test(code)) problems.push(`${file}: references a node: module`)
  return problems
}

/**
 * Every bare import in the Host output is a Node builtin or a declared peer/dependency.
 * @returns the violations.
 */
export async function checkHostImports(dir: string, manifest: Manifest, libDirs: readonly string[]): Promise<string[]> {
  await init
  const declared = new Set([...Object.keys(manifest.peerDependencies ?? {}), ...Object.keys(manifest.dependencies ?? {})])
  const builtins = new Set(builtinModules)
  const problems: string[] = []
  for (const libDir of libDirs) {
    for (const file of jsFiles(join(dir, libDir))) {
      const [imports] = parse(readFileSync(file, 'utf8'))
      for (const { n: specifier } of imports) {
        if (specifier === undefined || specifier.startsWith('.') || specifier.startsWith('node:')) continue
        if (builtins.has(specifier) || declared.has(packageOf(specifier))) continue
        problems.push(`${relative(dir, file)}: imports "${specifier}", which is neither a Node builtin nor a declared peer/dependency`)
      }
    }
  }
  return problems
}

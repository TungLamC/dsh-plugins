/**
 * Plugin manifest rules that follow from installing plugins straight from a GitHub
 * subdirectory: no install-time scripts, no workspace-only version protocols in
 * fields users install, and a dsh range that admits the dsh release we build for.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import semver from 'semver'

export interface Manifest {
  name: string
  version?: string
  exports?: Record<string, string | Record<string, string>>
  files?: string[]
  engines?: Record<string, string>
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  dsh?: { bundle?: { patch?: string | string[] }; client?: { platform: string; inject?: string[]; external?: string[] } }
}

/** Lifecycle scripts pnpm would run (or refuse to run) when installing from git. */
const INSTALL_SCRIPTS = ['preinstall', 'install', 'postinstall', 'prepare', 'prepack', 'postpack']
/** Version protocols only a workspace can resolve. */
const WORKSPACE_PROTOCOL = /^(catalog|workspace|link|file):/

export function readManifest(dir: string): Manifest {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8').replace(/^﻿/, '')) as Manifest
}

/**
 * The dsh release the workspace builds against: the catalog pin of `@deepseek-ai/dsh-llm`.
 * @param root - the workspace root.
 */
export function catalogDshVersion(root: string): string {
  const yaml = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')
  const match = /^\s+'@deepseek-ai\/dsh-llm':\s*(\S+)\s*$/m.exec(yaml)
  if (match?.[1] === undefined) throw new Error('pnpm-workspace.yaml: no catalog pin for @deepseek-ai/dsh-llm')
  return match[1]
}

/** Whether a `files` pattern list covers a package-relative path. */
function covered(files: readonly string[], path: string): boolean {
  const clean = path.replace(/^\.\//, '')
  return files.some((pattern) => {
    const source = pattern
      .split(/(\*\*\/|\*)/)
      .map(part => part === '**/' ? '(?:.*/)?' : part === '*' ? '[^/]*' : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('')
    return new RegExp(`^${source}$`).test(clean)
  })
}

/**
 * Check a plugin manifest.
 * @param manifest - the parsed package.json.
 * @param dshVersion - the dsh release the workspace builds against.
 * @returns every violation found; empty when the manifest is fine.
 */
export function checkManifest(manifest: Manifest, dshVersion: string): string[] {
  const problems: string[] = []
  for (const script of INSTALL_SCRIPTS) {
    if (manifest.scripts?.[script] !== undefined) problems.push(`scripts.${script}: installs from git refuse or run it; build in the workspace instead`)
  }
  for (const field of ['dependencies', 'peerDependencies'] as const) {
    for (const [name, range] of Object.entries(manifest[field] ?? {})) {
      if (WORKSPACE_PROTOCOL.test(range)) problems.push(`${field}.${name}: "${range}" cannot be resolved by a GitHub install; write a real range`)
    }
  }
  const dsh = manifest.engines?.dsh
  if (dsh === undefined) problems.push('engines.dsh: missing')
  else if (semver.validRange(dsh) === null) problems.push(`engines.dsh: "${dsh}" is not a valid range`)
  else if (!semver.satisfies(dshVersion, dsh, { includePrerelease: true })) problems.push(`engines.dsh: "${dsh}" excludes dsh ${dshVersion}`)
  const files = manifest.files ?? []
  for (const [key, target] of Object.entries(manifest.exports ?? {})) {
    const path = typeof target === 'string' ? target : target['default']
    if (path === undefined || path === './package.json') continue
    if (!covered(files, path.replace('*', 'x'))) problems.push(`exports["${key}"]: ${path} is not covered by files`)
  }
  if (manifest.dsh?.client !== undefined && manifest.exports?.['./client'] === undefined) {
    problems.push('exports["./client"]: required by dsh.client')
  }
  return problems
}

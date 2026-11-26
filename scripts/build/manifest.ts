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
 * The catalog a plugin takes its dsh packages from: the name in `catalog:<name>`
 * of its `@deepseek-ai/dsh*` devDependencies, or undefined for the default catalog.
 * @throws when the plugin's dsh devDependencies name more than one catalog.
 */
export function dshCatalog(manifest: Manifest): string | undefined {
  const names = new Set<string>()
  for (const [name, range] of Object.entries(manifest.devDependencies ?? {})) {
    if (name.startsWith('@deepseek-ai/dsh') && range.startsWith('catalog:')) names.add(range.slice('catalog:'.length))
  }
  if (names.size > 1) throw new Error(`${manifest.name}: dsh devDependencies come from several catalogs (${[...names].map(name => name || 'default').join(', ')})`)
  const [name] = names
  return name === undefined || name === '' || name === 'default' ? undefined : name
}

/** The lines of one catalog in pnpm-workspace.yaml: the default `catalog:` or a named one under `catalogs:`. */
function catalogLines(yaml: string, catalog: string | undefined): string[] {
  const lines = yaml.split('\n')
  const indent = (line: string): number => line.length - line.trimStart().length
  const body = (start: number, depth: number): string[] => {
    const end = lines.findIndex((line, index) => index > start && line.trim() !== '' && !line.trimStart().startsWith('#') && indent(line) <= depth)
    return lines.slice(start + 1, end === -1 ? undefined : end)
  }
  if (catalog === undefined) {
    const start = lines.indexOf('catalog:')
    return start === -1 ? [] : body(start, 0)
  }
  const section = lines.indexOf('catalogs:')
  if (section === -1) return []
  const named = body(section, 0)
  const start = named.findIndex(line => indent(line) === 2 && [`${catalog}:`, `'${catalog}':`, `"${catalog}":`].includes(line.trim()))
  return start === -1 ? [] : body(section + 1 + start, 2)
}

/**
 * The dsh release a catalog stands for: its pin of `@deepseek-ai/dsh-llm`.
 * @param root - the workspace root.
 * @param catalog - a named catalog; the default catalog when omitted.
 */
export function catalogDshVersion(root: string, catalog?: string): string {
  const yaml = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')
  for (const line of catalogLines(yaml, catalog)) {
    const match = /^\s+'@deepseek-ai\/dsh-llm':\s*(\S+)\s*$/.exec(line)
    if (match?.[1] !== undefined) return match[1]
  }
  throw new Error(`pnpm-workspace.yaml: no pin for @deepseek-ai/dsh-llm in ${catalog === undefined ? 'the default catalog' : `catalog "${catalog}"`}`)
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
 * @param dshVersion - the dsh release the plugin is built against.
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
  // dsh packages are versioned with dsh itself: the peer ranges on them state the same support as engines.dsh.
  for (const [name, range] of Object.entries(manifest.peerDependencies ?? {})) {
    if (name.startsWith('@deepseek-ai/dsh') && dsh !== undefined && range !== dsh) {
      problems.push(`peerDependencies.${name}: "${range}" differs from engines.dsh "${dsh}"`)
    }
  }
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

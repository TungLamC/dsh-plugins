/**
 * Build or check the workspace's plugins.
 *
 *   node scripts/build.ts [plugin…]          rebuild lib/ of every (or the named) plugin
 *   node scripts/build.ts --check [plugin…]  type-check and validate without touching lib/
 *
 * Host modules compile file by file with tsc into lib/; the browser half bundles into
 * lib/client.js. lib/ is committed, since GitHub installs do not build.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildClient, clientExternals } from './build/client.ts'
import { checkClientBundle, checkHostImports } from './build/checks.ts'
import { catalogDshVersion, checkManifest, dshCatalog, readManifest } from './build/manifest.ts'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const TSC = createRequire(import.meta.url).resolve('typescript/bin/tsc')

function tsc(project: string, check: boolean): void {
  const result = spawnSync(process.execPath, [TSC, '-p', project, ...check ? ['--noEmit'] : []], { stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`tsc -p ${project} failed`)
}

function fail(plugin: string, problems: readonly string[]): void {
  if (problems.length === 0) return
  throw new Error(`${plugin}:\n${problems.map(problem => `  - ${problem}`).join('\n')}`)
}

/** Workspace plugins: top-level directories whose package.json declares a dsh bundle. */
function plugins(): string[] {
  return readdirSync(ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
    .map(entry => entry.name)
    .filter(name => existsSync(join(ROOT, name, 'package.json')) && readManifest(join(ROOT, name)).dsh?.bundle !== undefined)
}

async function run(plugin: string, check: boolean): Promise<void> {
  const dir = join(ROOT, plugin)
  const manifest = readManifest(dir)
  // The dsh release a plugin is built for is the one its catalog pins.
  fail(plugin, checkManifest(manifest, catalogDshVersion(ROOT, dshCatalog(manifest))))

  if (!check) rmSync(join(dir, 'lib'), { recursive: true, force: true })
  tsc(join(dir, 'tsconfig.json'), check)
  if (existsSync(join(dir, 'tsconfig.tests.json'))) tsc(join(dir, 'tsconfig.tests.json'), true)
  if (manifest.dsh?.client !== undefined) {
    tsc(join(dir, 'tsconfig.client.json'), true)
    if (!check) {
      await buildClient(dir, manifest)
      fail(plugin, checkClientBundle(join(dir, 'lib/client.js'), clientExternals(manifest)))
    }
  }
  if (!check) fail(plugin, await checkHostImports(dir, manifest, ['lib/host', 'lib/shared'].filter(path => existsSync(join(dir, path)))))
  console.log(`${plugin}: ${check ? 'checked' : 'built'}`)
}

const args = process.argv.slice(2)
const check = args.includes('--check')
const named = args.filter(arg => !arg.startsWith('--'))
try {
  if (check) tsc(join(ROOT, 'tsconfig.scripts.json'), true)
  for (const plugin of named.length > 0 ? named : plugins()) await run(plugin, check)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}

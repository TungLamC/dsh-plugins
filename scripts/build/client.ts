/**
 * The browser half: one CommonJS file, `lib/client.js`, in the factory format the
 * dsh web shell's module loader registers. Modules the shell already shares stay
 * `require` calls; everything else is bundled in.
 */

import { join } from 'node:path'
import { build, type Rolldown } from 'tsdown'
import { cssModules } from './css-modules.ts'
import type { Manifest } from './manifest.ts'

/**
 * Modules the dsh web shell shares with every plugin bundle (dsh 0.2.1-rc.5,
 * packages/client/web/src/platform.ts). Update together with the catalog's dsh pin.
 */
export const PLATFORM_MODULES: readonly string[] = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  'zod', '@tanstack/react-virtual',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

/** Modules a bundle may `require`: the shared platform plus the manifest's own `dsh.client.external`. */
export function clientExternals(manifest: Manifest): ReadonlySet<string> {
  return new Set([...PLATFORM_MODULES, ...manifest.dsh?.client?.external ?? []])
}

/**
 * Refuse value imports of dsh packages the shell does not share: bundling them
 * would load a second copy beside the one the shell runs. Their types are fine.
 */
function sharedOnly(externals: ReadonlySet<string>): Rolldown.Plugin {
  return {
    name: 'dsh-shared-only',
    resolveId(source) {
      if (source.startsWith('@deepseek-ai/') && !externals.has(source)) {
        throw new Error(`${source} is not shared by the dsh web shell; import only its types (import type …)`)
      }
      return null
    },
  }
}

export async function buildClient(dir: string, manifest: Manifest): Promise<void> {
  const externals = clientExternals(manifest)
  const isExternal = (id: string): boolean => externals.has(id)
  await build({
    config: false,
    cwd: dir,
    entry: { client: join(dir, 'src/client/index.ts') },
    outDir: join(dir, 'lib'),
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    tsconfig: join(dir, 'tsconfig.client.json'),
    dts: false,
    clean: false,
    sourcemap: false,
    minify: false,
    logLevel: 'warn',
    deps: {
      neverBundle: [...externals],
      alwaysBundle: (id: string) => !isExternal(id),
      onlyBundle: false,
    },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    plugins: [sharedOnly(externals), cssModules(manifest.name, dir)],
    outputOptions: {
      entryFileNames: 'client.js',
      codeSplitting: false,
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(manifest.name)}, factory: (require) => {`,
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      footer: 'return module.exports; } });',
    },
  })
}

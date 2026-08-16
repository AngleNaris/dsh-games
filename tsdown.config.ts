/**
 * Standalone tsdown config for dsh-games.
 *
 * Two artifacts:
 *  - lib/index.js  — the node host half (external: cordis + the runtime
 *    services that resolve from the dsh profile tree).
 *  - lib/client.js — the browser half: a closure-factory bundle registered on
 *    window.__ModuleLoader__ ({id, factory}); react / cordis / slot table
 *    entries stay external and resolve through the loader's module table,
 *    everything else is inlined. CSS is a plain injected <style> tag (see
 *    src/client/styles.ts), so no css-modules pipeline is needed.
 */
import type { UserConfig } from 'tsdown'

/** The shell's frozen module table — externals the loader can answer. */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-schema-form',
] as const

const PACKAGE_ID = '@linxin666/dsh-games'

const nodeHalf: UserConfig = {
  name: PACKAGE_ID,
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  // The cordis framework and the harness services resolve at runtime from the
  // dsh profile tree, never from this repo's install.
  external: [
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-settings',
    '@deepseek-ai/schemastery',
  ],
}

const clientHalf: UserConfig = {
  name: `${PACKAGE_ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  dts: false,
  clean: false,
  sourcemap: true,
  external: [...PLATFORM_MODULES],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  // Inline every non-platform dependency (the loader table cannot answer it).
  noExternal: (id: string) => (PLATFORM_MODULES.includes(id as never) ? undefined : true),
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default [nodeHalf, clientHalf]

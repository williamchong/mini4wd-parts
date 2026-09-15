import { createRequire } from 'node:module'
import { run } from 'vue-tsc'

/**
 * `vue-tsc`, pointed at TypeScript 6. vue-tsc works by patching `.vue` support
 * into the JavaScript source of `typescript/lib/tsc.js`; in TypeScript 7 that
 * file is only a launcher for the native binary, so there is nothing to patch
 * and `nuxt typecheck` crashes. `scripts/` stays on 7; only app/ needs 6, via
 * the `typescript6` alias. Delete this once vue-tsc supports 7.
 *
 * Arguments pass straight through to tsc, which reads them from process.argv.
 */
run(createRequire(import.meta.url).resolve('typescript6/lib/tsc'))

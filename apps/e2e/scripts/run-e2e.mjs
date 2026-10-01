import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { ensureLocalSupabaseEnvironment, resetLocalSupabase } from './local-supabase.mjs'

const args = process.argv.slice(2)
const noReset = args.includes('--no-reset')
const playwrightArgs = args.filter((argument) => argument !== '--no-reset')
const localEnvironment = ensureLocalSupabaseEnvironment()

if (!noReset) resetLocalSupabase()

const playwrightCli = fileURLToPath(
  new URL('../../../node_modules/@playwright/test/cli.js', import.meta.url)
)
const result = spawnSync(process.execPath, [playwrightCli, 'test', ...playwrightArgs], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  env: { ...process.env, ...localEnvironment },
  stdio: 'inherit',
})

if (result.error) throw result.error
process.exit(result.status ?? 1)

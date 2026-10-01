import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { ensureLocalSupabaseEnvironment } from './local-supabase.mjs'

const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('The CI build must be started through npm run build:ci.')

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url))
const localEnvironment = ensureLocalSupabaseEnvironment()
const result = spawnSync(process.execPath, [npmCli, 'run', 'build', '--workspace=@kotikassa/web'], {
  cwd: repositoryRoot,
  env: { ...process.env, ...localEnvironment },
  stdio: 'inherit',
})

if (result.error) throw result.error
process.exit(result.status ?? 1)

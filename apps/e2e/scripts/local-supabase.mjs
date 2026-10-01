import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const command = process.platform === 'win32' ? 'supabase.exe' : 'supabase'
const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url))

function runSupabase(args) {
  const reset = args[0] === 'db' && args[1] === 'reset'
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: 'true' },
    stdio: reset ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  })

  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim() || 'Supabase command failed.'
    throw new Error(detail)
  }
  return result.stdout ?? ''
}

export function readLocalSupabaseEnvironment() {
  const output = runSupabase(['status', '-o', 'env'])
  const entries = output
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Z0-9_]+)="?(.*?)"?$/))
    .filter((match) => match !== null)
    .map((match) => [match[1], match[2]])
  const values = Object.fromEntries(entries)
  const apiUrl = values.API_URL ?? values.SUPABASE_URL
  const anonKey = values.ANON_KEY
  const serviceRoleKey = values.SERVICE_ROLE_KEY

  if (!apiUrl || !anonKey || !serviceRoleKey) {
    throw new Error('The local Supabase stack is not running or did not return its test keys.')
  }

  const hostname = new URL(apiUrl).hostname
  if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
    throw new Error(`Refusing to run E2E tests against non-local Supabase host: ${hostname}`)
  }

  return {
    NEXT_PUBLIC_SUPABASE_URL: apiUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    OPENAI_API_KEY: '',
    OPENAI_RECEIPT_MODEL: 'e2e-disabled',
    E2E_BASE_URL: 'http://127.0.0.1:3100',
  }
}

export function resetLocalSupabase() {
  runSupabase(['db', 'reset'])
}

export function ensureLocalSupabaseEnvironment() {
  try {
    return readLocalSupabaseEnvironment()
  } catch {
    runSupabase(['start'])
    return readLocalSupabaseEnvironment()
  }
}

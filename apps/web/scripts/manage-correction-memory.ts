import { resolve } from 'node:path'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { parseCorrectionMemoryArgs } from '../lib/correction-memory-cli'

config({ path: resolve(process.cwd(), 'apps/web/.env.local'), quiet: true })

const HELP = `Usage:
  npm run scan:memory -- --family-id <uuid> [--apply]
  npm run scan:memory -- --refresh-global

Household backfill is a read-only dry run unless --apply is supplied.
Global refresh rebuilds only the private, consent-filtered aggregate candidate table.`

async function main() {
  const options = parseCorrectionMemoryArgs(process.argv.slice(2))
  if (options.help) {
    console.log(HELP)
    return
  }

  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY']
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in apps/web/.env.local or the process environment'
    )
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  if (options.mode === 'global') {
    const { data, error } = await supabase.rpc('refresh_global_correction_candidates')
    if (error) throw new Error(error.message)
    console.log(JSON.stringify({ refreshed: true, candidateCount: data }, null, 2))
    return
  }

  const { data: family, error: familyError } = await supabase
    .from('families')
    .select('id')
    .eq('id', options.familyId!)
    .maybeSingle()
  if (familyError) throw new Error(familyError.message)
  if (!family) throw new Error(`No household found for family ID ${options.familyId}`)

  const { data, error } = await supabase.rpc('backfill_household_correction_memory', {
    p_family_id: options.familyId,
    p_apply: options.apply,
  })
  if (error) throw new Error(error.message)
  console.log(JSON.stringify(data, null, 2))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

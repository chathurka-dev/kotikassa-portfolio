import { resolve } from 'node:path'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { parseCorrectionAutomationArgs } from '../lib/correction-automation-cli'

config({ path: resolve(process.cwd(), 'apps/web/.env.local'), quiet: true })

const HELP = `Usage:
  npm run scan:automation:evaluate -- [options]

Required:
  --scope <household|global>
  --kind <item_name|store_name>
  --holdout-version <version>
  --dataset-sha256 <64-character hash>
  --sample-size <count>
  --correct-count <count>

Optional:
  --valid-days <1-365>             Evaluation lifetime (default: 180)
  --help                           Show this help

This service-role command records the measured result of a fixed holdout set.
It never marks an evaluation as passing unless the database's scope-specific
sample-size and precision gates are met. The latest result controls eligibility.`

async function main() {
  const options = parseCorrectionAutomationArgs(process.argv.slice(2))
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
  const { data, error } = await supabase.rpc('record_correction_automation_evaluation', {
    p_scope: options.scope,
    p_correction_kind: options.kind,
    p_holdout_version: options.holdoutVersion,
    p_dataset_sha256: options.datasetSha256,
    p_sample_size: options.sampleSize,
    p_correct_count: options.correctCount,
    p_valid_days: options.validDays,
  })
  if (error) throw new Error(error.message)
  console.log(JSON.stringify(data, null, 2))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

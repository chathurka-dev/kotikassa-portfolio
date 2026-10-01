import { mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { createClient } from '@supabase/supabase-js'
import { RECEIPT_SCANNING_CONSENT_VERSION } from '../../packages/shared/src/constants/privacy'
import { E2E_EMAIL, E2E_PASSWORD } from './tests/fixtures'

async function retryAuthRequest<T>(request: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await request()
    } catch (error) {
      lastError = error
      if (attempt < 4) await delay(attempt * 750)
    }
  }
  throw lastError
}

export default async function globalSetup() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error('Local Supabase E2E environment is missing.')
  }

  const hostname = new URL(url).hostname
  if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
    throw new Error(`Refusing to seed non-local Supabase host: ${hostname}`)
  }

  await mkdir(new URL('.auth/', import.meta.url), { recursive: true })
  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: existingUsers, error: listError } = await retryAuthRequest(() =>
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  )
  if (listError) throw listError
  const existing = existingUsers.users.find((user) => user.email === E2E_EMAIL)
  if (existing) {
    const { error: deleteError } = await retryAuthRequest(() =>
      admin.auth.admin.deleteUser(existing.id)
    )
    if (deleteError) throw deleteError
  }

  const { data: created, error: userError } = await retryAuthRequest(() =>
    admin.auth.admin.createUser({
      email: E2E_EMAIL,
      password: E2E_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: 'E2E User' },
    })
  )
  if (userError || !created.user) throw userError ?? new Error('Could not create E2E user.')

  const userClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: signInError } = await retryAuthRequest(() =>
    userClient.auth.signInWithPassword({
      email: E2E_EMAIL,
      password: E2E_PASSWORD,
    })
  )
  if (signInError) throw signInError

  const familyId = randomUUID()
  const { error: familyError } = await userClient
    .from('families')
    .insert({ id: familyId, name: 'E2E Household' })
  if (familyError) throw familyError

  const { error: profileError } = await userClient
    .from('profiles')
    .update({ family_id: familyId, display_name: 'E2E User', role: 'admin' })
    .eq('id', created.user.id)
  if (profileError) throw profileError

  const { error: privacyError } = await userClient.rpc('set_privacy_choices', {
    p_privacy_notice_version: '2026-07-12',
    p_receipt_scanning_enabled: true,
    p_receipt_scanning_consent_version: RECEIPT_SCANNING_CONSENT_VERSION,
  })
  if (privacyError) throw privacyError

  const { data: categories, error: categoryError } = await userClient
    .from('categories')
    .insert([
      {
        family_id: familyId,
        name: 'Groceries',
        icon: '🛒',
        color: '#10b981',
        sort_order: 0,
      },
      {
        family_id: familyId,
        name: 'Family Transfers',
        icon: '🤝',
        color: '#6366f1',
        sort_order: 1,
      },
    ])
    .select('id, name')
  if (categoryError) throw categoryError

  const groceriesId = categories.find((category) => category.name === 'Groceries')?.id
  if (!groceriesId) throw new Error('Could not seed the E2E groceries category.')

  const expenseDate = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Helsinki',
  }).format(new Date())
  const { error: expenseError } = await userClient.from('expense_items').insert({
    family_id: familyId,
    category_id: groceriesId,
    name: 'E2E Onion Seed',
    amount: 2.5,
    quantity: 0.5,
    unit: 'kg',
    expense_date: expenseDate,
    is_manual: true,
  })
  if (expenseError) throw expenseError

  const { error: memoryError } = await admin.from('household_correction_memory').insert([
    {
      family_id: familyId,
      correction_kind: 'item_name',
      source_value: 'E2E BANANL',
      source_normalized: 'e2e bananl',
      target_value: 'E2E Banana',
      target_normalized: 'e2e banana',
      context_key: 'e2e market',
      historical_support_count: 2,
      distinct_receipt_count: 2,
      distinct_contributor_count: 1,
      confidence_score: 0.75,
    },
    {
      family_id: familyId,
      correction_kind: 'item_name',
      source_value: 'E2E AUTO BANANL',
      source_normalized: 'e2e auto bananl',
      target_value: 'E2E Auto Banana',
      target_normalized: 'e2e auto banana',
      context_key: 'e2e market',
      historical_support_count: 5,
      distinct_receipt_count: 5,
      distinct_contributor_count: 1,
      confidence_score: 0.95,
    },
  ])
  if (memoryError) throw memoryError

  const { error: evaluationError } = await admin.rpc('record_correction_automation_evaluation', {
    p_scope: 'household',
    p_correction_kind: 'item_name',
    p_holdout_version: 'e2e-household-v1',
    p_dataset_sha256: 'a'.repeat(64),
    p_sample_size: 50,
    p_correct_count: 49,
    p_valid_days: 180,
  })
  if (evaluationError) throw evaluationError
}

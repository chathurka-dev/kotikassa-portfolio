'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@kotikassa/shared'

// Service-role client — never exposed to the browser.
// SUPABASE_SERVICE_ROLE_KEY must be set in Vercel / .env.local (no NEXT_PUBLIC_ prefix).
function getAdminClient() {
  return createAdminClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function deleteFamilyReceiptImages(
  admin: ReturnType<typeof getAdminClient>,
  familyId: string
): Promise<{ error?: string }> {
  // Receipt uploads are stored directly under receipts/{familyId}/. List from
  // offset 0 again after each removal because the folder shrinks by one batch.
  const { data: files, error: listError } = await admin.storage
    .from('receipts')
    .list(familyId, { limit: 100, offset: 0 })
  if (listError) return { error: listError.message }
  if (!files?.length) return {}

  const paths = files.map((file) => `${familyId}/${file.name}`)
  const { error: removeError } = await admin.storage.from('receipts').remove(paths)
  if (removeError) return { error: removeError.message }
  return deleteFamilyReceiptImages(admin, familyId)
}

/**
 * Admin action — deletes the entire family and all its data, then removes
 * every member's auth account and redirects to /login.
 */
export async function deleteFamilyAction(familyId: string): Promise<{ error?: string }> {
  const cookieStore = await cookies()
  const supabase = createSupabaseServerClient(cookieStore)

  // Verify the caller is actually an admin of this family
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles').select('role, family_id').eq('id', user.id).single()
  if (!profile || profile.family_id !== familyId || profile.role !== 'admin') {
    return { error: 'Not authorised' }
  }

  // Run the SECURITY DEFINER function — returns member auth IDs, then deletes the family
  const admin = getAdminClient()
  const storageResult = await deleteFamilyReceiptImages(admin, familyId)
  if (storageResult.error) return { error: storageResult.error }

  const { data: memberIds, error: fnError } = await admin
    .rpc('delete_family_and_data', { p_family_id: familyId })
  if (fnError) return { error: fnError.message }

  // Delete every member's auth account
  for (const uid of (memberIds as string[] ?? [])) {
    await admin.auth.admin.deleteUser(uid)
  }

  redirect('/login')
}

/**
 * Member action — removes the caller from the family and deletes their auth
 * account, then redirects to /login.
 */
export async function leaveFamilyAction(): Promise<{ error?: string }> {
  const cookieStore = await cookies()
  const supabase = createSupabaseServerClient(cookieStore)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Nullify family_id in profiles (via SECURITY DEFINER so RLS doesn't block)
  const admin = getAdminClient()
  const { error: fnError } = await admin
    .rpc('leave_family', { p_user_id: user.id })
  if (fnError) return { error: fnError.message }

  // Delete auth account
  await admin.auth.admin.deleteUser(user.id)

  redirect('/login')
}

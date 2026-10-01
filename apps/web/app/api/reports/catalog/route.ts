import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from '@/lib/auth'

const actionSchema = z
  .discriminatedUnion('action', [
    z.object({
      action: z.literal('rename'),
      itemId: z.string().uuid(),
      name: z.string().trim().min(1).max(120),
    }),
    z.object({
      action: z.literal('merge'),
      targetItemId: z.string().uuid(),
      sourceItemId: z.string().uuid(),
    }),
    z.object({
      action: z.literal('separate'),
      itemId: z.string().uuid(),
      aliasId: z.string().uuid(),
    }),
  ])
  .refine((value) => value.action !== 'merge' || value.targetItemId !== value.sourceItemId)

export async function POST(request: NextRequest) {
  const session = await getServerSession()
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const parsed = actionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const result = await (async () => {
    switch (parsed.data.action) {
      case 'rename':
        return session.supabase.rpc('rename_catalog_item', {
          p_item_id: parsed.data.itemId,
          p_canonical_name: parsed.data.name,
        })
      case 'merge':
        return session.supabase.rpc('merge_catalog_items', {
          p_target_item_id: parsed.data.targetItemId,
          p_source_item_id: parsed.data.sourceItemId,
        })
      case 'separate':
        return session.supabase.rpc('separate_catalog_item_alias', {
          p_item_id: parsed.data.itemId,
          p_alias_id: parsed.data.aliasId,
        })
    }
  })()

  if (result.error) {
    console.error('[report-catalog] update failed:', result.error.message)
    const knownError = {
      catalog_item_not_found: 'catalog_not_found',
      catalog_alias_not_found: 'catalog_not_found',
      primary_alias_cannot_be_separated: 'primary_alias',
    }[result.error.message]
    const error =
      knownError ??
      (result.error.code === '23505' || result.error.message.includes('already belongs')
        ? 'name_conflict'
        : 'catalog_update_failed')
    return NextResponse.json(
      { error },
      { status: error === 'name_conflict' ? 409 : 400 }
    )
  }
  return NextResponse.json({
    ok: true,
    ...(parsed.data.action === 'separate' ? { itemId: result.data as string | null } : {}),
  })
}

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getServerSession } from '@/lib/auth'
import { POST as updateCatalog } from './catalog/route'
import { POST as runReport } from './run/route'

vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn(),
}))

const FAMILY_ID = '11111111-1111-4111-8111-111111111111'
const ITEM_ID = '22222222-2222-4222-8222-222222222222'
const ALIAS_ID = '33333333-3333-4333-8333-333333333333'

function jsonRequest(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function reportBody(overrides: Record<string, unknown> = {}) {
  return {
    reportType: 'expense-breakdown',
    preset: 'week',
    from: '2026-07-27',
    to: '2026-08-02',
    interval: 'day',
    filters: {},
    ...overrides,
  }
}

function queryResult(result: { data: unknown; error: unknown }) {
  const resultPromise = Promise.resolve(result)
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    then: resultPromise.then.bind(resultPromise),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.gte.mockReturnValue(query)
  query.lte.mockReturnValue(query)
  query.order.mockReturnValue(query)
  query.limit.mockReturnValue(query)
  return query
}

function sessionWithQuery(result: { data: unknown; error: unknown }) {
  const query = queryResult(result)
  const supabase = {
    from: vi.fn(() => query),
    rpc: vi.fn(),
  }
  vi.mocked(getServerSession).mockResolvedValue({
    familyId: FAMILY_ID,
    supabase,
  } as never)
  return { query, supabase }
}

describe('report run API', () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockReset()
  })

  it('rejects unauthenticated requests before reading report data', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)

    const response = await runReport(jsonRequest('/api/reports/run', reportBody()))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'unauthenticated' })
  })

  it.each([
    ['invalid request', { reportType: 'unknown' }, 'invalid_request'],
    [
      'oversized range',
      { from: '2020-01-01', to: '2026-08-02', preset: 'custom', interval: 'month' },
      'range_too_large',
    ],
    ['invalid chart interval', { interval: 'month' }, 'invalid_interval'],
    ['missing item', { reportType: 'item-purchases' }, 'item_required'],
    [
      'invalid comparison',
      { comparison: { from: '2026-04-01', to: '2026-07-31' } },
      'invalid_comparison',
    ],
  ])('returns a stable validation error for %s', async (_name, override, error) => {
    sessionWithQuery({ data: [], error: null })

    const response = await runReport(
      jsonRequest('/api/reports/run', reportBody(override as Record<string, unknown>))
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error })
  })

  it('scopes report queries to the authenticated household and disables caching', async () => {
    const { query, supabase } = sessionWithQuery({ data: [], error: null })

    const response = await runReport(jsonRequest('/api/reports/run', reportBody()))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(supabase.from).toHaveBeenCalledWith('expense_items')
    expect(query.eq).toHaveBeenCalledWith('family_id', FAMILY_ID)
    expect(body).toMatchObject({
      type: 'expense-breakdown',
      from: '2026-07-27',
      to: '2026-08-02',
      interval: 'day',
      rowCount: 0,
      rows: [],
    })
  })

  it('returns a stable unavailable error when report storage fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    sessionWithQuery({ data: null, error: { message: 'database unavailable' } })

    const response = await runReport(jsonRequest('/api/reports/run', reportBody()))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'report_unavailable' })
  })
})

describe('report catalog API', () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockReset()
  })

  it('requires authentication and validates catalog actions', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)
    const unauthenticated = await updateCatalog(
      jsonRequest('/api/reports/catalog', { action: 'rename', itemId: ITEM_ID, name: 'Onion' })
    )
    expect(unauthenticated.status).toBe(401)

    const rpc = vi.fn()
    vi.mocked(getServerSession).mockResolvedValue({
      familyId: FAMILY_ID,
      supabase: { rpc },
    } as never)
    const invalid = await updateCatalog(
      jsonRequest('/api/reports/catalog', {
        action: 'merge',
        targetItemId: ITEM_ID,
        sourceItemId: ITEM_ID,
      })
    )

    expect(invalid.status).toBe(400)
    await expect(invalid.json()).resolves.toEqual({ error: 'invalid_request' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('maps catalog conflicts to a stable 409 response', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    })
    vi.mocked(getServerSession).mockResolvedValue({
      familyId: FAMILY_ID,
      supabase: { rpc },
    } as never)

    const response = await updateCatalog(
      jsonRequest('/api/reports/catalog', {
        action: 'rename',
        itemId: ITEM_ID,
        name: 'Onion',
      })
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: 'name_conflict' })
  })

  it('returns the new item id after separating an alias', async () => {
    const separatedItemId = '44444444-4444-4444-8444-444444444444'
    const rpc = vi.fn().mockResolvedValue({ data: separatedItemId, error: null })
    vi.mocked(getServerSession).mockResolvedValue({
      familyId: FAMILY_ID,
      supabase: { rpc },
    } as never)

    const response = await updateCatalog(
      jsonRequest('/api/reports/catalog', {
        action: 'separate',
        itemId: ITEM_ID,
        aliasId: ALIAS_ID,
      })
    )

    expect(rpc).toHaveBeenCalledWith('separate_catalog_item_alias', {
      p_item_id: ITEM_ID,
      p_alias_id: ALIAS_ID,
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, itemId: separatedItemId })
  })
})

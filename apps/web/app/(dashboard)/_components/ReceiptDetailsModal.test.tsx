// @vitest-environment jsdom

import { NextIntlClientProvider } from 'next-intl'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@/locales/en.json'
import { render, screen, waitFor } from '@/test/render'
import ReceiptDetailsModal from './ReceiptDetailsModal'

// ── Static mocks ─────────────────────────────────────────────────────────────

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

vi.mock('@/lib/currency-context', () => ({
  useFormatCurrency: () => (v: number) => `€${v.toFixed(2)}`,
}))

vi.mock('./ReceiptImageRecovery', () => ({
  default: () => <div data-testid="image-recovery" />,
}))

// ── Query builder factory ─────────────────────────────────────────────────────
// Creates an object whose chainable methods all return itself and that is
// directly awaitable (for queries that don't end with .single()).

type Resolved = { data?: unknown; count?: number | null; error: unknown }

function makeQuery(resolved: Resolved) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'not', 'order', 'delete', 'update', 'in', 'limit']) {
    q[m] = vi.fn().mockReturnValue(q)
  }
  // .single() resolves to the given value
  q.single = vi.fn().mockResolvedValue(resolved)
  // Direct await (queries ending with .eq / .not / .order etc.)
  q.then = (ful: (v: Resolved) => void, rej?: (e: unknown) => void) =>
    Promise.resolve(resolved).then(ful, rej)
  return q
}

// ── Test data ─────────────────────────────────────────────────────────────────

const RECEIPT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const FAMILY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const RECEIPT_DATA = {
  id: RECEIPT_ID,
  store_name: 'K-Market Kerava',
  receipt_date: '2026-07-29',
  total_amount: 18.76,
  image_url: null, // null so signed-URL fetch is skipped
}

const ITEM_DATA = [
  {
    id: 'item-1',
    name: 'Sipuli',
    amount: 1.5,
    quantity: 0.5,
    unit: 'kg',
    discount_amount: null,
    original_price: null,
    receipt_line_index: 0,
    categories: { name: 'Groceries', icon: '🛒' },
  },
  {
    id: 'item-2',
    name: 'Maito',
    amount: 1.45,
    quantity: 1,
    unit: 'kpl',
    discount_amount: null,
    original_price: null,
    receipt_line_index: 1,
    categories: { name: 'Groceries', icon: '🛒' },
  },
]

const STORE_DATA = [{ store_name: 'K-Market Kerava' }]

// ── Supabase mock builder ─────────────────────────────────────────────────────
// On mount the modal fires Promise.all with 3 queries (in this order):
//   receipts  [0] — detail        (.single())
//   items     [0] — item list     (direct await, ends with .order())
//   receipts  [1] — store list    (direct await, ends with .order())
// handleDelete then performs a non-destructive lock pre-check followed by the
// atomic delete_receipt RPC. Storage cleanup runs only after that RPC succeeds.

interface MockOptions {
  lockedCount?: number
  lockCheckError?: boolean
  deleteRpcError?: boolean
  rpcLockedCount?: number
  imagePath?: string | null
  storageError?: boolean
}

let currentMockClient: ReturnType<typeof buildSupabaseMock>

function buildSupabaseMock(opts: MockOptions = {}) {
  const receiptsQueries = [
    makeQuery({ data: RECEIPT_DATA, error: null }), // [0] detail
    makeQuery({ data: STORE_DATA, error: null }), // [1] store suggestions
  ]
  const itemsQueries = [
    makeQuery({ data: ITEM_DATA, error: null }), // [0] load list
    makeQuery({
      data: null,
      count: opts.lockedCount ?? 0,
      error: opts.lockCheckError ? { message: 'db error' } : null,
    }), // [1] lock check
  ]

  let receiptsIdx = 0
  let itemsIdx = 0

  const storageBucket = {
    createSignedUrl: vi
      .fn()
      .mockResolvedValue({ data: { signedUrl: 'https://cdn/test.jpg' }, error: null }),
    remove: vi.fn().mockResolvedValue({
      error: opts.storageError ? { message: 'storage error' } : null,
    }),
  }
  const storageMock = {
    from: vi.fn((_bucket: string) => storageBucket),
  }

  return {
    from: vi.fn((table: string) => {
      if (table === 'receipts') return receiptsQueries[receiptsIdx++]
      if (table === 'expense_items') return itemsQueries[itemsIdx++]
      return makeQuery({ data: null, error: null })
    }),
    rpc: vi.fn().mockResolvedValue({
      data: opts.rpcLockedCount
        ? { deleted: false, reason: 'people_locked', locked_count: opts.rpcLockedCount }
        : {
            deleted: true,
            image_path: opts.imagePath ?? null,
            deleted_item_count: ITEM_DATA.length,
          },
      error: opts.deleteRpcError ? { message: 'delete error' } : null,
    }),
    storage: storageMock,
  }
}

vi.mock('@kotikassa/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kotikassa/shared')>()
  return {
    ...actual,
    createClient: () => currentMockClient,
  }
})

// ── Render helper ─────────────────────────────────────────────────────────────

function renderModal(
  opts: MockOptions = {},
  extraProps: { onDeleted?: (id: string) => void; onClose?: () => void } = {}
) {
  currentMockClient = buildSupabaseMock(opts)
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ReceiptDetailsModal
        receiptId={RECEIPT_ID}
        familyId={FAMILY_ID}
        onClose={extraProps.onClose ?? vi.fn()}
        onStoreNameUpdated={vi.fn()}
        onDeleted={extraProps.onDeleted ?? vi.fn()}
      />
    </NextIntlClientProvider>
  )
}

// Wait for the modal to finish loading (store name appears in the input)
async function waitForLoad() {
  await waitFor(() => expect(screen.getByDisplayValue('K-Market Kerava')).toBeInTheDocument())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ReceiptDetailsModal — delete receipt', () => {
  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a delete button once the receipt has loaded', async () => {
    renderModal()
    await waitForLoad()
    expect(screen.getByRole('button', { name: /delete receipt/i })).toBeInTheDocument()
  })

  it('renders expense items after load', async () => {
    renderModal()
    await waitForLoad()
    expect(screen.getByText('Sipuli')).toBeInTheDocument()
    expect(screen.getByText('Maito')).toBeInTheDocument()
  })

  it('blocks delete and shows an error when items are locked by People transactions', async () => {
    renderModal({ lockedCount: 1 })
    await waitForLoad()

    await userEvent.click(screen.getByRole('button', { name: /delete receipt/i }))

    // Confirm must NOT have been shown — the lock check blocks it before that
    expect(window.confirm).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(screen.getByText(/linked to people transactions/i)).toBeInTheDocument()
    )
  })

  it('blocks delete and shows an error when the lock check itself fails', async () => {
    renderModal({ lockCheckError: true })
    await waitForLoad()

    await userEvent.click(screen.getByRole('button', { name: /delete receipt/i }))

    await waitFor(() => expect(screen.getByText(/could not delete receipt/i)).toBeInTheDocument())
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('happy path: confirms, deletes items + receipt, calls onDeleted and onClose', async () => {
    const onDeleted = vi.fn()
    const onClose = vi.fn()
    renderModal({}, { onDeleted, onClose })
    await waitForLoad()

    await userEvent.click(screen.getByRole('button', { name: /delete receipt/i }))

    // Confirm message should mention both items
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining('2') // ITEM_DATA has 2 items
    )
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(RECEIPT_ID))
    expect(currentMockClient.rpc).toHaveBeenCalledWith('delete_receipt', {
      p_receipt_id: RECEIPT_ID,
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('aborts cleanly when user cancels the confirm dialog', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onDeleted = vi.fn()
    renderModal({}, { onDeleted })
    await waitForLoad()

    await userEvent.click(screen.getByRole('button', { name: /delete receipt/i }))

    // Flush any pending microtasks
    await new Promise((r) => setTimeout(r, 50))
    expect(onDeleted).not.toHaveBeenCalled()
    // Error message must not appear after a user-cancelled action
    expect(screen.queryByText(/could not delete receipt/i)).not.toBeInTheDocument()
  })

  it('shows error and stays open when the atomic delete RPC fails', async () => {
    const onDeleted = vi.fn()
    renderModal({ deleteRpcError: true, imagePath: `${FAMILY_ID}/receipt.jpg` }, { onDeleted })
    await waitForLoad()

    await userEvent.click(screen.getByRole('button', { name: /delete receipt/i }))

    await waitFor(() => expect(screen.getByText(/could not delete receipt/i)).toBeInTheDocument())
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('handles a People lock detected atomically after confirmation', async () => {
    const onDeleted = vi.fn()
    renderModal({ rpcLockedCount: 1 }, { onDeleted })
    await waitForLoad()

    await userEvent.click(screen.getByRole('button', { name: /delete receipt/i }))

    await waitFor(() =>
      expect(screen.getByText(/linked to people transactions/i)).toBeInTheDocument()
    )
    expect(onDeleted).not.toHaveBeenCalled()
    expect(currentMockClient.storage.from('receipts').remove).not.toHaveBeenCalled()
  })

  it('removes the private image only after the database deletion succeeds', async () => {
    const path = `${FAMILY_ID}/${RECEIPT_ID}/original.jpg`
    const onDeleted = vi.fn()
    renderModal({ imagePath: path }, { onDeleted })
    await waitForLoad()

    await userEvent.click(screen.getByRole('button', { name: /delete receipt/i }))

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(RECEIPT_ID))
    const bucket = currentMockClient.storage.from('receipts')
    expect(bucket.remove).toHaveBeenCalledWith([path])
    expect(currentMockClient.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      bucket.remove.mock.invocationCallOrder[0]!
    )
  })
})

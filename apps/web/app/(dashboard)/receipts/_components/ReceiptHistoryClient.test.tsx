// @vitest-environment jsdom

import type { ComponentProps } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import en from '@/locales/en.json'
import { render, screen, waitFor } from '@/test/render'
import type { ReceiptHistoryEntry } from './ReceiptHistoryClient'
import ReceiptHistoryClient from './ReceiptHistoryClient'

// ── Static mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/currency-context', () => ({
  useFormatCurrency: () => (v: number) => `€${v.toFixed(2)}`,
}))

// Mock ReceiptDetailsModal: renders a stub that exposes onDeleted via a button.
// This lets us test the ReceiptHistoryClient's handleReceiptDeleted logic
// without pulling in the full modal and its Supabase dependencies.
vi.mock('../../_components/ReceiptDetailsModal', () => ({
  default: ({
    receiptId,
    onDeleted,
    onClose,
  }: ComponentProps<typeof import('../../_components/ReceiptDetailsModal').default>) => (
    <div data-testid="receipt-modal">
      <button onClick={() => onDeleted?.(receiptId)}>Confirm delete</button>
      <button onClick={onClose}>Close</button>
    </div>
  ),
}))

// ── Test data ─────────────────────────────────────────────────────────────────

const FAMILY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function makeReceipt(id: string, storeName: string): ReceiptHistoryEntry {
  return {
    id,
    store_name: storeName,
    receipt_date: '2026-07-29',
    total_amount: 12.5,
    image_url: null,
    created_at: '2026-07-29T10:00:00Z',
    itemCount: 3,
  }
}

const RECEIPT_A = makeReceipt('receipt-aaa', 'K-Market Kerava')
const RECEIPT_B = makeReceipt('receipt-bbb', 'Lidl Kerava')

// ── Render helper ─────────────────────────────────────────────────────────────

function renderHistory(receipts: ReceiptHistoryEntry[] = [RECEIPT_A, RECEIPT_B]) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ReceiptHistoryClient initialReceipts={receipts} familyId={FAMILY_ID} loadFailed={false} />
    </NextIntlClientProvider>
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ReceiptHistoryClient — delete integration', () => {
  it('shows all receipt cards on initial render', () => {
    renderHistory()
    expect(screen.getByText('K-Market Kerava')).toBeInTheDocument()
    expect(screen.getByText('Lidl Kerava')).toBeInTheDocument()
  })

  it('removes deleted receipt from the list when onDeleted fires', async () => {
    renderHistory()

    // Click the first receipt card to open its modal
    await userEvent.click(screen.getByRole('button', { name: /k-market kerava/i }))
    expect(screen.getByTestId('receipt-modal')).toBeInTheDocument()

    // Simulate the modal calling onDeleted (e.g. after user confirms)
    await userEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))

    // Modal should be gone and the deleted receipt should no longer appear
    await waitFor(() => expect(screen.queryByTestId('receipt-modal')).not.toBeInTheDocument())
    expect(screen.queryByText('K-Market Kerava')).not.toBeInTheDocument()

    // The other receipt remains
    expect(screen.getByText('Lidl Kerava')).toBeInTheDocument()
  })

  it('closes the modal without removing anything when Close is clicked', async () => {
    renderHistory()

    await userEvent.click(screen.getByRole('button', { name: /lidl kerava/i }))
    expect(screen.getByTestId('receipt-modal')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    await waitFor(() => expect(screen.queryByTestId('receipt-modal')).not.toBeInTheDocument())
    // Both receipts still in the list
    expect(screen.getByText('K-Market Kerava')).toBeInTheDocument()
    expect(screen.getByText('Lidl Kerava')).toBeInTheDocument()
  })
})

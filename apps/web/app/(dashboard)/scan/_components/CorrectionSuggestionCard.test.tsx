// @vitest-environment jsdom

import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@/test/render'
import CorrectionSuggestionCard from './CorrectionSuggestionCard'
import type { ReceiptCorrectionSuggestion } from '@/lib/receipt-correction-suggestions'

const suggestion: ReceiptCorrectionSuggestion = {
  key: 'global_candidate:1',
  entityType: 'item',
  lineIndex: 0,
  fieldName: 'name',
  originalValue: 'Banaanl',
  suggestedValue: 'Banaani',
  sourceType: 'global_candidate',
  sourceKey: '1',
  sourceVersion: '2026-08-05',
  confidenceTier: 'medium',
  evidenceTier: 'independent',
  autoApply: false,
  automationReason: null,
  automationPolicyVersion: null,
}

const labels = {
  heading: 'Learned correction',
  helpLabel: 'Explain this correction suggestion',
  source: 'From a privacy-safe shared pattern',
  help: 'Only the aggregate suggestion is shared.',
  useValue: 'Use suggestion',
  dismiss: 'Dismiss',
  applied: 'Applied',
  undo: 'Undo',
  dismissed: 'Dismissed',
  restore: 'Restore',
}

describe('CorrectionSuggestionCard', () => {
  it('explains provenance on request and supports accept or dismiss', async () => {
    const user = userEvent.setup()
    const onAccept = vi.fn()
    const onReject = vi.fn()
    render(
      <CorrectionSuggestionCard
        suggestion={suggestion}
        decision="offered"
        labels={labels}
        onAccept={onAccept}
        onReject={onReject}
        onUndo={vi.fn()}
        onRestore={vi.fn()}
      />
    )

    expect(screen.getByText('Banaani')).toBeInTheDocument()
    expect(screen.getByText(/privacy-safe shared pattern/)).toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: labels.helpLabel }))
    expect(screen.getByRole('note')).toHaveTextContent('Only the aggregate suggestion is shared.')

    await user.click(screen.getByRole('button', { name: 'Use suggestion' }))
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onAccept).toHaveBeenCalledOnce()
    expect(onReject).toHaveBeenCalledOnce()
  })

  it('offers an immediate undo after applying the correction', async () => {
    const user = userEvent.setup()
    const onUndo = vi.fn()
    render(
      <CorrectionSuggestionCard
        suggestion={suggestion}
        decision="accepted"
        labels={labels}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onUndo={onUndo}
        onRestore={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: /Applied.*Undo/ }))
    expect(onUndo).toHaveBeenCalledOnce()
  })
})

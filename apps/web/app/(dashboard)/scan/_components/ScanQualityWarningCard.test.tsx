// @vitest-environment jsdom

import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@/test/render'
import ScanQualityWarningCard from './ScanQualityWarningCard'

describe('ScanQualityWarningCard', () => {
  it('shows the reason and records an explicit looks-correct choice', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    render(
      <ScanQualityWarningCard
        reason="The item total differs from the receipt total."
        dismissed={false}
        dismissLabel="This looks correct"
        dismissedLabel="Marked as correct"
        restoreLabel="Review again"
        onDismiss={onDismiss}
        onRestore={vi.fn()}
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent('differs from the receipt total')
    await user.click(screen.getByRole('button', { name: 'This looks correct' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('allows a dismissed warning to be restored without changing its field', async () => {
    const user = userEvent.setup()
    const onRestore = vi.fn()
    render(
      <ScanQualityWarningCard
        reason="Reason"
        dismissed
        dismissLabel="This looks correct"
        dismissedLabel="Marked as correct"
        restoreLabel="Review again"
        onDismiss={vi.fn()}
        onRestore={onRestore}
      />
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Review again' }))
    expect(onRestore).toHaveBeenCalledOnce()
  })
})

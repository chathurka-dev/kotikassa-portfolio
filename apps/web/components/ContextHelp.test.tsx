// @vitest-environment jsdom

import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@/test/render'
import ContextHelp from './ContextHelp'

describe('ContextHelp', () => {
  it('reveals help on demand and dismisses it with Escape', async () => {
    const user = userEvent.setup()
    render(
      <ContextHelp label="Explain chart interval">
        The interval changes chart buckets without changing report totals.
      </ContextHelp>
    )

    const trigger = screen.getByRole('button', { name: 'Explain chart interval' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('note')).not.toBeInTheDocument()

    await user.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('note')).toHaveTextContent(
      'The interval changes chart buckets without changing report totals.'
    )

    await user.keyboard('{Escape}')

    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})

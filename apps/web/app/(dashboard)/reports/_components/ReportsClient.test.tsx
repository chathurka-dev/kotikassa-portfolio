// @vitest-environment jsdom

import type { ReactNode } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@/locales/en.json'
import fi from '@/locales/fi.json'
import type { GeneratedReport, ReportFilterOptions } from '@/lib/report-contract'
import type { ReportViewState } from '@/lib/report-view-state'
import { render, screen } from '@/test/render'
import ReportsClient from './ReportsClient'

const navigationMocks = vi.hoisted(() => ({
  replace: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/reports',
  useRouter: () => ({ replace: navigationMocks.replace }),
}))

vi.mock('@/lib/currency-context', () => ({
  useFormatCurrency: () => (value: number) => `€${value.toFixed(2)}`,
}))

vi.mock('recharts', () => {
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>
  const Element = () => <div />
  return {
    Bar: Element,
    BarChart: Container,
    CartesianGrid: Element,
    Legend: Element,
    ResponsiveContainer: Container,
    Tooltip: Element,
    XAxis: Element,
    YAxis: Element,
  }
})

const ITEM_ID = '11111111-1111-4111-8111-111111111111'
const CATEGORY_ID = '22222222-2222-4222-8222-222222222222'

const initialOptions: ReportFilterOptions = {
  categories: [{ id: CATEGORY_ID, name: 'Groceries', icon: '🛒' }],
  stores: ['K-Market'],
  items: [
    {
      id: ITEM_ID,
      name: 'Sipuli',
      aliases: [
        { id: '33333333-3333-4333-8333-333333333333', name: 'Sipuli' },
        { id: '44444444-4444-4444-8444-444444444444', name: 'Keltasipuli' },
      ],
    },
  ],
  people: [],
}

const initialState: ReportViewState = {
  reportType: 'expense-breakdown',
  preset: 'week',
  from: '2026-07-27',
  to: '2026-08-02',
  interval: 'day',
  comparison: {
    mode: 'none',
    from: '2026-07-20',
    to: '2026-07-26',
  },
  filters: {
    categoryId: '',
    store: '',
    itemId: '',
    personId: '',
  },
}

const emptyReport: GeneratedReport = {
  type: 'expense-breakdown',
  from: initialState.from,
  to: initialState.to,
  interval: 'day',
  metrics: [
    { key: 'expenses', value: 0, format: 'currency' },
    { key: 'purchases', value: 0, format: 'number' },
  ],
  seriesKeys: [{ key: 'expenses', label: 'expenses', format: 'currency' }],
  series: [],
  columns: [
    { key: 'date', label: 'date', format: 'date' },
    { key: 'amount', label: 'amount', format: 'currency' },
  ],
  rows: [],
  rowCount: 0,
}

function renderReports(locale: 'en' | 'fi' = 'en', state: ReportViewState = initialState) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'en' ? en : fi}
      timeZone="Europe/Helsinki"
    >
      <ReportsClient initialState={state} initialOptions={initialOptions} budgetStartDay={1} />
    </NextIntlClientProvider>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  navigationMocks.replace.mockReset()
})

describe('ReportsClient', () => {
  it('supports filters and reveals contextual help only on request', async () => {
    const user = userEvent.setup()
    renderReports()

    expect(screen.getByText('Your report is ready to be configured')).toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Explain chart interval' }))
    expect(screen.getByRole('note')).toHaveTextContent(
      'Combines chart values by day, week, or month.'
    )

    await user.selectOptions(screen.getByLabelText('Store'), 'K-Market')
    expect(screen.getByText('Store: K-Market')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.queryByText('Store: K-Market')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Store')).toHaveValue('')
  })

  it('shows loading and empty states while generating a report', async () => {
    const user = userEvent.setup()
    let resolveRequest: (response: Response) => void = () => undefined
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve
        })
    )
    vi.stubGlobal('fetch', fetchMock)
    renderReports()

    await user.click(screen.getByRole('button', { name: 'Generate report' }))

    expect(screen.getByRole('button', { name: /Generating/ })).toBeDisabled()
    expect(screen.queryByText('Your report is ready to be configured')).not.toBeInTheDocument()

    resolveRequest(
      new Response(JSON.stringify(emptyReport), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    expect(
      (await screen.findAllByText(/No data was found for Expense details/)).length
    ).toBeGreaterThan(0)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/reports/run',
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      })
    )
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
  })

  it('shows a localized Finnish error when generation fails', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })))
    renderReports('fi')

    expect(screen.getByRole('heading', { name: 'Raportit' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Luo raportti' }))

    expect(
      await screen.findByText('Raporttia ei voitu luoda. Yritä uudelleen.')
    ).toBeInTheDocument()
  })

  it('opens the reporting-name dialog for a selected item', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderReports()

    await user.selectOptions(screen.getByDisplayValue('Expense details'), 'item-purchases')
    await user.click(screen.getByRole('button', { name: 'Generate report' }))

    expect(
      screen.getByText('Select an item before generating an item purchases report.')
    ).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()

    await user.type(screen.getByPlaceholderText('Search reporting items'), 'Sipuli')
    await user.click(screen.getByRole('button', { name: 'Manage names' }))

    expect(screen.getByRole('heading', { name: 'Manage reporting names' })).toBeInTheDocument()
    expect(screen.getAllByDisplayValue('Sipuli')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Separate Keltasipuli' })).toBeInTheDocument()
  })
})

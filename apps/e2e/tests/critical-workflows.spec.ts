import { expect, test } from '@playwright/test'
import { expectNoCriticalAccessibilityViolations } from './accessibility'

test.describe('critical household workflows', () => {
  test('automatically applies and immediately undoes a verified household alias', async ({
    page,
  }) => {
    await page.route('**/api/scan', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          storeName: 'E2E Market',
          receiptDateRaw: '26.9.2026',
          receiptDate: '2026-09-26',
          totalAmount: 1.5,
          items: [
            {
              name: 'E2E AUTO BANANL',
              amount: 1.5,
              quantity: 1,
              unit: 'kg',
              unitPrice: 1.5,
              discountAmount: null,
              originalPrice: null,
            },
          ],
          scanQuality: { schemaVersion: 'v1', score: 0, level: 'low', warnings: [] },
          scanQualityContext: [],
          scanMeta: {
            provider: 'e2e-mock',
            model: 'e2e-model',
            promptVersion: 'e2e-v1',
            schemaVersion: 'e2e-v1',
            latencyMs: 1,
            inputTokens: 1,
            outputTokens: 1,
          },
        }),
      })
    })

    await page.goto('/scan')
    await page.locator('input[type="file"]').setInputFiles({
      name: 'receipt.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64'
      ),
    })
    await page.getByRole('button', { name: 'Scan receipt' }).click()

    const itemName = page.getByPlaceholder('Item name').first()
    await expect(itemName).toHaveValue('E2E Auto Banana')
    await expect(page.getByText('Automatically corrected', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /Applied.*Undo/ }).click()
    await expect(itemName).toHaveValue('E2E AUTO BANANL')
  })

  test('reviews, applies, and undoes a learned receipt correction', async ({ page }) => {
    await page.route('**/api/scan', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          storeName: 'E2E Market',
          receiptDateRaw: '31.2.2026',
          receiptDate: null,
          totalAmount: 2,
          items: [
            {
              name: 'E2E BANANL',
              amount: 1.5,
              quantity: 1,
              unit: 'kg',
              unitPrice: 1.5,
              discountAmount: null,
              originalPrice: null,
            },
          ],
          scanQuality: {
            schemaVersion: 'v1',
            score: 65,
            level: 'high',
            warnings: [
              {
                id: 'receipt:receipt:receipt_date:date_invalid',
                code: 'date_invalid',
                severity: 'critical',
                points: 30,
                entityType: 'receipt',
                lineIndex: null,
                fieldName: 'receipt_date',
                params: { value: '31.2.2026' },
              },
              {
                id: 'receipt:receipt:total_amount:total_mismatch',
                code: 'total_mismatch',
                severity: 'critical',
                points: 35,
                entityType: 'receipt',
                lineIndex: null,
                fieldName: 'total_amount',
                params: { receiptTotal: 2, itemTotal: 1.5, difference: 0.5 },
              },
            ],
          },
          scanQualityContext: [],
          scanMeta: {
            provider: 'e2e-mock',
            model: 'e2e-model',
            promptVersion: 'e2e-v1',
            schemaVersion: 'e2e-v1',
            latencyMs: 1,
            inputTokens: 1,
            outputTokens: 1,
          },
        }),
      })
    })

    await page.goto('/scan')
    await page.locator('input[type="file"]').setInputFiles({
      name: 'receipt.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64'
      ),
    })
    await page.getByRole('button', { name: 'Scan receipt' }).click()

    await expect(page.getByText('Learned correction', { exact: true })).toBeVisible()
    await expect(page.locator('input[type="date"]')).toHaveValue('')
    await expect(page.getByText(/could not be read reliably/)).toBeVisible()
    await expect(page.getByText(/differs from the selected item total/)).toBeVisible()
    await page.getByRole('button', { name: 'This looks correct' }).last().click()
    await expect(page.getByText('Marked as correct')).toBeVisible()
    await page.getByRole('button', { name: 'Review again' }).click()
    await expect(page.getByText('From your household history')).toBeVisible()
    const itemName = page.getByPlaceholder('Item name').first()
    await expect(itemName).toHaveValue('E2E BANANL')

    await page.getByRole('button', { name: 'Use suggestion' }).click()
    await expect(itemName).toHaveValue('E2E Banana')
    await page.getByRole('button', { name: /Applied.*Undo/ }).click()
    await expect(itemName).toHaveValue('E2E BANANL')
  })

  test('adds a manual expense', async ({ page }) => {
    await page.goto('/expenses')
    await page.getByRole('button', { name: 'Add expense' }).click()
    const form = page.getByRole('heading', { name: 'New expense' }).locator('..')
    await form.getByPlaceholder(/Porkkana/).fill('E2E Manual Expense')
    await form.getByPlaceholder('0,00').fill('4,25')
    await form.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByText('E2E Manual Expense', { exact: true })).toBeVisible()
  })

  test('sets a category budget', async ({ page }) => {
    await page.goto('/budgets')
    const row = page
      .getByText('Groceries', { exact: true })
      .locator('xpath=ancestor::div[contains(@class,"px-4")][1]')
    await row.getByRole('button', { name: 'Set limit' }).click()
    await row.getByPlaceholder('0,00').fill('100')
    await row.getByPlaceholder('0,00').press('Enter')

    await expect(row).toContainText('100')
  })

  test('generates reports and renames a reporting item', async ({ page }) => {
    await page.goto('/reports')
    const reportType = page.locator('select').first()
    await reportType.selectOption('expense-breakdown')
    const reportResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/reports/run') && response.request().method() === 'POST',
      { timeout: 60_000 }
    )
    await page.getByRole('button', { name: 'Generate report' }).click()
    expect((await reportResponse).ok()).toBe(true)
    await expect(page.getByText('E2E Onion Seed', { exact: true })).toBeVisible()

    await reportType.selectOption('item-purchases')
    await page.getByPlaceholder('Search reporting items').fill('E2E Onion Seed')
    await page.getByRole('button', { name: 'Manage names' }).click()
    const dialog = page
      .getByRole('heading', { name: 'Manage reporting names' })
      .locator('..')
      .locator('..')
    await dialog.locator('input[name="name"]').fill('E2E Onion Canonical')
    await dialog.getByRole('button', { name: 'Rename' }).click()
    await expect(dialog.locator('input[name="name"]')).toHaveValue('E2E Onion Canonical')
    await expectNoCriticalAccessibilityViolations(page)
  })

  test('creates a savings goal', async ({ page }) => {
    await page.goto('/savings')
    await page.getByRole('button', { name: 'Add goal' }).click()
    await page.getByLabel('Goal name').fill('E2E Emergency Fund')
    await page.getByLabel(/Target amount/).fill('500')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByText('E2E Emergency Fund', { exact: true })).toBeVisible()
  })

  test('creates a person and linked transaction', async ({ page }) => {
    await page.goto('/people')
    await page.getByRole('button', { name: 'Add person' }).click()
    await page.getByPlaceholder(/Mum/).fill('E2E Friend')
    await page.getByPlaceholder('Notes (optional)').fill('Playwright contact')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('heading', { name: 'E2E Friend' })).toBeVisible()

    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await page.getByLabel('Category').selectOption({ index: 1 })
    await page.getByLabel('Amount').fill('12,50')
    await page.getByLabel('Note').fill('E2E shared lunch')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByText('E2E shared lunch', { exact: true })).toBeVisible()
  })

  test('saves a receipt manually and shows it in history', async ({ page }) => {
    await page.goto('/scan')
    await page.getByRole('button', { name: 'Enter items manually' }).click()
    await page.getByPlaceholder('Store name').fill('E2E Market')
    await page.getByPlaceholder('Item name').fill('E2E Receipt Item')
    await page.getByRole('textbox', { name: 'Amount (€): E2E Receipt Item' }).fill('3,75')
    await page.getByPlaceholder('qty').fill('1')
    await page.getByRole('button', { name: 'Save to expenses' }).click()

    await expect(page.getByRole('heading', { name: 'Receipt saved!' })).toBeVisible()
    await page.goto('/receipts')
    await expect(page.getByText('E2E Market', { exact: true })).toBeVisible()
  })
})

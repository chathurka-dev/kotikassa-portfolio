import { expect, test } from '@playwright/test'
import { expectNoCriticalAccessibilityViolations } from './accessibility'

const pages = [
  { path: '/', heading: 'Dashboard' },
  { path: '/expenses', heading: 'Expenses' },
  { path: '/reports', heading: 'Reports' },
  { path: '/scan', heading: 'Add Receipt' },
]

for (const entry of pages) {
  test(`${entry.heading} renders without critical accessibility or viewport failures`, async ({
    page,
  }) => {
    await page.goto(entry.path)
    await expect(page.getByRole('heading', { name: entry.heading }).first()).toBeVisible()
    await expectNoCriticalAccessibilityViolations(page)

    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      content: document.documentElement.scrollWidth,
    }))
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1)
  })
}

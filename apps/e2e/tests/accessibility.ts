import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

export async function expectNoCriticalAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const critical = results.violations.filter((violation) => violation.impact === 'critical')
  expect(critical, JSON.stringify(critical, null, 2)).toEqual([])
}

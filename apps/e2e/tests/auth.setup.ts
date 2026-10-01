import { expect, test as setup } from '@playwright/test'
import { E2E_EMAIL, E2E_PASSWORD } from './fixtures'

setup('authenticate the isolated E2E household', async ({ page }) => {
  setup.setTimeout(120_000)
  await page.goto('/login')
  await page.getByLabel('Email').fill(E2E_EMAIL)
  await page.getByLabel('Password').fill(E2E_PASSWORD)
  const authResponse = page.waitForResponse(
    (response) => response.url().includes('/auth/v1/token') && response.request().method() === 'POST'
  )
  await page.getByRole('button', { name: 'Sign in' }).click()
  expect((await authResponse).ok()).toBe(true)
  await expect
    .poll(async () => (await page.context().cookies()).some((cookie) => cookie.name.startsWith('sb-')))
    .toBe(true)

  await expect(page).toHaveURL('/', { timeout: 90_000 })
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await page.context().storageState({ path: '.auth/user.json' })
})

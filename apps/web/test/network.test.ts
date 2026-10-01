import { HttpResponse, http } from 'msw'
import { expect, it } from 'vitest'
import { server } from './server'

it('uses the shared MSW server for deterministic network responses', async () => {
  server.use(
    http.get('https://test.kotikassa.invalid/health', () => {
      return HttpResponse.json({ ok: true })
    })
  )

  const response = await fetch('https://test.kotikassa.invalid/health')

  expect(response.ok).toBe(true)
  await expect(response.json()).resolves.toEqual({ ok: true })
})

import { NextRequest } from 'next/server'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseServerClient, RECEIPT_SCANNING_CONSENT_VERSION } from '@kotikassa/shared'
import { POST } from './route'

const openAIMocks = vi.hoisted(() => ({
  create: vi.fn(),
  constructor: vi.fn(),
}))

const sentryMocks = vi.hoisted(() => ({
  captureMessage: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({}),
}))

vi.mock('@kotikassa/shared', async (importOriginal) => {
  const original = await importOriginal<typeof import('@kotikassa/shared')>()
  return {
    ...original,
    createSupabaseServerClient: vi.fn(),
  }
})

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: sentryMocks.captureMessage,
  withScope: vi.fn(),
}))

vi.mock('openai', () => {
  class APIConnectionTimeoutError extends Error {}

  class APIError extends Error {
    status?: number
    code?: string | null
    param?: string | null
  }

  class OpenAI {
    static APIConnectionTimeoutError = APIConnectionTimeoutError
    static APIError = APIError

    chat = {
      completions: {
        create: openAIMocks.create,
      },
    }

    constructor(options: unknown) {
      openAIMocks.constructor(options)
    }
  }

  return { default: OpenAI }
})

const USER_ID = '11111111-1111-4111-8111-111111111111'
const FAMILY_ID = '22222222-2222-4222-8222-222222222222'

type SupabaseOptions = {
  authenticated?: boolean
  familyId?: string | null
  consentEnabled?: boolean
  consentVersion?: string
  privacyError?: { message: string } | null
  quotaAllowed?: boolean
  quotaError?: { message: string } | null
  qualityContext?: unknown[]
  qualityContextError?: { message: string } | null
}

function createSupabaseMock(options: SupabaseOptions = {}) {
  const {
    authenticated = true,
    familyId = FAMILY_ID,
    consentEnabled = true,
    consentVersion = RECEIPT_SCANNING_CONSENT_VERSION,
    privacyError = null,
    quotaAllowed = true,
    quotaError = null,
    qualityContext = [],
    qualityContextError = null,
  } = options

  const profileQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn().mockResolvedValue({
      data: familyId ? { family_id: familyId } : null,
      error: null,
    }),
  }
  profileQuery.select.mockReturnValue(profileQuery)
  profileQuery.eq.mockReturnValue(profileQuery)

  const privacyQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        receipt_scanning_enabled: consentEnabled,
        receipt_scanning_consent_version: consentVersion,
      },
      error: privacyError,
    }),
  }
  privacyQuery.select.mockReturnValue(privacyQuery)
  privacyQuery.eq.mockReturnValue(privacyQuery)

  const supabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: authenticated ? { id: USER_ID } : null },
        error: null,
      }),
    },
    from: vi.fn((table: string) => {
      if (table === 'profiles') return profileQuery
      if (table === 'user_privacy_choices') return privacyQuery
      throw new Error(`Unexpected table: ${table}`)
    }),
    rpc: vi.fn((name: string) =>
      Promise.resolve(
        name === 'consume_scan_quota'
          ? { data: quotaAllowed, error: quotaError }
          : { data: qualityContext, error: qualityContextError }
      )
    ),
  }

  vi.mocked(createSupabaseServerClient).mockReturnValue(supabase as never)
  return supabase
}

function scanRequest(bytes?: Uint8Array) {
  const form = new FormData()
  if (bytes) {
    const content = new ArrayBuffer(bytes.length)
    new Uint8Array(content).set(bytes)
    form.set('image', new File([content], 'receipt.jpg', { type: 'image/jpeg' }))
  }
  return new NextRequest('http://localhost/api/scan', {
    method: 'POST',
    body: form,
  })
}

function validCompletion(receiptDateRaw = '31.7.2026') {
  return {
    choices: [
      {
        finish_reason: 'stop',
        message: {
          refusal: null,
          content: JSON.stringify({
            storeName: 'K-Market',
            receiptDateRaw,
            totalAmount: 2.5,
            items: [
              {
                name: 'Sipuli',
                amount: 2.5,
                quantity: 0.5,
                unit: 'kg',
                unitPrice: 5,
                discountAmount: null,
                originalPrice: null,
              },
            ],
          }),
        },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  }
}

describe('receipt scan API', () => {
  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key')
    vi.stubEnv('OPENAI_RECEIPT_MODEL', 'test-receipt-model')
    vi.mocked(createSupabaseServerClient).mockReset()
    openAIMocks.create.mockReset()
    openAIMocks.constructor.mockReset()
    sentryMocks.captureMessage.mockReset()
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('returns unavailable before authentication when the provider is not configured', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await POST(scanRequest())

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ error: 'unavailable' })
    expect(createSupabaseServerClient).not.toHaveBeenCalled()
    expect(openAIMocks.create).not.toHaveBeenCalled()
  })

  it.each([
    ['the session is missing', { authenticated: false }, 401, 'unauthenticated'],
    ['the profile has no household', { familyId: null }, 401, 'unauthenticated'],
    ['current consent is missing', { consentEnabled: false }, 403, 'consent_required'],
    ['consent is outdated', { consentVersion: 'outdated-version' }, 403, 'consent_required'],
  ])('rejects the request when %s', async (_name, options, status, error) => {
    createSupabaseMock(options)

    const response = await POST(scanRequest())

    expect(response.status).toBe(status)
    await expect(response.json()).resolves.toEqual({ error })
    expect(openAIMocks.create).not.toHaveBeenCalled()
  })

  it('rejects unsupported files before consuming quota or calling OpenAI', async () => {
    const supabase = createSupabaseMock()

    const response = await POST(scanRequest(new Uint8Array([0x89, 0x50, 0x4e, 0x47])))

    expect(response.status).toBe(415)
    await expect(response.json()).resolves.toEqual({ error: 'unsupported_format' })
    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(openAIMocks.create).not.toHaveBeenCalled()
  })

  it('enforces the household scan quota before calling OpenAI', async () => {
    createSupabaseMock({ quotaAllowed: false })

    const response = await POST(scanRequest(new Uint8Array([0xff, 0xd8, 0xff, 0x00])))

    expect(response.status).toBe(429)
    await expect(response.json()).resolves.toEqual({ error: 'rate_limited' })
    expect(openAIMocks.create).not.toHaveBeenCalled()
  })

  it.each([
    ['privacy lookup', { privacyError: { message: 'privacy unavailable' } }],
    ['quota lookup', { quotaError: { message: 'quota unavailable' } }],
  ])('returns unavailable when the %s fails', async (_name, options) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    createSupabaseMock(options)

    const response = await POST(scanRequest(new Uint8Array([0xff, 0xd8, 0xff, 0x00])))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ error: 'unavailable' })
    expect(openAIMocks.create).not.toHaveBeenCalled()
  })

  it('uses the mocked provider and returns validated receipt data', async () => {
    const supabase = createSupabaseMock()
    openAIMocks.create.mockResolvedValue(validCompletion())

    const response = await POST(scanRequest(new Uint8Array([0xff, 0xd8, 0xff, 0x00])))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(supabase.rpc).toHaveBeenCalledWith('consume_scan_quota', { p_limit: 20 })
    expect(openAIMocks.constructor).toHaveBeenCalledWith({
      apiKey: 'test-key',
      timeout: 25_000,
      maxRetries: 0,
    })
    expect(openAIMocks.create).toHaveBeenCalledTimes(1)
    expect(openAIMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'test-receipt-model',
        store: false,
        response_format: expect.objectContaining({ type: 'json_schema' }),
      })
    )
    expect(body).toMatchObject({
      storeName: 'K-Market',
      receiptDateRaw: '31.7.2026',
      receiptDate: '2026-07-31',
      totalAmount: 2.5,
      items: [{ name: 'Sipuli', quantity: 0.5, unit: 'kg', amount: 2.5 }],
      scanQuality: { schemaVersion: 'v1', score: 0, level: 'low', warnings: [] },
      scanQualityContext: [],
      scanMeta: {
        provider: 'openai',
        model: 'test-receipt-model',
        promptVersion: 'v14',
        schemaVersion: 'v4',
        inputTokens: 100,
        outputTokens: 50,
      },
    })
  })

  it('keeps a valid scan available when household price history cannot be loaded', async () => {
    createSupabaseMock({ qualityContextError: { message: 'history unavailable' } })
    openAIMocks.create.mockResolvedValue(validCompletion())

    const response = await POST(scanRequest(new Uint8Array([0xff, 0xd8, 0xff, 0x00])))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      scanQualityContext: [],
      scanQuality: { schemaVersion: 'v1' },
    })
  })

  it('normalizes a Finnish single-digit date without swapping its day and month', async () => {
    createSupabaseMock()
    openAIMocks.create.mockResolvedValue(validCompletion('2.8.2026'))

    const response = await POST(scanRequest(new Uint8Array([0xff, 0xd8, 0xff, 0x00])))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      receiptDateRaw: '2.8.2026',
      receiptDate: '2026-08-02',
    })
  })

  it('reports an invalid transcribed date and leaves it for user review', async () => {
    createSupabaseMock()
    openAIMocks.create.mockResolvedValue(validCompletion('31.2.2026'))

    const response = await POST(scanRequest(new Uint8Array([0xff, 0xd8, 0xff, 0x00])))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      receiptDateRaw: '31.2.2026',
      receiptDate: null,
      scanQuality: {
        warnings: [expect.objectContaining({ code: 'date_invalid', fieldName: 'receipt_date' })],
      },
    })
    expect(sentryMocks.captureMessage).toHaveBeenCalledWith(
      'Receipt date normalization failed',
      expect.objectContaining({ level: 'warning' })
    )
  })

  it('maps provider-independent failures to the stable unavailable contract', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    createSupabaseMock()
    openAIMocks.create.mockRejectedValue(new Error('network failed'))

    const response = await POST(scanRequest(new Uint8Array([0xff, 0xd8, 0xff, 0x00])))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ error: 'unavailable' })
  })

  it('rejects invalid model output with a stable error', async () => {
    createSupabaseMock()
    openAIMocks.create.mockResolvedValue({
      choices: [
        {
          finish_reason: 'stop',
          message: { refusal: null, content: '{"items":"not-an-array"}' },
        },
      ],
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await POST(scanRequest(new Uint8Array([0xff, 0xd8, 0xff, 0x00])))

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toEqual({ error: 'invalid_output' })
  })

  it.each([
    [
      'a refusal',
      { finish_reason: 'stop', message: { refusal: 'cannot process', content: null } },
      'refusal',
    ],
    [
      'truncated output',
      { finish_reason: 'length', message: { refusal: null, content: '{}' } },
      'incomplete_output',
    ],
    [
      'a receipt without items',
      {
        finish_reason: 'stop',
        message: {
          refusal: null,
          content: JSON.stringify({
            storeName: null,
            receiptDateRaw: null,
            totalAmount: null,
            items: [],
          }),
        },
      },
      'no_items',
    ],
  ])('maps %s to the stable scan error contract', async (_name, choice, error) => {
    createSupabaseMock()
    openAIMocks.create.mockResolvedValue({ choices: [choice] })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const response = await POST(scanRequest(new Uint8Array([0xff, 0xd8, 0xff, 0x00])))

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toEqual({ error })
  })
})

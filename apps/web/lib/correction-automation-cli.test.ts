import { describe, expect, it } from 'vitest'
import { parseCorrectionAutomationArgs } from './correction-automation-cli'

describe('parseCorrectionAutomationArgs', () => {
  const valid = [
    '--scope',
    'global',
    '--kind',
    'item_name',
    '--holdout-version',
    'holdout-2026-09',
    '--dataset-sha256',
    'a'.repeat(64),
    '--sample-size',
    '200',
    '--correct-count',
    '199',
  ]

  it('parses an explicit fixed-holdout evaluation', () => {
    expect(parseCorrectionAutomationArgs(valid)).toEqual({
      scope: 'global',
      kind: 'item_name',
      holdoutVersion: 'holdout-2026-09',
      datasetSha256: 'a'.repeat(64),
      sampleSize: 200,
      correctCount: 199,
      validDays: 180,
      help: false,
    })
  })

  it('rejects unsupported fields and invalid result counts', () => {
    expect(() =>
      parseCorrectionAutomationArgs(valid.map((value) => (value === 'item_name' ? 'price' : value)))
    ).toThrow(/item_name or store_name/i)
    expect(() =>
      parseCorrectionAutomationArgs(valid.map((value) => (value === '199' ? '201' : value)))
    ).toThrow(/cannot exceed/i)
  })

  it('requires the immutable dataset fingerprint', () => {
    expect(() =>
      parseCorrectionAutomationArgs(
        valid.map((value) => (value === 'a'.repeat(64) ? 'not-a-hash' : value))
      )
    ).toThrow(/SHA-256/i)
  })
})

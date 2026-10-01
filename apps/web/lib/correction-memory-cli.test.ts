import { describe, expect, it } from 'vitest'
import { parseCorrectionMemoryArgs } from './correction-memory-cli'

describe('parseCorrectionMemoryArgs', () => {
  const familyId = '15000000-0000-4000-8000-000000000001'

  it('defaults household backfill to a safe dry run', () => {
    expect(parseCorrectionMemoryArgs(['--family-id', familyId])).toEqual({
      mode: 'household',
      familyId,
      apply: false,
      help: false,
    })
  })

  it('requires an explicit apply flag to write household memory', () => {
    expect(parseCorrectionMemoryArgs(['--family-id', familyId, '--apply']).apply).toBe(true)
  })

  it('keeps global refresh explicit and mutually exclusive', () => {
    expect(parseCorrectionMemoryArgs(['--refresh-global'])).toEqual({
      mode: 'global',
      familyId: null,
      apply: true,
      help: false,
    })
    expect(() => parseCorrectionMemoryArgs(['--refresh-global', '--family-id', familyId])).toThrow(
      /cannot be combined/i
    )
  })
})

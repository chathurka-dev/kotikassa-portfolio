export interface CorrectionMemoryCliOptions {
  mode: 'household' | 'global'
  familyId: string | null
  apply: boolean
  help: boolean
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function parseCorrectionMemoryArgs(argv: string[]): CorrectionMemoryCliOptions {
  let familyId: string | null = null
  let apply = false
  let refreshGlobal = false
  let help = false

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help' || argument === '-h') help = true
    else if (argument === '--apply') apply = true
    else if (argument === '--refresh-global') refreshGlobal = true
    else if (argument === '--family-id') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error('Missing value for --family-id')
      familyId = value
      index += 1
    } else throw new Error(`Unknown option: ${argument}`)
  }

  if (help) return { mode: 'household', familyId: null, apply: false, help: true }
  if (refreshGlobal) {
    if (familyId || apply) {
      throw new Error('--refresh-global cannot be combined with --family-id or --apply')
    }
    return { mode: 'global', familyId: null, apply: true, help: false }
  }
  if (!familyId || !UUID_PATTERN.test(familyId)) {
    throw new Error('Provide one valid --family-id UUID')
  }
  return { mode: 'household', familyId, apply, help: false }
}

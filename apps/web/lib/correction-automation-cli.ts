export type CorrectionAutomationScope = 'household' | 'global'
export type CorrectionAutomationKind = 'item_name' | 'store_name'

export interface CorrectionAutomationEvaluationOptions {
  scope: CorrectionAutomationScope
  kind: CorrectionAutomationKind
  holdoutVersion: string
  datasetSha256: string
  sampleSize: number
  correctCount: number
  validDays: number
  help: boolean
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/i

function requiredValue(argv: string[], index: number, option: string) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${option}`)
  return value
}

function positiveInteger(value: string, option: string) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${option} must be a positive integer`)
  }
  return parsed
}

export function parseCorrectionAutomationArgs(
  argv: string[]
): CorrectionAutomationEvaluationOptions {
  let scope: CorrectionAutomationScope | null = null
  let kind: CorrectionAutomationKind | null = null
  let holdoutVersion = ''
  let datasetSha256 = ''
  let sampleSize: number | null = null
  let correctCount: number | null = null
  let validDays = 180
  let help = false

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument) continue
    if (argument === '--help' || argument === '-h') {
      help = true
      continue
    }

    const value = requiredValue(argv, index, argument)
    index += 1
    if (argument === '--scope') {
      if (value !== 'household' && value !== 'global') {
        throw new Error('--scope must be household or global')
      }
      scope = value
    } else if (argument === '--kind') {
      if (value !== 'item_name' && value !== 'store_name') {
        throw new Error('--kind must be item_name or store_name')
      }
      kind = value
    } else if (argument === '--holdout-version') holdoutVersion = value.trim()
    else if (argument === '--dataset-sha256') datasetSha256 = value.toLowerCase()
    else if (argument === '--sample-size') sampleSize = positiveInteger(value, argument)
    else if (argument === '--correct-count') {
      const parsed = Number(value)
      if (!Number.isSafeInteger(parsed) || parsed < 0) {
        throw new Error('--correct-count must be a non-negative integer')
      }
      correctCount = parsed
    } else if (argument === '--valid-days') validDays = positiveInteger(value, argument)
    else throw new Error(`Unknown option: ${argument}`)
  }

  if (help) {
    return {
      scope: 'household',
      kind: 'item_name',
      holdoutVersion: '',
      datasetSha256: '',
      sampleSize: 1,
      correctCount: 0,
      validDays: 180,
      help: true,
    }
  }
  if (!scope) throw new Error('Provide --scope household or global')
  if (!kind) throw new Error('Provide --kind item_name or store_name')
  if (!holdoutVersion) throw new Error('Provide a non-empty --holdout-version')
  if (!SHA256_PATTERN.test(datasetSha256)) {
    throw new Error('--dataset-sha256 must be a 64-character hexadecimal SHA-256')
  }
  if (sampleSize === null) throw new Error('Provide --sample-size')
  if (correctCount === null) throw new Error('Provide --correct-count')
  if (correctCount > sampleSize) throw new Error('--correct-count cannot exceed --sample-size')
  if (validDays > 365) throw new Error('--valid-days cannot exceed 365')

  return {
    scope,
    kind,
    holdoutVersion,
    datasetSha256,
    sampleSize,
    correctCount,
    validDays,
    help: false,
  }
}

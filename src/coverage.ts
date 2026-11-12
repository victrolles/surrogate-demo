import type { Parameters, PhysicalParameter, TrainingCoverage } from './trajectory'

const fields = {
  l: { label: 'L', unit: 'm' },
  m: { label: 'm', unit: 'kg' },
  b: { label: 'b', unit: 'kg/s' },
  theta0: { label: 'θ₀', unit: 'rad' },
  omega0: { label: 'ω₀', unit: 'rad/s' },
} satisfies Record<PhysicalParameter, { label: string; unit: string }>

export function formatParameter(key: keyof Parameters, value: number) {
  if (key === 'theta0' && Math.abs(value) === Math.PI / 2) {
    return value < 0 ? '−π/2' : 'π/2'
  }
  if (key === 'theta0' && Math.abs(value) === Math.PI) {
    return value < 0 ? '−π' : 'π'
  }
  return value.toLocaleString('fr-FR', { maximumFractionDigits: 4 })
}

type Issue = { key: PhysicalParameter; actual: number; expected: number[] }
type CoverageKind = 'unknown' | 'grid' | 'between' | 'outside' | 'within'

export function getCoverage(
  parameters: Parameters,
  training?: TrainingCoverage | null,
): { kind: CoverageKind; issues: Issue[] } {
  if (!training) return { kind: 'unknown', issues: [] }

  // Absorb floating-point noise without treating a rounded angle as an exact grid point.
  const tolerance = 1e-12
  const outside: Issue[] = []
  const between: Issue[] = []

  for (const key of Object.keys(fields) as PhysicalParameter[]) {
    const actual = parameters[key]
    const values = training.ranges[key]
    const min = Math.min(...values)
    const max = Math.max(...values)
    if (actual < min - tolerance || actual > max + tolerance) {
      outside.push({ key, actual, expected: min === max ? [min] : [min, max] })
    } else if (training.method === 'fixed_sampling' &&
      !values.some(value => Math.abs(value - actual) <= tolerance)) {
      between.push({ key, actual, expected: values })
    }
  }

  if (outside.length) return { kind: 'outside', issues: outside }
  if (between.length) return { kind: 'between', issues: between }
  return { kind: training.method === 'fixed_sampling' ? 'grid' : 'within', issues: [] }
}

export function describeIssue({ key, actual, expected }: Issue, kind: CoverageKind) {
  const { label, unit } = fields[key]
  const formatted = expected.map(value => formatParameter(key, value))
  const target = kind === 'between' ? 'grille ' + formatted.join(' / ') : formatted.join(' à ')
  return `${label} = ${formatParameter(key, actual)} ${unit} · ${target} ${unit}`
}

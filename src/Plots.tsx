import type { Frame, Parameters, Series } from './trajectory'

const seriesLabels = { inference: 'Inférence IA', simulation: 'Simulation physique' }

export function Legend({ series }: { series: Series[] }) {
  return <div className="legend">
    {series.map(name => <span key={name}><i className={name} />{seriesLabels[name]}</span>)}
  </div>
}

type PlotProps = { frames: Frame[]; series: Series[]; duration: number; axis: 0 | 1 }

export function TimePlot({ frames, series, duration, axis }: PlotProps) {
  const angle = axis === 0
  const width = 460, height = 172
  const left = 48, right = 438, top = 10, bottom = 134
  let max = angle ? 2 : 4
  for (const frame of frames) {
    for (const name of series) max = Math.max(max, Math.abs(frame[name]?.[axis] ?? 0) * 1.08)
  }
  const magnitude = 10 ** Math.floor(Math.log10(max))
  const limit = Math.ceil(max / magnitude) * magnitude
  const x = (time: number) => left + (right - left) * time / duration
  const y = (value: number) => top + (bottom - top) * (limit - value) / (2 * limit)
  const format = new Intl.NumberFormat('fr-FR', { maximumSignificantDigits: 3 })

  return <section className="panel chart">
    <div className="chart-header">
      <h2>{angle ? 'Angle' : 'Vitesse angulaire'}</h2>
      <span>{angle ? 'θ · rad' : 'ω · rad/s'}</span>
    </div>
    <svg className="time-plot" viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={angle ? 'Angle en fonction du temps' : 'Vitesse angulaire en fonction du temps'}>
      {[limit, limit / 2, 0, -limit / 2, -limit].map(value => <g key={value}>
        <line x1={left} x2={right} y1={y(value)} y2={y(value)} className={value === 0 ? 'zero' : 'grid'} />
        <text x={left - 9} y={y(value)} textAnchor="end" dominantBaseline="central">{format.format(value)}</text>
      </g>)}
      {[0, 1, 2, 3, 4].map(index => {
        const time = duration * index / 4
        return <g key={index}>
          <line x1={x(time)} x2={x(time)} y1={top} y2={bottom} className="grid" />
          <text x={x(time)} y={bottom + 18} textAnchor="middle">{format.format(time)}</text>
        </g>
      })}
      <text x={(left + right) / 2} y={height - 2} textAnchor="middle">Temps (s)</text>
      {series.map(name => {
        const points = frames.flatMap(frame => {
          const values = frame[name]
          return values ? [`${x(frame.time).toFixed(2)},${y(values[axis]).toFixed(2)}`] : []
        })
        return <polyline key={name} points={points.join(' ')} className={`trace ${name}`} />
      })}
    </svg>
  </section>
}

export function PendulumPlot({ frame, series, parameters }: {
  frame?: Frame
  series: Series[]
  parameters: Parameters
}) {
  const pivot = { x: 360, y: 137 }
  const scale = 80 / Math.max(1, parameters.l / 1.35)
  const radius = parameters.l * scale
  const gridSize = scale / 4
  return <section className="panel pendulum">
    <div className="chart-header">
      <h2>Mouvement du pendule</h2>
      <span>{parameters.l.toLocaleString('fr-FR')} m</span>
    </div>
    <svg className="pendulum-plot" viewBox="0 0 720 270" role="img"
      aria-label="Animation du pendule dans le plan">
      <defs>
        <pattern id="grid" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse" x={pivot.x} y={pivot.y}>
          <path d={`M 0 ${gridSize} V 0 H ${gridSize}`} className="grid" fill="none" />
        </pattern>
      </defs>
      <rect x="15" y="5" width="690" height="260" rx="8" fill="url(#grid)" />
      <line x1="15" x2="705" y1={pivot.y} y2={pivot.y} className="grid zero" />
      <line x1={pivot.x} x2={pivot.x} y1="5" y2="265" className="grid zero" />
      <circle cx={pivot.x} cy={pivot.y} r={radius} className="orbit" />
      {series.map(name => {
        const theta = frame?.[name]?.[0] ?? parameters.theta0
        const x = pivot.x + radius * Math.sin(theta)
        const y = pivot.y + radius * Math.cos(theta)
        return <g key={name} className={name}>
          <line x1={pivot.x} y1={pivot.y} x2={x} y2={y} className="rod" />
          <circle cx={x} cy={y} r={name === 'simulation' ? 10 : 7} className="bob" />
        </g>
      })}
      <circle cx={pivot.x} cy={pivot.y} r="4" className="pivot" />
    </svg>
  </section>
}

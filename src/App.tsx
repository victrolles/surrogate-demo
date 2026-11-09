import { useEffect, useState } from 'react'
import { describeIssue, formatParameter, getCoverage } from './coverage'
import { Legend, PendulumPlot, TimePlot } from './Plots'
import { defaults, useTrajectory } from './trajectory'
import type { Mode, Model, Parameters, Series } from './trajectory'

const pages = {
  simulation: {
    title: 'Simulation physique',
    description: 'Explore l’effet des paramètres et des conditions initiales sur le mouvement.',
  },
  inference: {
    title: 'Inférence IA',
    description: 'Observe comment un modèle surrogate prédit la trajectoire, un état à la fois.',
  },
  comparison: {
    title: 'Comparaison',
    description: 'Superpose la référence physique et la prédiction IA à partir du même état initial.',
  },
}

const sliders: { key: keyof Parameters; label: string; unit: string; min: number; max: number; step: number }[] = [
  { key: 'duration', label: 'Durée', unit: 's', min: 1, max: 30, step: 1 },
  { key: 'l', label: 'Longueur L', unit: 'm', min: 0.25, max: 3, step: 0.05 },
  { key: 'm', label: 'Masse m', unit: 'kg', min: 0.25, max: 3, step: 0.05 },
  { key: 'b', label: 'Amortissement b', unit: 'kg/s', min: 0, max: 1, step: 0.01 },
  { key: 'theta0', label: 'Angle initial θ₀', unit: 'rad', min: -3.14, max: 3.14, step: 0.01 },
  { key: 'omega0', label: 'Vitesse initiale ω₀', unit: 'rad/s', min: -4, max: 4, step: 0.05 },
]

const comparisonPresets: { label: string; parameters: Parameters }[] = [
  {
    label: 'Bon accord',
    parameters: { duration: 10, l: 2, m: 1.5, b: 0.3, theta0: -Math.PI / 2, omega0: 1 },
  },
  {
    label: 'Forte divergence',
    parameters: { duration: 10, l: 0.4, m: 1, b: 0.1, theta0: 2.6, omega0: -2 },
  },
]

const coverageLabels = {
  unknown: 'Couverture inconnue',
  grid: 'Sur la grille',
  between: 'Entre les points de la grille',
  outside: 'Hors domaine',
  within: 'Dans le domaine',
}

const coverageNotes = {
  unknown: 'Ce checkpoint ne documente pas son domaine d’entraînement.',
  grid: 'La combinaison figure dans la grille d’entraînement.',
  between: 'Les valeurs restent dans les bornes du dataset fixe.',
  outside: 'Ces paramètres dépassent le domaine d’entraînement.',
  within: 'Les paramètres sont dans les plages de tirage du dataset aléatoire.',
}

const statusText = {
  idle: 'Prêt',
  connecting: 'Connexion…',
  running: 'En cours',
  stopping: 'Arrêt en cours…',
  finished: 'Terminé',
  stopped: 'Arrêté',
  error: 'Erreur',
}

const number = (value: number, digits = 2) =>
  value.toLocaleString('fr-FR', { maximumFractionDigits: digits })

function CoverageBadge({ model, parameters }: { model: Model; parameters: Parameters }) {
  const { kind, issues } = getCoverage(parameters, model.training_coverage)
  return <div className="coverage" data-coverage={kind}>
    <div className="coverage-heading" role="status">
      <span>Scénario sélectionné</span>
      <strong>{coverageLabels[kind]}</strong>
    </div>
    <p>{coverageNotes[kind]}</p>
    {issues.length > 0 && <ul>
      {issues.map(issue => <li key={issue.key}>{describeIssue(issue, kind)}</li>)}
    </ul>}
  </div>
}

function ModelDetails({ model }: { model: Model }) {
  return <dl className="model-details">
    <div><dt>Architecture</dt><dd>5 → {Array(model.num_hidden_layers).fill(model.hidden_size).join(' → ')} → 2</dd></div>
    <div><dt>Activation</dt><dd>ReLU</dd></div>
    <div><dt>Paramètres</dt><dd>{number(model.parameter_count)}</dd></div>
    <div><dt>Pas appris</dt><dd>{number(1000 / model.sample_hz, 1)} ms</dd></div>
    <div><dt>Taux d’apprentissage</dt><dd>{number(model.learning_rate, 6)}</dd></div>
    <div><dt>Entraînement</dt><dd>{model.epochs} époques</dd></div>
    <div><dt>Jeu d’entraînement</dt><dd>{model.training_trajectories} trajectoires</dd></div>
    <div><dt>Run</dt><dd><code>{model.id}</code></dd></div>
  </dl>
}

export default function App() {
  const [mode, setMode] = useState<Mode>('simulation')
  const [parameters, setParameters] = useState(defaults)
  const [models, setModels] = useState<Model[] | null>(null)
  const [modelId, setModelId] = useState('')
  const [catalogError, setCatalogError] = useState('')
  const [catalogVersion, setCatalogVersion] = useState(0)
  const trajectory = useTrajectory()

  useEffect(() => {
    const controller = new AbortController()
    async function loadModels() {
      try {
        const response = await fetch('/api/models', {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
        })
        if (!response.ok) throw new Error()
        setModels(await response.json() as Model[])
      } catch {
        if (!controller.signal.aborted) setCatalogError('Le catalogue est indisponible.')
      }
    }
    void loadModels()
    return () => controller.abort()
  }, [catalogVersion])

  const selectedModel = models?.find(model => model.id === modelId) ?? models?.[0]
  const frame = trajectory.frames.at(-1)
  const inputs = mode === 'inference' ? defaults : parameters
  const displayedInputs = trajectory.run ?? inputs
  const series: Series[] = mode === 'comparison'
    ? ['inference', 'simulation']
    : [mode === 'simulation' ? 'simulation' : 'inference']

  function switchMode(next: Mode) {
    if (next === mode) return
    trajectory.reset()
    setMode(next)
  }

  return <>
    <header className="topbar">
      <div className="topbar-inner">
        <div className="wordmark"><span className="mark" aria-hidden="true">θ</span>Surrogate Demo</div>
        <nav aria-label="Modes du laboratoire">
          {(Object.keys(pages) as Mode[]).map(key => <button key={key} type="button"
            aria-current={mode === key ? 'page' : undefined} onClick={() => switchMode(key)}>
            {pages[key].title}
          </button>)}
        </nav>
      </div>
    </header>

    <main className="workspace">
      <div className="heading">
        <div>
          <p className="eyebrow">Laboratoire du pendule amorti</p>
          <h1>{pages[mode].title}</h1>
          <p>{pages[mode].description}</p>
        </div>
        <div className="status" data-status={trajectory.status} role="status">
          <span aria-hidden="true" />{statusText[trajectory.status]}
        </div>
      </div>

      <div className="dashboard">
        <aside className="panel controls">
          <form onSubmit={event => {
            event.preventDefault()
            trajectory.start({ ...inputs, mode, model_id: mode === 'simulation' ? undefined : selectedModel?.id })
          }}>
            {mode !== 'inference' && <fieldset disabled={trajectory.busy}>
              <legend>Paramètres physiques</legend>
              {mode === 'comparison' && <div className="scenario-picker">
                <span>Exemples avec les modèles fournis</span>
                <div>
                  {comparisonPresets.map(preset => <button key={preset.label} className="secondary" type="button"
                    onClick={() => { setParameters(preset.parameters); trajectory.reset() }}>
                    {preset.label}
                  </button>)}
                </div>
              </div>}
              {sliders.map(({ key, label, unit, min, max, step }) => <label className="slider" key={key}>
                <span>{label}<span className="slider-value">{formatParameter(key, parameters[key])} {unit}</span></span>
                <input type="range" min={min} max={max} step={step} value={parameters[key]}
                  aria-label={label}
                  aria-valuetext={formatParameter(key, parameters[key]) + ' ' + unit}
                  list={key === 'theta0' ? 'angle-grid' : undefined}
                  onChange={event => {
                    const value = event.target.valueAsNumber
                    const angleGridPoint = key === 'theta0' && Math.abs(value) === 1.57
                    setParameters({ ...parameters, [key]: angleGridPoint ? Math.sign(value) * Math.PI / 2 : value })
                  }} />
              </label>)}
              <datalist id="angle-grid">
                <option value="-1.57" label="−π/2" />
                <option value="1.57" label="π/2" />
              </datalist>
            </fieldset>}

            {mode !== 'simulation' && <fieldset disabled={trajectory.busy}>
              <legend>Modèle surrogate</legend>
              {selectedModel ? <>
                <label className="model-select">Checkpoint
                  <select value={selectedModel.id} onChange={event => setModelId(event.target.value)}>
                    {models?.map(model => <option value={model.id} key={model.id}>{model.label}</option>)}
                  </select>
                </label>
                <CoverageBadge model={selectedModel} parameters={inputs} />
                <ModelDetails model={selectedModel} />
              </> : <>
                <p className="help" role="status">
                  {catalogError || (models ? 'Aucun checkpoint disponible.' : 'Chargement des modèles…')}
                </p>
                {(catalogError || models) && <button className="secondary" type="button" onClick={() => {
                  setCatalogError('')
                  setModels(null)
                  setCatalogVersion(value => value + 1)
                }}>Actualiser le catalogue</button>}
              </>}
              {mode === 'inference' && <div className="preset">
                <strong>Scénario de référence</strong>
                <span>10 s · L 1 m · m 1 kg · b 0,1 kg/s</span>
                <span>θ₀ {formatParameter('theta0', defaults.theta0)} rad · ω₀ 0 rad/s</span>
              </div>}
            </fieldset>}

            <div className="actions">
              {trajectory.busy
                ? <button type="button" className="secondary" onClick={trajectory.stop}
                    disabled={trajectory.status === 'stopping'}>Arrêter</button>
                : <button type="submit" className="primary"
                    disabled={mode !== 'simulation' && !selectedModel}>{trajectory.run ? 'Relancer' : 'Lancer'}</button>}
              {mode !== 'inference' && <button type="button" className="secondary" disabled={trajectory.busy}
                onClick={() => { setParameters(defaults); trajectory.reset() }}>Réinitialiser</button>}
            </div>
            {trajectory.error && <p className="error" role="alert">{trajectory.error}</p>}
          </form>
        </aside>

        <div className="viewer">
          <div className="viewer-bar">
            <Legend series={series} />
            <div className="clock">
              {number(frame?.time ?? 0)} / {displayedInputs.duration} s
              {trajectory.sampleHz && <span> · {trajectory.sampleHz} Hz</span>}
            </div>
          </div>
          <div className="charts">
            <TimePlot frames={trajectory.frames} series={series} duration={displayedInputs.duration} axis={0} />
            <TimePlot frames={trajectory.frames} series={series} duration={displayedInputs.duration} axis={1} />
          </div>
          <PendulumPlot frame={frame} series={series} parameters={displayedInputs} />
          {mode === 'comparison' && <section className="panel metrics" aria-label="Erreurs moyennes absolues">
            <div><h2>Erreur moyenne absolue</h2><span>Depuis le premier pas</span></div>
            <div><span>Angle θ</span><strong>{frame?.mae ? `${number(frame.mae[0], 4)} rad` : '—'}</strong></div>
            <div><span>Vitesse ω</span><strong>{frame?.mae ? `${number(frame.mae[1], 4)} rad/s` : '—'}</strong></div>
          </section>}
        </div>
      </div>
    </main>
  </>
}

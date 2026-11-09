import { useEffect, useRef, useState } from 'react'

export type Mode = 'simulation' | 'inference' | 'comparison'

export type Parameters = {
  duration: number
  l: number
  m: number
  b: number
  theta0: number
  omega0: number
}

export type PhysicalParameter = Exclude<keyof Parameters, 'duration'>

export type TrainingCoverage = {
  method: 'fixed_sampling' | 'random_sampling'
  ranges: Record<PhysicalParameter, number[]>
}

export type Model = {
  id: string
  label: string
  hidden_size: number
  num_hidden_layers: number
  parameter_count: number
  sample_hz: number
  learning_rate: number
  epochs: number
  training_trajectories: number
  training_coverage?: TrainingCoverage | null
}

export type Run = Parameters & { mode: Mode; model_id?: string }
type Pair = [number, number]
export type Series = 'simulation' | 'inference'
export type Frame = {
  type: 'frame'
  index: number
  time: number
  simulation?: Pair
  inference?: Pair
  mae?: Pair
}
type Message = Frame
  | { type: 'started'; sample_hz: number }
  | { type: 'finished' | 'stopped' }
  | { type: 'error'; message: string }

type Status = 'idle' | 'connecting' | 'running' | 'stopping' | 'finished' | 'stopped' | 'error'

export const defaults: Parameters = { duration: 10, l: 1, m: 1, b: 0.1, theta0: Math.PI / 2, omega0: 0 }

export function useTrajectory() {
  const socket = useRef<WebSocket | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [frames, setFrames] = useState<Frame[]>([])
  const [run, setRun] = useState<Run | null>(null)
  const [error, setError] = useState('')
  const [sampleHz, setSampleHz] = useState<number | null>(null)
  const busy = status === 'connecting' || status === 'running' || status === 'stopping'

  function detach() {
    const previous = socket.current
    socket.current = null
    previous?.close()
  }

  useEffect(() => detach, [])

  function reset() {
    detach()
    setFrames([])
    setRun(null)
    setSampleHz(null)
    setError('')
    setStatus('idle')
  }

  function start(request: Run) {
    reset()
    setRun(request)
    setStatus('connecting')
    const endpoint = new URL('/api/trajectory', window.location.href)
    endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:'
    const connection = new WebSocket(endpoint)
    socket.current = connection

    connection.onopen = () => {
      if (socket.current === connection) connection.send(JSON.stringify(request))
    }
    connection.onmessage = ({ data }) => {
      if (socket.current !== connection) return
      const message = JSON.parse(data) as Message
      switch (message.type) {
        case 'started':
          setSampleHz(message.sample_hz)
          setStatus(previous => previous === 'stopping' ? previous : 'running')
          break
        case 'frame':
          setFrames(previous => [...previous, message])
          break
        case 'finished':
        case 'stopped':
          setStatus(message.type)
          detach()
          break
        case 'error':
          setError(message.message)
          setStatus('error')
          detach()
          break
      }
    }
    connection.onclose = () => {
      if (socket.current !== connection) return
      socket.current = null
      setError('Connexion au serveur interrompue. Vérifie que npm run dev est actif.')
      setStatus('error')
    }
  }

  function stop() {
    const connection = socket.current
    if (connection?.readyState === WebSocket.OPEN) {
      setStatus('stopping')
      connection.send(JSON.stringify({ type: 'stop' }))
    } else {
      detach()
      setStatus('stopped')
    }
  }

  return { status, frames, run, error, sampleHz, busy, start, stop, reset }
}

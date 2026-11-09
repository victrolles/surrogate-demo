import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const virtualPython = process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python'
const python = process.env.SURROGATE_PYTHON || fileURLToPath(new URL(virtualPython, root))

if (!process.env.SURROGATE_PYTHON && !existsSync(python)) {
  console.error('Environnement Python absent. Suis la procédure d’installation du README.')
  process.exit(1)
}

const args = process.argv.includes('--test')
  ? ['-m', 'unittest', 'discover', '-s', 'tests', '-v']
  : ['-m', 'uvicorn', 'server.app:app', '--host', '127.0.0.1', '--port', '8001', '--reload', '--reload-dir', 'server']

const child = spawn(python, args, { cwd: root, stdio: 'inherit' })
child.on('error', (error) => {
  console.error(error.message)
  process.exitCode = 1
})
child.on('exit', (code) => {
  process.exitCode = code ?? 1
})
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const proxy = {
  '/api': {
    target: 'http://127.0.0.1:8001',
    changeOrigin: true,
    ws: true,
    rewrite: (path: string) => path.replace(/^\/api/, ''),
  },
}

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5174, strictPort: true, proxy },
  preview: { host: '127.0.0.1', port: 5174, strictPort: true, proxy },
})

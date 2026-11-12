const base = (import.meta.env.VITE_API_BASE_URL?.trim() || '/api').replace(/\/+$/, '')

export function apiUrl(path: string) {
  return new URL(base + path, window.location.origin)
}

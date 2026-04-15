import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

function safeLog(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  data?: unknown
) {
  try {
    window.glaia?.log?.[level]?.(message, data)
  } catch {
    // swallow
  }
}

window.addEventListener('error', (event) => {
  safeLog('error', 'window.error', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error ? String(event.error) : undefined,
  })
})

window.addEventListener('unhandledrejection', (event) => {
  safeLog('error', 'unhandledrejection', {
    reason: event.reason ? String(event.reason) : undefined,
  })
})

const rootEl = document.getElementById('root')
if (!rootEl) {
  safeLog('error', 'root element not found')
  throw new Error('Root element #root not found')
}

safeLog('info', 'renderer mounting')

try {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
  safeLog('info', 'renderer mounted')
} catch (e) {
  safeLog('error', 'render failed', { error: String(e) })
  throw e
}

/**
 * Cross-process structured logger.
 *
 * In main, log lines go to stdout/stderr with ANSI colors and tags.
 * In preload/renderer, log entries get forwarded to main via IPC and
 * then printed by the same formatter.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogRecord {
  level: LogLevel
  scope: string
  message: string
  data?: unknown
  ts: string
}

export const LOG_IPC_CHANNEL = 'glaia:log'

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

function colorFor(level: LogLevel): string {
  switch (level) {
    case 'debug':
      return '\x1b[90m' // gray
    case 'info':
      return '\x1b[36m' // cyan
    case 'warn':
      return '\x1b[33m' // yellow
    case 'error':
      return '\x1b[31m' // red
  }
}

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'

export function formatRecord(record: LogRecord, useColor: boolean): string {
  const time = record.ts.slice(11, 23)
  const lvl = record.level.toUpperCase().padEnd(5)
  const scope = `[${record.scope}]`
  if (!useColor) {
    return `${time} ${lvl} ${scope} ${record.message}`
  }
  const color = colorFor(record.level)
  return `${BOLD}${time}${RESET} ${color}${lvl}${RESET} ${BOLD}${scope}${RESET} ${record.message}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function shouldEmit(level: LogLevel, threshold: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[threshold]
}

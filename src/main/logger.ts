import { inspect } from 'util'
import { appendFileSync, mkdirSync, readFileSync } from 'fs'
import { dirname } from 'path'
import {
  formatRecord,
  nowIso,
  shouldEmit,
  type LogLevel,
  type LogRecord,
} from '../shared/logger'

const ENV_LEVEL = (process.env['GLAIA_LOG_LEVEL'] ?? 'debug') as LogLevel
const USE_COLOR = process.stdout.isTTY === true
const MAX_SNAPSHOT_BYTES = 12_000
let logFilePath: string | null = null

function stringify(data: unknown, useColor = USE_COLOR): string {
  if (data === undefined) return ''
  if (typeof data === 'string') return data
  return inspect(data, { depth: 5, colors: useColor, breakLength: 120 })
}

function writeFileLine(line: string): void {
  if (!logFilePath) return
  try {
    appendFileSync(logFilePath, line + '\n', 'utf8')
  } catch {
    // Keep logging best-effort; logging must never break the app.
  }
}

function emit(record: LogRecord): void {
  if (!shouldEmit(record.level, ENV_LEVEL)) return
  const line = formatRecord(record, USE_COLOR)
  const fileLine = formatRecord(record, false)
  const stream = record.level === 'error' || record.level === 'warn'
    ? process.stderr
    : process.stdout
  stream.write(line + '\n')
  writeFileLine(fileLine)
  if (record.data !== undefined) {
    const data = '  ' + stringify(record.data)
    const fileData = '  ' + stringify(record.data, false)
    stream.write(data + '\n')
    writeFileLine(fileData)
  }
}

export function configureFileLogging(filePath: string): void {
  logFilePath = filePath
  try {
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileLine(`--- Glaia log started ${nowIso()} ---`)
  } catch {
    logFilePath = null
  }
}

export function getLogFilePath(): string | null {
  return logFilePath
}

export function readLogSnapshot(): string {
  if (!logFilePath) return ''
  try {
    const content = readFileSync(logFilePath, 'utf8')
    if (content.length <= MAX_SNAPSHOT_BYTES) return content
    return content.slice(content.length - MAX_SNAPSHOT_BYTES)
  } catch {
    return ''
  }
}

export interface Logger {
  debug(message: string, data?: unknown): void
  info(message: string, data?: unknown): void
  warn(message: string, data?: unknown): void
  error(message: string, data?: unknown): void
  child(scope: string): Logger
  ingest(record: LogRecord): void
}

export function createLogger(scope: string): Logger {
  const log = (level: LogLevel) => (message: string, data?: unknown) => {
    const record: LogRecord = { level, scope, message, ts: nowIso() }
    if (data !== undefined) record.data = data
    emit(record)
  }
  return {
    debug: log('debug'),
    info: log('info'),
    warn: log('warn'),
    error: log('error'),
    child: (sub: string) => createLogger(`${scope}:${sub}`),
    ingest: (record: LogRecord) => emit(record),
  }
}

export const rootLogger = createLogger('glaia')
